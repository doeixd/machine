import { describe, it, expect, vi } from 'vitest';
import {
  Actor,
  BaseMachine,
  createMachine,
  createPersistedActor,
  persistentMachine,
  type Persistence,
  type PersistenceStorage
} from '../src/index';

// =============================================================================
// FIXTURES
// =============================================================================

type CounterContext = { count: number };

const createCounter = (count = 0) => createMachine({ count } as CounterContext, (next) => ({
  increment() {
    return next({ count: this.context.count + 1 });
  },
  add(n: number) {
    return next({ count: this.context.count + n });
  }
}));

type CounterMachine = ReturnType<typeof createCounter>;

const counterPersistence = (
  storage: PersistenceStorage<CounterContext>
): Persistence<CounterMachine, CounterContext> => ({
  ...storage,
  encode: (machine) => machine.context,
  decode: (context) => createCounter(context.count)
});

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** In-memory storage whose writes complete immediately. */
function createMemoryStorage<P>(stored?: P) {
  let value: P | undefined = stored;
  const saves: P[] = [];
  return {
    saves,
    get stored() { return value; },
    load: vi.fn(() => value),
    save: vi.fn((v: P) => { saves.push(v); value = v; })
  };
}

/** Storage whose writes block until explicitly resolved, one gate per save call. */
function createGatedStorage<P>(stored?: P) {
  let value: P | undefined = stored;
  let inFlight = 0;
  let maxInFlight = 0;
  const saves: P[] = [];
  const gates: Array<{ value: P; gate: ReturnType<typeof deferred> }> = [];
  return {
    gates,
    saves,
    get stored() { return value; },
    get maxInFlight() { return maxInFlight; },
    load: () => value,
    save: (v: P) => {
      saves.push(v);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const gate = deferred();
      gates.push({ value: v, gate });
      return gate.promise.then(() => { inFlight -= 1; value = v; });
    },
    async resolveNextSave(timeoutMs = 1000) {
      const started = Date.now();
      while (gates.length === 0) {
        if (Date.now() - started > timeoutMs) throw new Error('No pending save appeared.');
        await new Promise((r) => setTimeout(r, 0));
      }
      const pending = gates.shift()!;
      pending.gate.resolve();
      await pending.gate.promise;
    }
  };
}

/** Resolves with the first published snapshot matching `predicate`. */
function waitForSnapshot<M extends BaseMachine<any>>(
  actor: Actor<M>,
  predicate: (snapshot: M) => boolean,
  timeoutMs = 1000
): Promise<M> {
  const current = actor.getSnapshot();
  if (predicate(current)) return Promise.resolve(current);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('Timed out waiting for snapshot.'));
    }, timeoutMs);
    const unsubscribe = actor.subscribe((snapshot) => {
      if (predicate(snapshot)) {
        clearTimeout(timer);
        unsubscribe();
        resolve(snapshot);
      }
    });
  });
}

// =============================================================================
// TESTS
// =============================================================================

