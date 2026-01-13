import { describe, it, expect, beforeAll } from 'vitest';
import {
  createMachine,
  withTimeTravel
} from './src/index';

beforeAll(() => {
  (globalThis as any).__DEBUG_MIDDLEWARE = true;
});

const createCounter = () => {
  const t = {
    increment: function() { return createMachine({ count: this.context.count + 1 }, t); },
    add: function(n: number) { return createMachine({ count: this.context.count + n }, t); },
    reset: function() { return createMachine({ count: 0 }, t); }
  };
  return createMachine({ count: 0 }, t);
};

describe('withTimeTravel Debug', () => {
  it('should track both history and snapshots', () => {
    console.log('=== Starting test ===');
    let tracker = withTimeTravel(createCounter());

    console.log('\n=== Before first increment ===');
    console.log('tracker has history:', 'history' in tracker);
    tracker = tracker.increment.call(tracker);

    console.log('\n=== After first increment ===');
    console.log('tracker has history:', 'history' in tracker);
    console.log('tracker has snapshots:', 'snapshots' in tracker);

    tracker = tracker.add.call(tracker, 5);

    console.log('\n=== After add ===');
    console.log('tracker has history:', 'history' in tracker);
    console.log('tracker has snapshots:', 'snapshots' in tracker);

    expect(tracker.history).toHaveLength(2);
    expect(tracker.snapshots).toHaveLength(2);
  });
});
