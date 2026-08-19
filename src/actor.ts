import {
  Event,
  BaseMachine,
  TransitionNames,
  TransitionArgs,
  MaybePromise,
  createMachine
} from './index';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Minimal reference shared by machine actors and actor-like adapters.
 *
 * @typeParam T - Snapshot returned to readers and subscribers.
 * @typeParam E - Event accepted by {@link ActorRef.dispatch}.
 */
export interface ActorRef<T, E = unknown> {
  /** Enqueues an event for processing. */
  dispatch: (event: E) => void;
  /** Returns the actor's current snapshot synchronously. */
  getSnapshot: () => T;
  /** Observes successful snapshot replacements; returns an unsubscribe callback. */
  subscribe: (observer: (state: T) => void) => () => void;
}

/**
 * Inspection event type.
 */
export type InspectionEvent = {
  type: '@actor/send'; // Extendable for lifecycle
  actor: ActorRef<unknown, any>;
  event: unknown;
  snapshot: unknown;
};

// =============================================================================
// ACTOR CLASS
// =============================================================================

/**
 * A reactive container for a state machine that handles dispatching,
 * queueing of async transitions, and state observability.
 *
 * Events are processed in arrival order. A promise-returning transition blocks
 * later events until it settles. Stopping the actor invalidates pending results,
 * clears queued events, and removes subscribers.
 *
 * @typeParam M - Complete machine or typestate union owned by the actor.
 * @example
 * ```ts
 * const actor = createActor(counter);
 * actor.subscribe(snapshot => console.log(snapshot.context.count));
 * actor.send.add(2);
 * actor.ref.send({ type: 'reset', args: [] });
 * ```
 */
export class Actor<M extends BaseMachine<any>> implements ActorRef<M, Event<M>> {
  private _state: M;
  private _observers: Set<(state: M) => void> = new Set();
  private _queue: Array<Event<M>> = [];
  private _processing = false;
  private _stopped = false;
  private _generation = 0;

  // Global inspector
  private static _inspector: ((event: InspectionEvent) => void) | null = null;

  /**
   * Registers a global inspector.
   */
  static inspect(inspector: ((event: InspectionEvent) => void) | null) {
    Actor._inspector = inspector;
  }

  /**
   * The "Magic" Dispatcher.
   * Maps machine transition names to callable functions.
   */
  readonly send: {
    [K in TransitionNames<M>]: (...args: TransitionArgs<M, K>) => void;
  };

  /**
   * A stable reference to the dispatch method, useful for passing around.
   */
  readonly ref: {
    send: (event: Event<M>) => void;
  };

  constructor(initialMachine: M) {
    this._state = initialMachine;

    // Pattern B: Reference to self for event-based dispatch
    this.ref = {
      send: (event) => this.dispatch(event)
    };

    // Pattern A: Proxy for RPC-style dispatch
    this.send = new Proxy({} as any, {
      get: (_target, prop) => {
        return (...args: any[]) => {
          this.dispatch({ type: prop as any, args: args as any } as unknown as Event<M>);
        };
      }
    });
  }

  /**
   * Returns the current immutable snapshot of the machine.
   */
  getSnapshot(): M {
    return this._state;
  }

  /**
   * Subscribes to state changes.
   * @param observer Callback function to be invoked on every state change.
   * @returns Unsubscribe function.
   */
  subscribe(observer: (state: M) => void): () => void {
    this._observers.add(observer);
    return () => {
      this._observers.delete(observer);
    };
  }

  /**
   * Selects a slice of the state. 
   */
  select<T>(selector: (state: M) => T): T {
    return selector(this._state);
  }

  /**
   * Starts the actor.
   */
  start(): this {
    this._stopped = false;
    return this;
  }

  /**
   * Stops the actor.
   */
  stop(): void {
    this._stopped = true;
    this._generation += 1;
    this._queue.length = 0;
    this._processing = false;
    this._observers.clear();
  }

  /**
   * Dispatches an event to the actor.
   * Handles both sync and async transitions.
   */
  dispatch(event: Event<M>): void {
    if (this._stopped) return;

    // Inspection
    if (Actor._inspector) {
      try {
        Actor._inspector({
          type: '@actor/send',
          actor: this,
          event,
          snapshot: this._state
        });
      } catch (error) {
        console.error('[Actor] Inspector failed:', error);
      }
    }

    if (this._processing) {
      this._queue.push(event);
      return;
    }

    this._processing = true;
    this._queue.push(event);
    this._flush();
  }

