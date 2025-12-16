import { describe, it, expect, vi } from 'vitest';
import {
  createActor,
  Actor,
  createMachine,
  createAsyncMachine,
  Event,
  fromPromise,
  fromObservable
} from '../src/index';

describe('Actor', () => {
  // Sync Machine Fixture
  // Sync Machine Fixture - Using Functional Builder for consistent 'this' context
  const createCounter = () => createMachine({ count: 0 }, (next) => ({
    increment() {
      return next({ count: this.count + 1 });
    },
    add(n: number) {
      return next({ count: this.count + n });
    },
    set(n: number) {
      return next({ count: n });
    }
  }));

  describe('Pattern A: Proxy Dispatch', () => {
    it('should dispatch synchronous transitions', () => {
      const actor = createActor(createCounter());

      actor.send.increment();
      expect(actor.getSnapshot().context.count).toBe(1);

      actor.send.add(5);
      expect(actor.getSnapshot().context.count).toBe(6);
    });

    it('should handle arguments correctly', () => {
      const actor = createActor(createCounter());
      actor.send.set(100);
      expect(actor.getSnapshot().context.count).toBe(100);
    });
  });

  describe('Pattern B: Event Dispatch', () => {
    it('should dispatch events via ref', () => {
      const actor = createActor(createCounter());

      actor.ref.send({ type: 'increment', args: [] });
      expect(actor.getSnapshot().context.count).toBe(1);

      actor.ref.send({ type: 'add', args: [10] });
      expect(actor.getSnapshot().context.count).toBe(11);
    });

    it('should dispatch events via immediate dispatch method', () => {
      const actor = createActor(createCounter());

      actor.dispatch({ type: 'increment', args: [] });
      expect(actor.getSnapshot().context.count).toBe(1);
    });
  });

  describe('State Observation', () => {
    it('should notify subscribers on state change', () => {
      const actor = createActor(createCounter());
      const observer = vi.fn();

      const unsubscribe = actor.subscribe(observer);

      actor.send.increment();

      expect(observer).toHaveBeenCalledTimes(1);
      expect(observer).toHaveBeenCalledWith(expect.objectContaining({
        context: { count: 1 }
      }));

      unsubscribe();
      actor.send.increment();
      expect(observer).toHaveBeenCalledTimes(1); // No new calls
    });

    it('should support selection', () => {
      const actor = createActor(createCounter());
      actor.send.add(99);

      const count = actor.select(state => state.context.count);
      expect(count).toBe(99);
    });
  });

  describe('Async Handling (Mailbox)', () => {
    function createAsyncCounter() {
      return createAsyncMachine({ count: 0, status: 'idle' }, (next) => ({
        async delayedIncrement() {
          await new Promise(r => setTimeout(r, 10)); // tiny delay
          return next({ ...this, count: this.count + 1 });
        },
        async fastIncrement() {
          return next({ ...this, count: this.count + 1 });
        }
      }));
    }

    it('should process async transitions sequentially', async () => {
      const actor = createActor(createAsyncCounter());

      // Fire 3 async transitions rapidly
      // If run in parallel without queue, they might all see count=0 and result in count=1
      // If queued, they should result in count=3
      actor.send.delayedIncrement();
      actor.send.delayedIncrement();
      actor.send.delayedIncrement();

      // accessing snapshot immediately should still be 0
      expect(actor.getSnapshot().context.count).toBe(0);

      // Wait for queue to process
      await new Promise(r => setTimeout(r, 100));

      expect(actor.getSnapshot().context.count).toBe(3);
    });

    it('should mix sync and async correctly', async () => {
      const actor = createActor(createAsyncCounter());

      actor.send.fastIncrement(); // Sync-ish (returns promise but resolves fast)
      actor.send.delayedIncrement();

      // Wait for queue
      await new Promise(r => setTimeout(r, 50));

      expect(actor.getSnapshot().context.count).toBe(2);
    });
  });

  describe('Advanced Features', () => {
    it('fromPromise should handle resolution', async () => {
      const actor = fromPromise(() => Promise.resolve('hello'));

      await new Promise(resolve => setTimeout(resolve, 0));

      const snap = actor.getSnapshot();
      expect(snap.context.status).toBe('resolved');
      expect(snap.context.data).toBe('hello');
    });

    it('fromObservable should handle updates', () => {
      let nextObserver: any;
      const obs = {
        subscribe: (next: any) => {
          nextObserver = next;
          return { unsubscribe: () => { } };
        }
      };

      const actor = fromObservable(obs);

      expect(actor.getSnapshot().context.status).toBe('active');

      nextObserver(42);
      expect(actor.getSnapshot().context.value).toBe(42);
    });

    it('should support global inspection', () => {
      const inspector = vi.fn();
      Actor.inspect(inspector);

      const machine = createCounter();
      const actor = createActor(machine);
      actor.send.increment();

      expect(inspector).toHaveBeenCalledWith(expect.objectContaining({
        type: '@actor/send',
        actor: actor,
        event: expect.objectContaining({ type: 'increment' })
      }));

      // Cleanup
      Actor.inspect(() => { });
    });
  });
});
