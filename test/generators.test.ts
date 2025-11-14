import { describe, it, expect, vi } from 'vitest';
import { createMachine, bindTransitions, BoundMachine } from '../src/index';
import {
  run,
  step,
  yieldMachine,
  runSequence,
  createFlow,
  runWithDebug,
  runAsync,
  stepAsync,
} from '../src/generators';

type CounterContext = { count: number };

// Helper function to create a test counter machine
function createCounter(count: number = 0) {
  type CounterTransitions = {
    increment: (this: CounterContext) => ReturnType<typeof createCounter>;
    decrement: (this: CounterContext) => ReturnType<typeof createCounter>;
    add: (this: CounterContext, n: number) => ReturnType<typeof createCounter>;
    multiply: (this: CounterContext, n: number) => ReturnType<typeof createCounter>;
    reset: (this: CounterContext) => ReturnType<typeof createCounter>;
  };

  const transitions: CounterTransitions = {
    increment(this: CounterContext) {
      return createCounter(this.count + 1);
    },
    decrement(this: CounterContext) {
      return createCounter(this.count - 1);
    },
    add(this: CounterContext, n: number) {
      return createCounter(this.count + n);
    },
    multiply(this: CounterContext, n: number) {
      return createCounter(this.count * n);
    },
    reset(this: CounterContext) {
      return createCounter(0);
    },
  };

  return createMachine({ count }, transitions);
}

describe('run', () => {
  it('should execute a generator flow and return the final value', () => {
    const counter = bindTransitions(createCounter(0));

    const result = run(function* (m) {
      m = yield* step(m.increment.call(m.context));
      m = yield* step(m.increment.call(m.context));
      m = yield* step(m.add.call(m.context, 5));
      return m.context.count;
    }, counter);

    expect(result).toBe(7);
  });

  it('should handle conditional logic in generators', () => {
    const counter = new BoundMachine(createCounter(0));

    const result = run(function* (m) {
      m = yield* step(m.increment());

      if (m.context.count > 5) {
        m = yield* step(m.reset());
      } else {
        m = yield* step(m.add(10));
      }

      return m.context.count;
    }, counter);

    expect(result).toBe(11);
  });

  it('should handle loops in generators', () => {
    const counter = new BoundMachine(createCounter(0));

    const result = run(function* (m) {
      for (let i = 0; i < 5; i++) {
        m = yield* step(m.increment());
      }
      return m.context.count;
    }, counter);

    expect(result).toBe(5);
  });

  it('should support accumulation across iterations', () => {
    const counter = new BoundMachine(createCounter(0));

    const result = run(function* (m) {
      let total = 0;

      for (let i = 0; i < 3; i++) {
        m = yield* step(m.add(i + 1));
        total += m.context.count;
      }

      return total;
    }, counter);

    // 1 + (1+2) + (1+2+3) = 1 + 3 + 6 = 10
    expect(result).toBe(10);
  });

  it('should maintain immutability between steps', () => {
    const counter = createCounter(0);
    const states: number[] = [];

    run(function* (m) {
      states.push(m.context.count);
      m = yield* step(m.increment.call(m.context));
      states.push(m.context.count);
      m = yield* step(m.increment.call(m.context));
      states.push(m.context.count);
      return m;
    }, counter);

    expect(states).toEqual([0, 1, 2]);
  });

  it('should return non-machine values', () => {
    const counter = createCounter(5);

    const result = run(function* (m) {
      m = yield* step(m.multiply.call(m.context, 2));
      return `Count is ${m.context.count}`;
    }, counter);

    expect(result).toBe('Count is 10');
  });
});

describe('step', () => {
  it('should yield a machine and return the received state', () => {
    const counter = createCounter(0);

    const result = run(function* (m) {
      const next = yield* step(m.increment.call(m.context));
      expect(next.context.count).toBe(1);
      return next;
    }, counter);

    expect(result.context.count).toBe(1);
  });

  it('should work with yield* delegation', () => {
    const counter = createCounter(0);

    const result = run(function* (m) {
      m = yield* step(m.increment.call(m.context));
      m = yield* step(m.increment.call(m.context));
      m = yield* step(m.increment.call(m.context));
      return m;
    }, counter);

    expect(result.context.count).toBe(3);
  });
});