  /**
   * Performs the actor's commit work for a successfully produced snapshot.
   *
   * The base implementation does nothing, so snapshots publish immediately.
   * A subclass may return a promise to delay publication until it resolves —
   * for example, a durable write. If the promise rejects (or the method
   * throws), the snapshot is never published and the mailbox continues with
   * the previously committed state. Publication happens only after this work
   * settles and the actor is still current, so a stopped actor never
   * publishes a stale snapshot.
   */
  protected _commit(_nextState: M): MaybePromise<void> {
    // No additional commit work.
  }

  /**
   * Replaces the visible snapshot with the committed one and resumes mailbox
   * processing once an asynchronous commit settles.
   */
  private _awaitCommit(nextState: M, commit: PromiseLike<void>, generation: number, eventType: string): void {
    commit.then(
      () => {
        if (this._stopped || generation !== this._generation) return;
        this._state = nextState;
        this._notify();
        this._flush();
      },
      (error) => {
        if (this._stopped || generation !== this._generation) return;
        console.error(`[Actor] Commit failed for transition '${eventType}':`, error);
        this._flush();
      }
    );
  }

  private _flush(): void {
    if (this._stopped) return;

    while (!this._stopped && this._queue.length > 0) {
      const event = this._queue[0];
      this._queue.shift();

      const transitions = this._state as any;
      const fn = transitions[event.type];

      if (typeof fn !== 'function') {
        console.warn(`[Actor] Transition '${String(event.type)}' not found.`);
        continue;
      }

      let result: MaybePromise<M>;
      try {
        result = fn.apply(this._state, event.args);
      } catch (error) {
        console.error(`[Actor] Error in transition '${String(event.type)}':`, error);
        continue;
      }

      if (isPromiseLike<M>(result)) {
        const generation = this._generation;
        Promise.resolve(result).then((nextState) => {
          if (this._stopped || generation !== this._generation) return;
          if (!isMachineSnapshot(nextState)) {
            console.error(`[Actor] Transition '${String(event.type)}' did not return a machine with a context property.`);
            this._flush();
            return;
          }
          let commit: MaybePromise<void>;
          try {
            commit = this._commit(nextState as M);
          } catch (error) {
            console.error(`[Actor] Commit failed for transition '${String(event.type)}':`, error);
            this._flush();
            return;
          }
          if (isPromiseLike(commit)) {
            this._awaitCommit(nextState as M, commit, generation, String(event.type));
            return;
          }
          this._state = nextState as M;
          this._notify();
          this._flush();
        }).catch((error) => {
          if (this._stopped || generation !== this._generation) return;
          console.error(`[Actor] Async error in transition '${String(event.type)}':`, error);
          this._flush();
        });
        return;
      } else {
        if (!isMachineSnapshot(result)) {
          console.error(`[Actor] Transition '${String(event.type)}' did not return a machine with a context property.`);
          continue;
        }
        let commit: MaybePromise<void>;
        try {
          commit = this._commit(result as M);
        } catch (error) {
          console.error(`[Actor] Commit failed for transition '${String(event.type)}':`, error);
          continue;
        }
        if (isPromiseLike(commit)) {
          this._awaitCommit(result as M, commit, this._generation, String(event.type));
          return;
        }
        this._state = result as M;
        this._notify();
      }
    }
    this._processing = false;
  }

  private _notify() {
    const snapshot = this.getSnapshot();
    this._observers.forEach(observer => {
      try {
        observer(snapshot);
      } catch (error) {
        console.error('[Actor] Subscriber failed:', error);
      }
    });
  }
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return value !== null
    && (typeof value === 'object' || typeof value === 'function')
    && typeof (value as PromiseLike<T>).then === 'function';
}

function isMachineSnapshot(value: unknown): value is BaseMachine<object> {
  return value !== null && typeof value === 'object' && 'context' in value;
}

// =============================================================================
// INTEROP & HELPERS
// =============================================================================

/**
 * Creates an actor that owns and serializes transitions for `machine`.
 *
 * @typeParam M - Machine or typestate union to own.
 * @param machine - Initial immutable snapshot.
 * @returns A stopped-state-aware actor with RPC-style `send` and event-style `ref.send`.
 * @example
 * ```ts
 * const actor = createActor(createCounter({ count: 0 }));
 * actor.send.increment();
 * ```
 */