describe('createPersistedActor', () => {
  describe('restoration', () => {
    it('seeds storage with the initial snapshot when storage is empty', async () => {
      const storage = createMemoryStorage<CounterContext>();
      const actor = await createPersistedActor(createCounter(), counterPersistence(storage));

      expect(actor.getSnapshot().context.count).toBe(0);
      expect(storage.stored).toEqual({ count: 0 });
      expect(storage.save).toHaveBeenCalledTimes(1);
    });

    it('restores the persisted snapshot instead of the initial one', async () => {
      const storage = createMemoryStorage<CounterContext>({ count: 41 });
      const actor = await createPersistedActor(createCounter(99), counterPersistence(storage));

      expect(actor.getSnapshot().context.count).toBe(41);
      // No seed write: the stored value was already durable.
      expect(storage.save).not.toHaveBeenCalled();
    });

    it('supports asynchronous load', async () => {
      const gate = deferred<CounterContext | undefined>();
      const storage: PersistenceStorage<CounterContext> = {
        load: () => gate.promise,
        save: () => { /* no-op */ }
      };

      let settled = false;
      const pending = createPersistedActor(createCounter(), counterPersistence(storage))
        .then((actor) => { settled = true; return actor; });

      expect(settled).toBe(false);
      gate.resolve({ count: 7 });

      const actor = await pending;
      expect(actor.getSnapshot().context.count).toBe(7);
    });

    it('rejects when decode does not produce a machine', async () => {
      const storage = createMemoryStorage<CounterContext>({ count: 1 });
      await expect(createPersistedActor(createCounter(), {
        ...storage,
        encode: (machine: CounterMachine) => machine.context,
        decode: () => ({ not: 'a machine' }) as unknown as CounterMachine
      })).rejects.toThrow(TypeError);
    });

    it('rejects when decode throws', async () => {
      const failure = new Error('corrupt data');
      const storage = createMemoryStorage<CounterContext>({ count: 1 });
      await expect(createPersistedActor(createCounter(), {
        ...storage,
        encode: (machine: CounterMachine) => machine.context,
        decode: () => { throw failure; }
      })).rejects.toBe(failure);
    });
  });

  describe('durable commit protocol', () => {
    it('publishes only after the durable write resolves', async () => {
      const storage = createGatedStorage<CounterContext>();
      const pending = createPersistedActor(createCounter(), counterPersistence(storage));
      await storage.resolveNextSave(); // seed write
      const actor = await pending;

      const observer = vi.fn();
      actor.subscribe(observer);

      actor.send.increment();

      // The transition produced a snapshot, but the save is still pending:
      // nothing may become visible yet.
      expect(actor.getSnapshot().context.count).toBe(0);
      expect(observer).not.toHaveBeenCalled();
      expect(storage.gates).toHaveLength(1);

      await storage.resolveNextSave();
      await waitForSnapshot(actor, (s) => s.context.count === 1);

      expect(observer).toHaveBeenCalledTimes(1);
      expect(storage.stored).toEqual({ count: 1 });
    });

    it('encodes exactly the snapshot being committed', async () => {
      const storage = createMemoryStorage<CounterContext>();
      const actor = await createPersistedActor(createCounter(), counterPersistence(storage));

      actor.send.add(5);
      await waitForSnapshot(actor, (s) => s.context.count === 5);

      expect(storage.saves).toEqual([{ count: 0 }, { count: 5 }]);
    });

    it('keeps the last durable state when a write fails, then continues the mailbox', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      let failWrites = false;
      let value: CounterContext | undefined;
      const storage: PersistenceStorage<CounterContext> = {
        load: () => value,
        save: (v) => {
          if (failWrites) return Promise.reject(new Error('write failed'));
          value = v;
          return Promise.resolve();
        }
      };

      const actor = await createPersistedActor(createCounter(), counterPersistence(storage));

      failWrites = true;
      actor.send.increment();
      // Give the mailbox a chance to attempt the failing commit.
      await new Promise((r) => setTimeout(r, 10));

      expect(actor.getSnapshot().context.count).toBe(0);
      expect(value).toEqual({ count: 0 });
      expect(error).toHaveBeenCalledWith(
        "[Actor] Commit failed for transition 'increment':",
        expect.any(Error)
      );

      failWrites = false;
      actor.send.increment();
      await waitForSnapshot(actor, (s) => s.context.count === 1);
      expect(value).toEqual({ count: 1 });

      error.mockRestore();
    });

    it('treats a throwing encode as a failed commit and does not publish', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const storage = createMemoryStorage<CounterContext>();
      const persistence = counterPersistence(storage);
      const actor = await createPersistedActor(createCounter(), persistence);

      persistence.encode = () => { throw new Error('cannot encode'); };
      actor.send.increment();
      await new Promise((r) => setTimeout(r, 10));

      expect(actor.getSnapshot().context.count).toBe(0);
      expect(error).toHaveBeenCalledWith(
        "[Actor] Commit failed for transition 'increment':",
        expect.any(Error)
      );
      error.mockRestore();
    });

    it('serializes commits in mailbox order', async () => {
      const storage = createGatedStorage<CounterContext>();
      const pending = createPersistedActor(createCounter(), counterPersistence(storage));
      await storage.resolveNextSave();
      const actor = await pending;

      actor.send.increment();
      actor.send.increment();
      actor.send.add(10);

      // Each save only starts once the previous one resolved.
      await storage.resolveNextSave(); // count 1
      await storage.resolveNextSave(); // count 2
      await storage.resolveNextSave(); // count 12

      const snapshot = await waitForSnapshot(actor, (s) => s.context.count === 12);
      expect(snapshot.context.count).toBe(12);
      expect(storage.saves).toEqual([{ count: 0 }, { count: 1 }, { count: 2 }, { count: 12 }]);
      expect(storage.maxInFlight).toBe(1);
      expect(storage.stored).toEqual({ count: 12 });
    });

    it('commits async transitions through the same durable path', async () => {
      const storage = createMemoryStorage<CounterContext>();
      const asyncCounter = () => createMachine({ count: 0 } as CounterContext, (next) => ({
        async delayedAdd(n: number) {
          await new Promise((r) => setTimeout(r, 5));
          return next({ count: this.context.count + n });
        }
      }));

      const actor = await createPersistedActor(asyncCounter(), {
        ...storage,
        encode: (machine) => machine.context,
        decode: (context) => asyncCounter().add ? createMachine(context, (nextFn) => ({
          async delayedAdd(n: number) {
            await new Promise((r) => setTimeout(r, 5));
            return nextFn({ count: this.context.count + n });
          }
        })) : asyncCounter()
      });

      actor.send.delayedAdd(3);
      await waitForSnapshot(actor, (s) => s.context.count === 3);

      expect(storage.saves).toEqual([{ count: 0 }, { count: 3 }]);
    });

    it('ignores an in-flight commit after stop()', async () => {
      const storage = createGatedStorage<CounterContext>();
      const pending = createPersistedActor(createCounter(), counterPersistence(storage));
      await storage.resolveNextSave();
      const actor = await pending;

      actor.send.increment();
      actor.stop();
      await storage.resolveNextSave();
      await new Promise((r) => setTimeout(r, 10));

      // The write became durable, but a stopped actor never publishes it.
      expect(storage.stored).toEqual({ count: 1 });
      expect(actor.getSnapshot().context.count).toBe(0);
    });

    it('works through event-style dispatch', async () => {
      const storage = createMemoryStorage<CounterContext>();
      const actor = await createPersistedActor(createCounter(), counterPersistence(storage));

      actor.ref.send({ type: 'add', args: [4] });
      await waitForSnapshot(actor, (s) => s.context.count === 4);

      expect(storage.stored).toEqual({ count: 4 });
    });
  });
});