describe('yieldMachine', () => {
  it('should act as an identity function for direct yielding', () => {
    const counter = createCounter(0);

    const result = run(function* (m) {
      m = yield yieldMachine(m.increment.call(m.context));
      m = yield yieldMachine(m.add.call(m.context, 5));
      return m;
    }, counter);

    expect(result.context.count).toBe(6);
  });

  it('should work without yield* syntax', () => {
    const counter = createCounter(10);

    const result = run(function* (m) {
      m = yield m.decrement.call(m.context);
      m = yield m.decrement.call(m.context);
      return m.context.count;
    }, counter);

    expect(result).toBe(8);
  });
});

describe('runSequence', () => {
  it('should run multiple flows in sequence', () => {
    const counter = createCounter(0);

    const flow1 = function* (m: ReturnType<typeof createCounter>) {
      m = yield* step(m.increment.call(m.context));
      m = yield* step(m.increment.call(m.context));
      return m;
    };

    const flow2 = function* (m: ReturnType<typeof createCounter>) {
      m = yield* step(m.add.call(m.context, 5));
      return m;
    };

    const flow3 = function* (m: ReturnType<typeof createCounter>) {
      m = yield* step(m.multiply.call(m.context, 2));
      return m;
    };

    const result = runSequence(counter, [flow1, flow2, flow3]);

    // (0 + 1 + 1 + 5) * 2 = 14
    expect(result.context.count).toBe(14);
  });

  it('should pass the result of each flow to the next', () => {
    const counter = createCounter(1);

    const double = function* (m: ReturnType<typeof createCounter>) {
      m = yield* step(m.multiply.call(m.context, 2));
      return m;
    };

    const result = runSequence(counter, [double, double, double]);

    // 1 * 2 * 2 * 2 = 8
    expect(result.context.count).toBe(8);
  });

  it('should handle empty flow array', () => {
    const counter = createCounter(5);
    const result = runSequence(counter, []);
    expect(result.context.count).toBe(5);
  });
});

describe('createFlow', () => {
  it('should create a reusable generator flow', () => {
    const counter = createCounter(0);

    const incrementThrice = createFlow(function* (m: ReturnType<typeof createCounter>) {
      m = yield* step(m.increment.call(m.context));
      m = yield* step(m.increment.call(m.context));
      m = yield* step(m.increment.call(m.context));
      return m;
    });

    const result = run(function* (m) {
      m = yield* incrementThrice(m);
      m = yield* step(m.add.call(m.context, 10));
      return m;
    }, counter);

    expect(result.context.count).toBe(13);
  });

  it('should allow composing flows together', () => {
    const counter = createCounter(0);

    const addFive = createFlow(function* (m: ReturnType<typeof createCounter>) {
      m = yield* step(m.add.call(m.context, 5));
      return m;
    });

    const doubleIt = createFlow(function* (m: ReturnType<typeof createCounter>) {
      m = yield* step(m.multiply.call(m.context, 2));
      return m;
    });

    const result = run(function* (m) {
      m = yield* addFive(m);
      m = yield* doubleIt(m);
      m = yield* addFive(m);
      return m;
    }, counter);

    // (0 + 5) * 2 + 5 = 15
    expect(result.context.count).toBe(15);
  });
});

describe('runWithDebug', () => {
  it('should run flow with debug output', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const counter = createCounter(0);

    const result = runWithDebug(function* (m) {
      m = yield* step(m.increment.call(m.context));
      m = yield* step(m.add.call(m.context, 5));
      return m.context.count;
    }, counter);

    expect(result).toBe(6);

    // Should log initial state (step 0), step 1, step 2, and final result
    expect(consoleSpy).toHaveBeenCalledWith('Step 0:', { count: 0 });
    expect(consoleSpy).toHaveBeenCalledWith('Step 1:', { count: 1 });
    expect(consoleSpy).toHaveBeenCalledWith('Step 2:', { count: 6 });
    expect(consoleSpy).toHaveBeenCalledWith('Final:', 6);

    consoleSpy.mockRestore();
  });

  it('should accept custom logger', () => {
    const logs: string[] = [];
    const customLogger = (step: number, m: ReturnType<typeof createCounter>) => {
      logs.push(`Step ${step}: count=${m.context.count}`);
    };

    const counter = createCounter(0);

    runWithDebug(
      function* (m) {
        m = yield* step(m.increment.call(m.context));
        m = yield* step(m.increment.call(m.context));
        return m;
      },
      counter,
      customLogger
    );

    expect(logs).toEqual([
      'Step 0: count=0',
      'Step 1: count=1',
      'Step 2: count=2',
    ]);
  });
});