export function createActor<M extends BaseMachine<any>>(machine: M): Actor<M> {
  return new Actor(machine);
}

/**
 * Creates an actor reference from a machine; alias of {@link createActor}.
 *
 * @typeParam M - Machine or typestate union to own.
 * @param machine - Initial immutable snapshot.
 * @returns The actor through the portable {@link ActorRef} interface.
 */
export function spawn<M extends BaseMachine<any>>(machine: M): ActorRef<M, Event<M>> {
  return createActor(machine);
}

/**
 * Creates an actor whose context tracks one eagerly started promise.
 *
 * The promise function runs in a microtask after construction. Resolution moves
 * context to `resolved`; rejection moves it to `rejected`. Stopping the actor
 * prevents later snapshot replacement but does not cancel the underlying promise.
 *
 * @typeParam T - Promise fulfillment value.
 * @param promiseFn - Lazy promise producer invoked once.
 * @returns An actor with pending/resolved/rejected context.
 * @example
 * ```ts
 * const request = fromPromise(() => fetch('/api').then(r => r.json()));
 * request.subscribe(snapshot => console.log(snapshot.context.status));
 * ```
 */
export function fromPromise<T>(promiseFn: () => Promise<T>) {
  type PromiseContext =
    | { status: 'pending'; data: undefined; error: undefined }
    | { status: 'resolved'; data: T; error: undefined }
    | { status: 'rejected'; data: undefined; error: unknown };

  const initial: PromiseContext = { status: 'pending', data: undefined, error: undefined };

  const machine = createMachine<PromiseContext>(initial,
    (next) => ({
      resolve(data: T) {
        return next({ status: 'resolved' as const, data, error: undefined });
      },
      reject(error: unknown) {
        return next({ status: 'rejected' as const, error, data: undefined });
      }
    })
  );

  const actor = createActor(machine);

  Promise.resolve()
    .then(promiseFn)
    .then(data => (actor.send as any).resolve(data))
    .catch(err => (actor.send as any).reject(err));

  return actor;
}

/**
 * Creates an actor whose context follows an Observable-like source.
 *
 * `next`, `error`, and `complete` notifications become actor transitions.
 * Calling `actor.stop()` unsubscribes from the source exactly once.
 *
 * @typeParam T - Observable value type.
 * @param observable - Source exposing an RxJS-compatible `subscribe` method.
 * @returns An actor with active/done/error context.
 * @example
 * ```ts
 * const actor = fromObservable(source$);
 * actor.subscribe(snapshot => console.log(snapshot.context));
 * actor.stop(); // also unsubscribes from source$
 * ```
 */
export function fromObservable<T>(observable: { subscribe: (next: (val: T) => void, error?: (err: unknown) => void, complete?: () => void) => { unsubscribe: () => void } }) {
  type ObsContext =
    | { status: 'active'; value: undefined; error: undefined }
    | { status: 'active'; value: T; error: undefined }
    | { status: 'done'; value: undefined; error: undefined }
    | { status: 'error'; value: undefined; error: unknown };

  const initial: ObsContext = { status: 'active', value: undefined, error: undefined };

  const machine = createMachine<ObsContext>(initial,
    (next) => ({
      next(value: T) {
        return next({ status: 'active' as const, value, error: undefined });
      },
      error(error: unknown) {
        return next({ status: 'error' as const, error, value: undefined });
      },
      complete() {
        return next({ status: 'done' as const, value: undefined, error: undefined });
      }
    })
  );

  const actor = createActor(machine);

  let subscription: { unsubscribe: () => void } | undefined;
  try {
    subscription = observable.subscribe(
      (val) => (actor.send as any).next(val),
      (err) => (actor.send as any).error(err),
      () => (actor.send as any).complete()
    );
  } catch (error) {
    (actor.send as any).error(error);
  }

  const stop = actor.stop.bind(actor);
  let unsubscribed = false;
  actor.stop = () => {
    if (!unsubscribed) {
      unsubscribed = true;
      subscription?.unsubscribe();
    }
    stop();
  };

  return actor;
}

// =============================================================================
// PERSISTENCE
// =============================================================================

/**
 * Durable storage for a persisted representation `P`.
 *
 * `load` returns the stored representation, or `undefined` when nothing has
 * been persisted yet. `save` must resolve only once the value is durable.
 *
 * @typeParam P - Persisted representation of a machine snapshot.
 */