describe('persistentMachine', () => {
  type AuthContext = { status: 'loggedOut' } | { status: 'loggedIn'; user: string };

  const createLoggedOut = (ctx: AuthContext = { status: 'loggedOut' }) =>
    createMachine(ctx, () => ({
      login(user: string) {
        return createLoggedIn({ status: 'loggedIn', user });
      }
    }));

  const createLoggedIn = (ctx: AuthContext) =>
    createMachine(ctx, () => ({
      logout() {
        return createLoggedOut();
      }
    }));

  const Auth = persistentMachine({
    initial: () => createLoggedOut(),
    states: {
      loggedOut: (ctx: AuthContext) => createLoggedOut(ctx),
      loggedIn: (ctx: AuthContext) => createLoggedIn(ctx)
    },
    discriminant: (ctx: AuthContext) => ctx.status
  });

  it('restores the correct typestate via the discriminant', async () => {
    const storage = createMemoryStorage<AuthContext>({ status: 'loggedIn', user: 'ada' });
    const actor = await createPersistedActor(Auth, storage);

    const snapshot = actor.getSnapshot();
    expect(snapshot.context).toEqual({ status: 'loggedIn', user: 'ada' });
    expect(typeof (snapshot as any).logout).toBe('function');
    expect((snapshot as any).login).toBeUndefined();
  });

  it('round-trips: transitions on a restored actor persist the next state', async () => {
    const storage = createMemoryStorage<AuthContext>({ status: 'loggedIn', user: 'ada' });
    const actor = await createPersistedActor(Auth, storage);

    (actor.send as any).logout();
    await waitForSnapshot(actor, (s) => s.context.status === 'loggedOut');

    expect(storage.stored).toEqual({ status: 'loggedOut' });
  });

  it('seeds storage from the definition initial snapshot', async () => {
    const storage = createMemoryStorage<AuthContext>();
    const actor = await createPersistedActor(Auth, storage);

    expect(actor.getSnapshot().context).toEqual({ status: 'loggedOut' });
    expect(storage.stored).toEqual({ status: 'loggedOut' });
  });

  it('throws a descriptive error for an unknown discriminant', () => {
    expect(() => Auth.decode({ status: 'mystery' } as unknown as AuthContext))
      .toThrow('[PersistedActor] No state factory found for discriminant "mystery".');
  });
});