describe('runAsync', () => {
  it('should run async generator flows', async () => {
    const counter = createCounter(0);

    const result = await runAsync(async function* (m) {
      m = yield* stepAsync(m.increment.call(m.context));
      await new Promise((resolve) => setTimeout(resolve, 10));
      m = yield* stepAsync(m.add.call(m.context, 5));
      return m.context.count;
    }, counter);

    expect(result).toBe(6);
  });

  it('should handle async operations between steps', async () => {
    const counter = createCounter(0);
    const operations: string[] = [];

    const result = await runAsync(async function* (m) {
      operations.push('start');
      m = yield* stepAsync(m.increment.call(m.context));

      operations.push('before async');
      await new Promise((resolve) => setTimeout(resolve, 10));
      operations.push('after async');

      m = yield* stepAsync(m.increment.call(m.context));
      return m;
    }, counter);

    expect(result.context.count).toBe(2);
    expect(operations).toEqual(['start', 'before async', 'after async']);
  });

  it('should maintain immutability with async flows', async () => {
    const counter = createCounter(0);

    const result = await runAsync(async function* (m) {
      const initial = m.context.count;
      m = yield* stepAsync(m.add.call(m.context, 10));
      expect(initial).toBe(0);
      return m;
    }, counter);

    expect(result.context.count).toBe(10);
  });
});

describe('stepAsync', () => {
  it('should work with async generators', async () => {
    const counter = createCounter(0);

    const result = await runAsync(async function* (m) {
      const next = yield* stepAsync(m.increment.call(m.context));
      expect(next.context.count).toBe(1);
      return next;
    }, counter);

    expect(result.context.count).toBe(1);
  });

  it('should support multiple async steps', async () => {
    const counter = createCounter(0);

    const result = await runAsync(async function* (m) {
      m = yield* stepAsync(m.increment.call(m.context));
      m = yield* stepAsync(m.multiply.call(m.context, 5));
      m = yield* stepAsync(m.add.call(m.context, 3));
      return m.context.count;
    }, counter);

    // (0 + 1) * 5 + 3 = 8
    expect(result).toBe(8);
  });
});

describe('BoundMachine (typed alternative to bindTransitions)', () => {
  it('should support clean syntax with full type safety', () => {
    const counter = new BoundMachine(createCounter(0));

    const result = run(function* (m) {
      m = yield* step(m.increment());
      m = yield* step(m.increment());
      m = yield* step(m.add(5));
      return m.context.count;
    }, counter);

    expect(result).toBe(7);
  });

  it('should maintain automatic re-wrapping across transitions', () => {
    const counter = new BoundMachine(createCounter(1));

    const result = run(function* (m) {
      m = yield* step(m.multiply(3));
      m = yield* step(m.add(2));
      m = yield* step(m.multiply(2));
      return m.context.count;
    }, counter);

    // (1 * 3 + 2) * 2 = 10
    expect(result).toBe(10);
  });

  it('should handle complex generator flows cleanly', () => {
    const counter = new BoundMachine(createCounter(0));

    const result = run(function* (m) {
      for (let i = 0; i < 3; i++) {
        m = yield* step(m.add(i + 1));
      }
      return m.context.count;
    }, counter);

    // 0 + 1 + 2 + 3 = 6
    expect(result).toBe(6);
  });
});

describe('Complex generator scenarios', () => {
  it('should handle nested conditional flows', () => {
    const counter = createCounter(0);

    const result = run(function* (m) {
      for (let i = 0; i < 3; i++) {
        m = yield* step(m.add.call(m.context, i + 1));

        if (m.context.count > 3) {
          m = yield* step(m.multiply.call(m.context, 2));
        } else {
          m = yield* step(m.increment.call(m.context));
        }
      }

      return m.context.count;
    }, counter);

    // i=0: count=1, then +1 -> 2
    // i=1: count=4, then *2 -> 8
    // i=2: count=11, then *2 -> 22
    expect(result).toBe(22);
  });

  it('should support error handling in flows', () => {
    const counter = createCounter(0);

    const result = run(function* (m) {
      try {
        m = yield* step(m.increment.call(m.context));

        if (m.context.count === 1) {
          throw new Error('Test error');
        }
      } catch (error) {
        m = yield* step(m.add.call(m.context, 100));
      }

      return m.context.count;
    }, counter);

    expect(result).toBe(101);
  });

  it('should work with early returns', () => {
    const counter = createCounter(0);

    const result = run(function* (m) {
      m = yield* step(m.increment.call(m.context));

      if (m.context.count === 1) {
        return 'early exit';
      }

      m = yield* step(m.add.call(m.context, 100));
      return m.context.count;
    }, counter);

    expect(result).toBe('early exit');
  });
});