export interface PersistenceStorage<P> {
  /** Reads the stored representation, or `undefined` when storage is empty. */
  load(): MaybePromise<P | undefined>;
  /** Writes the representation; resolves once the value is durable. */
  save(value: P): MaybePromise<void>;
}

/**
 * Converts between executable machine snapshots and their persisted form.
 *
 * A machine snapshot contains functions and closures, so it is never
 * serialized directly; `encode` extracts the durable representation and
 * `decode` reconstructs an executable snapshot from it.
 *
 * @typeParam M - Machine or typestate union being persisted.
 * @typeParam P - Persisted representation of a snapshot.
 */
export interface MachineCodec<M extends BaseMachine<any>, P> {
  /** Extracts the durable representation of a snapshot. */
  encode(machine: M): P;
  /** Rebuilds an executable snapshot from its persisted representation. */
  decode(value: P): M;
}

/**
 * The complete persistence contract for {@link createPersistedActor}:
 * durable storage plus a codec between snapshots and representations.
 *
 * @typeParam M - Machine or typestate union being persisted.
 * @typeParam P - Persisted representation of a snapshot.
 */
export type Persistence<M extends BaseMachine<any>, P> =
  PersistenceStorage<P> & MachineCodec<M, P>;

/**
 * A rehydration table: an initial snapshot plus a codec, typically built
 * with {@link persistentMachine}. Combine with {@link PersistenceStorage}
 * to obtain a full {@link Persistence} contract.
 *
 * @typeParam M - Machine or typestate union being persisted.
 * @typeParam P - Persisted representation of a snapshot.
 */
export interface PersistedMachineDefinition<M extends BaseMachine<any>, P> extends MachineCodec<M, P> {
  /** Builds the snapshot used when storage is empty. */
  initial(): M;
}

/**
 * An {@link Actor} that durably commits every snapshot before publishing it.
 *
 * The commit protocol for each event is: run the transition, persist the
 * encoded representation of the resulting snapshot, and only then replace
 * the visible snapshot and notify subscribers. This establishes the
 * invariant that **every externally visible actor state is durable**.
 *
 * If the durable write fails, the snapshot is not published: the actor
 * remains at the last committed state, the error is reported to
 * `console.error`, and the mailbox continues with the next event.
 *
 * Create instances with {@link createPersistedActor}, which restores the
 * last persisted snapshot (or seeds storage with the initial one) before
 * the actor becomes visible.
 *
 * @typeParam M - Machine or typestate union owned by the actor.
 * @typeParam P - Persisted representation of a snapshot.
 */
export class PersistedActor<M extends BaseMachine<any>, P = unknown> extends Actor<M> {
  private _persistence: Persistence<M, P>;

  /** @internal Prefer {@link createPersistedActor}, which restores stored state first. */
  constructor(initialMachine: M, persistence: Persistence<M, P>) {
    super(initialMachine);
    this._persistence = persistence;
  }

  /**
   * Persists the snapshot's representation. The actor publishes the snapshot
   * only after this resolves, so a failed write means the snapshot never
   * becomes visible.
   */
  protected override async _commit(nextState: M): Promise<void> {
    await this._persistence.save(this._persistence.encode(nextState));
  }
}

/**
 * Creates an actor that durably commits one machine snapshot.
 *
 * Restoration happens before the actor is returned: when `load()` yields a
 * stored representation, `decode` rebuilds the snapshot from it; otherwise
 * the initial snapshot is encoded and saved, so the first visible state is
 * durable as well. The returned promise rejects when `load` or `decode`
 * fails, or when `decode` does not produce a valid machine.
 *
 * Two forms are supported:
 *
 * ```ts
 * // Explicit: an initial machine plus the full persistence contract.
 * const actor = await createPersistedActor(createIdle(), {
 *   load: () => db.get('machine'),
 *   save: (value) => db.set('machine', value),
 *   encode: (machine) => machine.context,
 *   decode: (context) => createMachineFromContext(context),
 * });
 *
 * // Rehydration table: persistentMachine provides initial/encode/decode.
 * const definition = persistentMachine({
 *   initial: () => createIdle(),
 *   states: { idle: (ctx) => createIdle(ctx), active: (ctx) => createActive(ctx) },
 *   discriminant: (ctx) => ctx.status,
 * });
 * const actor = await createPersistedActor(definition, storage);
 * ```
 *
 * @typeParam M - Machine or typestate union to own.
 * @typeParam P - Persisted representation of a snapshot.
 * @param initial - Initial machine snapshot, used when storage is empty.
 * @param persistence - Storage plus codec for the snapshot.
 * @returns A promise for the restored {@link PersistedActor}.
 */
