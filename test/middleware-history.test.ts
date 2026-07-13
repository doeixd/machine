import { describe, it, expect, vi } from 'vitest';
import {
  createMachine,
  withHistory,
  withSnapshot,
  withTimeTravel
} from '../src/index';

// Helper to create counter machine with proper closures
const createCounter = () => {
  const t = {
    increment: function() { return createMachine({ count: this.context.count + 1 }, t); },
    add: function(n: number) { return createMachine({ count: this.context.count + n }, t); },
    reset: function() { return createMachine({ count: 0 }, t); }
  };
  return createMachine({ count: 0 }, t);
};

describe('withHistory', () => {
  it('should record transition calls with arguments', () => {
    const tracked = withHistory(createCounter());

    tracked.increment.call(tracked);
    tracked.add.call(tracked, 5);

    expect(tracked.history).toHaveLength(2);
    expect(tracked.history[0].transitionName).toBe('increment');
    expect(tracked.history[0].args).toEqual([]);
    expect(tracked.history[1].transitionName).toBe('add');
    expect(tracked.history[1].args).toEqual([5]);
  });

  it('should include timestamps', () => {
    const tracked = withHistory(createCounter());

    const before = Date.now();
    const s = tracked.increment.call(tracked);
    const after = Date.now();

    expect(tracked.history[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(tracked.history[0].timestamp).toBeLessThanOrEqual(after);
  });

  it('should serialize when serializer provided', () => {
    const tracked = withHistory(createCounter(), {
      serializer: {
        serialize: (args) => JSON.stringify(args),
        deserialize: (str) => JSON.parse(str)
      }
    });

    tracked.add.call(tracked, 42);

    expect(tracked.history[0].serializedArgs).toBe('[42]');
  });

  it('should respect maxSize', () => {
    const tracked = withHistory(createCounter(), { maxSize: 2 });

    tracked.increment.call(tracked);
    tracked.increment.call(tracked);
    tracked.increment.call(tracked);

    expect(tracked.history).toHaveLength(2);
  });

  it('should call onEntry callback', () => {
    const onEntry = vi.fn();
    const tracked = withHistory(createCounter(), { onEntry });

    tracked.increment.call(tracked);

    expect(onEntry).toHaveBeenCalledTimes(1);
  });

  it('should clear history', () => {
    const tracked = withHistory(createCounter());

    tracked.increment.call(tracked);
    expect(tracked.history).toHaveLength(1);

    tracked.clearHistory();
    expect(tracked.history).toHaveLength(0);
  });
});

describe('withSnapshot', () => {
  it('should record context before and after', () => {
    const tracked = withSnapshot(createCounter());

    tracked.increment.call(tracked);

    expect(tracked.snapshots).toHaveLength(1);
    expect(tracked.snapshots[0].before).toEqual({ count: 0 });
    expect(tracked.snapshots[0].after).toEqual({ count: 1 });
  });

  it('should serialize contexts', () => {
    const tracked = withSnapshot(createCounter(), {
      serializer: {
        serialize: (ctx) => JSON.stringify(ctx),
        deserialize: (str) => JSON.parse(str)
      }
    });

    tracked.increment.call(tracked);

    expect(tracked.snapshots[0].serializedBefore).toBe('{"count":0}');
    expect(tracked.snapshots[0].serializedAfter).toBe('{"count":1}');
  });

  it('should capture custom snapshot data', () => {
    const tracked = withSnapshot(createCounter(), {
      captureSnapshot: (before, after) => ({
        delta: after.count - before.count
      })
    });

    tracked.add.call(tracked, 5);

    expect(tracked.snapshots[0].diff).toEqual({ delta: 5 });
  });

  it('should respect maxSize', () => {
    const tracked = withSnapshot(createCounter(), { maxSize: 2 });

    tracked.increment.call(tracked);
    tracked.increment.call(tracked);
    tracked.increment.call(tracked);

    expect(tracked.snapshots).toHaveLength(2);
  });

  it('should restore to previous state', () => {
    const tracked = withSnapshot(createCounter());

    tracked.add.call(tracked, 10);

    const restored = tracked.restoreSnapshot(tracked.snapshots[0].before);
    expect(restored.context.count).toBe(0);
  });

  it('should clear snapshots', () => {
    const tracked = withSnapshot(createCounter());

    tracked.increment.call(tracked);
    expect(tracked.snapshots).toHaveLength(1);

    tracked.clearSnapshots();
    expect(tracked.snapshots).toHaveLength(0);
  });
});

describe('withTimeTravel', () => {
  it('should track both history and snapshots', () => {
    let tracker = withTimeTravel(createCounter());

    tracker = tracker.increment.call(tracker);
    tracker = tracker.add.call(tracker, 5);

    expect(tracker.history).toHaveLength(2);
    expect(tracker.snapshots).toHaveLength(2);
    expect(tracker.history[0].transitionName).toBe('increment');
    expect(tracker.snapshots[0].before).toEqual({ count: 0 });
    expect(tracker.snapshots[1].before).toEqual({ count: 1 });
    expect(tracker.snapshots[1].after).toEqual({ count: 6 });
  });

  it('should serialize both', () => {
    const tracker = withTimeTravel(createCounter(), {
      serializer: {
        serialize: (data) => JSON.stringify(data),
        deserialize: (str) => JSON.parse(str)
      }
    });

    tracker.add.call(tracker, 10);

    expect(tracker.history[0].serializedArgs).toBe('[10]');
    expect(tracker.snapshots[0].serializedBefore).toBe('{"count":0}');
  });

  it('should call onRecord for both types', () => {
    const onRecord = vi.fn();
    const tracker = withTimeTravel(createCounter(), { onRecord });

    tracker.increment.call(tracker);

    expect(onRecord).toHaveBeenCalledTimes(2);
    expect(onRecord).toHaveBeenCalledWith('history', expect.any(Object));
    expect(onRecord).toHaveBeenCalledWith('snapshot', expect.any(Object));
  });

  it('should restore to previous state', () => {
    let tracker = withTimeTravel(createCounter());

    tracker = tracker.add.call(tracker, 10);
    tracker = tracker.add.call(tracker, 5);

    const restored = tracker.restoreSnapshot(tracker.snapshots[0].after);
    expect(restored.context.count).toBe(10);
  });

  it('should clear both', () => {
    const tracker = withTimeTravel(createCounter());

    tracker.increment.call(tracker);

    tracker.clearTimeTravel();

    expect(tracker.history).toHaveLength(0);
    expect(tracker.snapshots).toHaveLength(0);
  });

  it('should replay from snapshot', () => {
    let tracker = withTimeTravel(createCounter());

    tracker = tracker.increment.call(tracker);
    tracker = tracker.add.call(tracker, 5);

    // Replay from first snapshot should re-execute all transitions
    const replayed = tracker.replayFrom(0);
    expect(replayed.context.count).toBe(6);
  });
});