export function createPersistedActor<M extends BaseMachine<any>, P>(
  initial: M,
  persistence: Persistence<M, P>
): Promise<PersistedActor<M, P>>;

/**
 * Creates a persisted actor from a rehydration table and storage.
 *
 * @typeParam M - Machine or typestate union to own.
 * @typeParam P - Persisted representation of a snapshot.
 * @param definition - Initial snapshot plus codec, from {@link persistentMachine}.
 * @param storage - Durable storage for the representation.
 * @returns A promise for the restored {@link PersistedActor}.
 */
export function createPersistedActor<M extends BaseMachine<any>, P>(
  definition: PersistedMachineDefinition<M, P>,
  storage: PersistenceStorage<P>
): Promise<PersistedActor<M, P>>;

/** @internal Runtime implementation shared by the public overloads. */
export async function createPersistedActor(
  source: BaseMachine<any> | PersistedMachineDefinition<any, any>,
  persistenceOrStorage: Persistence<any, any> | PersistenceStorage<any>
): Promise<PersistedActor<any, any>> {
  let initial: BaseMachine<any>;
  let persistence: Persistence<any, any>;

  if (isMachineSnapshot(source)) {
    initial = source;
    persistence = persistenceOrStorage as Persistence<any, any>;
  } else {
    const definition = source as PersistedMachineDefinition<any, any>;
    initial = definition.initial();
    persistence = {
      ...persistenceOrStorage,
      encode: (machine) => definition.encode(machine),
      decode: (value) => definition.decode(value),
    };
  }

  const stored = await persistence.load();
  if (stored !== undefined) {
    const restored = persistence.decode(stored);
    if (!isMachineSnapshot(restored)) {
      throw new TypeError('[PersistedActor] decode() did not return a machine with a context property.');
    }
    return new PersistedActor(restored, persistence);
  }

  await persistence.save(persistence.encode(initial));
  return new PersistedActor(initial, persistence);
}

/**
 * Defines a persisted machine as a rehydration table.
 *
 * Snapshots are persisted as their context; `decode` uses `discriminant` to
 * select the state factory that rebuilds the executable machine — the same
 * discriminant-selects-factory pattern as `createEnsemble`. The result
 * combines with any {@link PersistenceStorage} in {@link createPersistedActor}.
 *
 * @typeParam C - Context union shared by every state.
 * @typeParam F - Map from discriminant values to state factories.
 * @param config.initial - Builds the snapshot used when storage is empty.
 * @param config.states - Factory per discriminant value; each receives the persisted context.
 * @param config.discriminant - Selects the state factory for a persisted context.
 * @returns A {@link PersistedMachineDefinition} encoding snapshots as their context.
 *
 * @example
 * ```ts
 * const Auth = persistentMachine({
 *   initial: () => createLoggedOut(),
 *   states: {
 *     loggedOut: (ctx: AuthContext) => createLoggedOut(ctx),
 *     loggedIn: (ctx: AuthContext) => createLoggedIn(ctx),
 *   },
 *   discriminant: (ctx: AuthContext) => ctx.status,
 * });
 *
 * const actor = await createPersistedActor(Auth, {
 *   load: () => db.get('auth'),
 *   save: (value) => db.set('auth', value),
 * });
 * ```
 */
export function persistentMachine<
  C extends object,
  F extends Record<string, (context: any) => BaseMachine<any>>
>(config: {
  initial: () => BaseMachine<any>;
  states: F;
  discriminant: (context: C) => keyof F & string;
}): PersistedMachineDefinition<ReturnType<F[keyof F]>, C> {
  const { initial, states, discriminant } = config;
  type M = ReturnType<F[keyof F]>;

  return {
    initial: () => initial() as M,
    encode(machine: M): C {
      return machine.context as C;
    },
    decode(value: C): M {
      const key = discriminant(value);
      const factory = states[key];
      if (!factory) {
        throw new Error(`[PersistedActor] No state factory found for discriminant "${String(key)}".`);
      }
      return factory(value) as M;
    },
  };
}
