import { describe, it, expect } from 'vitest';
import {
  createMachine,
  createAsyncMachine,
  setContext,
  next,
  overrideTransitions,
  extendTransitions,
  createMachineBuilder,
  matchMachine,
  hasState,
  createMachineFactory,
  MachineBase,
  type Machine,
  type Context,
  TransitionsFor,
  state,
} from '../src/index';

describe('createMachine - Functional Builder', () => {
  it('should create a machine with functional builder pattern', () => {
    const machine = createMachine(
      { count: 0 },
      (next) => ({
        increment() {
          return next({ count: this.context.count + 1 });
        },
        add(n: number) {
          return next({ count: this.context.count + n });
        }
      })
    );

    expect(machine.context).toEqual({ count: 0 });
    expect(typeof machine.increment).toBe('function');
    expect(typeof machine.add).toBe('function');
  });



  it('should preserve immutability with functional builder', () => {
    const machine = createMachine(
      { count: 0 },
      (next) => ({
        increment() {
          return next({ count: this.context.count + 1 });
        },
      })
    );

    const nextMachine = machine.increment();

    expect(machine.context.count).toBe(0);
    expect(nextMachine.context.count).toBe(1);
    expect(machine).not.toBe(nextMachine);
  });

  it('should handle multiple transitions with functional builder', () => {
    const machine = createMachine({ count: 0 }, (next) => ({
      increment() {
        return next({ count: this.context.count + 1 });
      },
      decrement() {
        return next({ count: this.context.count - 1 });
      },
      reset() {
        return next({ count: 0 });
      },
    }));

    let current = machine;
    current = current.increment();
    current = current.increment();
    current = current.decrement();

    expect(current.context.count).toBe(1);
  });

  it('should handle transitions with parameters', () => {
    const machine = createMachine(
      { count: 0 },
      {
        add(n: number) {
          return createMachine({ count: this.context.count + n }, this);
        },
      }
    );

    const nextMachine = machine.add(5);
    expect(nextMachine.context.count).toBe(5);
  });
});

describe('createMachine - Traditional API', () => {
  it('should create a machine with traditional object transitions', () => {
    const transitions = {
      increment(this: {count: number}) {
        return createMachine({ count: this.context.count + 1 }, transitions);
      },
      add(this: {count: number}, n: number) {
        return createMachine({ count: this.context.count + n }, transitions);
      }
    };

    const machine = createMachine({ count: 0 }, transitions);

    expect(machine.context).toEqual({ count: 0 });
    expect(typeof machine.increment).toBe('function');
    expect(typeof machine.add).toBe('function');
  });



  it('should preserve immutability with traditional API', () => {
    const transitions = {
      increment(this: {count: number}) {
        return createMachine({ count: this.context.count + 1 }, transitions);
      }
    };

    const machine = createMachine({ count: 0 }, transitions);
    const nextMachine = machine.increment();

    expect(machine.context.count).toBe(0);
    expect(nextMachine.context.count).toBe(1);
    expect(machine).not.toBe(nextMachine);
  });
});

describe('createAsyncMachine', () => {
  it('should create an async machine', () => {
    const machine = createAsyncMachine(
      { status: 'idle' as const },
      {
        async start() {
          await new Promise(resolve => setTimeout(resolve, 10));
          return createAsyncMachine({ status: 'running' as const }, this);
        },
      }
    );

    expect(machine.context).toEqual({ status: 'idle' });
    expect(typeof machine.start).toBe('function');
  });

  it('should handle async transitions', async () => {
    const machine = createAsyncMachine(
      { value: 0 },
      {
        async increment() {
          await new Promise(resolve => setTimeout(resolve, 10));
          return createAsyncMachine({ value: this.context.value + 1 }, this);
        },
      }
    );

    const nextMachine = await machine.increment();
    expect(nextMachine.context.value).toBe(1);
  });

  it('should create an async machine with functional builder pattern', () => {
    const machine = createAsyncMachine(
      { count: 0 },
      (next) => ({
        async increment() {
          await new Promise(resolve => setTimeout(resolve, 10));
          return next({ count: this.context.count + 1 });
        },
        async add(n: number) {
          await new Promise(resolve => setTimeout(resolve, 10));
          return next({ count: this.context.count + n });
        }
      })
    );

    expect(machine.context).toEqual({ count: 0 });
    expect(typeof machine.increment).toBe('function');
    expect(typeof machine.add).toBe('function');
  });

  it('should copy transitions from existing async machine', () => {
    const sourceMachine = createAsyncMachine(
      { count: 0 },
      {
        async increment() {
          return createAsyncMachine({ count: this.context.count + 1 }, this);
        }
      }
    );

    const copiedMachine = createAsyncMachine({ count: 5 }, sourceMachine);

    expect(copiedMachine.context).toEqual({ count: 5 });
    expect(typeof copiedMachine.increment).toBe('function');
  });
});

describe('setContext', () => {
  it('should update context with a new object', () => {
    const machine = createMachine(
      { count: 0 },
      {
        increment() {
          return createMachine({ count: this.context.count + 1 }, this);
        },
      }
    );

    const updated = setContext(machine, { count: 10 });

    expect(updated.context.count).toBe(10);
    expect(machine.context.count).toBe(0);
    expect(typeof updated.increment).toBe('function');
  });

  it('should update context with an updater function', () => {
    const machine = createMachine(
      { count: 5, name: 'test' },
      {
        increment() {
          return createMachine({ count: this.context.count + 1, name: this.context.name }, this);
        },
      }
    );

    const updated = setContext(machine, (ctx) => ({
      ...ctx,
      count: ctx.count * 2,
    }));

    expect(updated.context.count).toBe(10);
    expect(updated.context.name).toBe('test');
    expect(machine.context.count).toBe(5);
  });

  it('should preserve all transitions after context update', () => {
    const machine = createMachine(
      { count: 0 },
      {
        increment() {
          return createMachine({ count: this.context.count + 1 }, this);
        },
        decrement() {
          return createMachine({ count: this.context.count - 1 }, this);
        },
      }
    );

    const updated = setContext(machine, { count: 100 });

    expect(typeof updated.increment).toBe('function');
    expect(typeof updated.decrement).toBe('function');
  });

  it('should support machines created with functional builder callbacks', () => {
    const machine = createMachine(
      { count: 1 },
      (next) => ({
        increment() {
          return next({ count: this.context.count + 1 });
        },
      })
    );

    const updated = setContext(machine, { count: 10 });

    expect(updated.context.count).toBe(10);
    expect(updated.increment().context.count).toBe(11);
  });

  it('should preserve class identity and instance fields', () => {
    class ScaledCounter extends MachineBase<{ count: number }> {
      constructor(context: { count: number }, readonly step: number) {
        super(context);
      }

      increment() {
        return setContext(this, { count: this.context.count + this.step });
      }
    }

    const original = new ScaledCounter({ count: 1 }, 3);
    const updated = setContext(original, { count: 10 });

    expect(updated).toBeInstanceOf(ScaledCounter);
    expect(updated.step).toBe(3);
    expect(updated.increment().context.count).toBe(13);
    expect(original.context.count).toBe(1);
  });

  it('should replace accessor-backed context without copying its getter', () => {
    const originalContext = { count: 1 };
    const machine = Object.create({
      get context() {
        return originalContext;
      },
      increment() {
        return setContext(this, { count: this.context.count + 1 });
      },
    }) as Machine<{ count: number }> & { increment(): Machine<{ count: number }> };

    const updated = setContext(machine, { count: 10 });

    expect(updated.context.count).toBe(10);
    expect(updated.increment().context.count).toBe(11);
  });
});

describe('next', () => {
  it('should update context using updater function', () => {
    const machine = createMachine(
      { count: 0 },
      {
        increment() {
          return createMachine({ count: this.context.count + 1 }, this);
        },
      }
    );

    const updated = next(machine, (ctx) => ({ count: ctx.count + 5 }));

    expect(updated.context.count).toBe(5);
    expect(machine.context.count).toBe(0);
  });

  it('should preserve transitions', () => {
    const machine = createMachine(
      { count: 0 },
      {
        increment() {
          return createMachine({ count: this.context.count + 1 }, this);
        },
      }
    );

    const updated = next(machine, (ctx) => ({ count: ctx.count + 1 }));

    expect(typeof updated.increment).toBe('function');
  });

  it('should preserve transitions for functional builder machines', () => {
    const machine = createMachine(
      { count: 2 },
      (next) => ({
        increment() {
          return next({ count: this.context.count + 1 });
        },
      })
    );

    const updated = next(machine, (ctx) => ({ count: ctx.count + 3 }));

    expect(updated.context.count).toBe(5);
    expect(updated.increment().context.count).toBe(6);
  });
});

describe('overrideTransitions', () => {
  it('should override existing transitions', () => {
    const machine = createMachine(
      { count: 0 },
      {
        increment() {
          return createMachine({ count: this.context.count + 1 }, this);
        },
      }
    );

    const overridden = overrideTransitions(machine, {
      increment() {
        return createMachine({ count: this.context.count + 10 }, this);
      },
    });

    const result = overridden.increment();
    expect(result.context.count).toBe(10);
  });

  it('should add new transitions', () => {
    const machine = createMachine(
      { count: 0 },
      {
        increment() {
          return createMachine({ count: this.context.count + 1 }, this);
        },
      }
    );

    const overridden = overrideTransitions(machine, {
      decrement() {
        return createMachine({ count: this.context.count - 1 }, this);
      },
    });

    expect(typeof overridden.decrement).toBe('function');
    const result = overridden.decrement();
    expect(result.context.count).toBe(-1);
  });

  it('should not modify original machine', () => {
    const machine = createMachine(
      { count: 0 },
      {
        increment() {
          return createMachine({ count: this.context.count + 1 }, this);
        },
      }
    );

    const overridden = overrideTransitions(machine, {
      increment() {
        return createMachine({ count: this.context.count + 100 }, this);
      },
    });

    const original = machine.increment();
    const modified = overridden.increment();

    expect(original.context.count).toBe(1);
    expect(modified.context.count).toBe(100);
  });
});

describe('extendTransitions', () => {
  it('should add new transitions without overriding', () => {
    const machine = createMachine(
      { count: 0 },
      {
        increment() {
          return createMachine({ count: this.context.count + 1 }, this);
        },
      }
    );

    const extended = extendTransitions(machine, {
      decrement() {
        return createMachine({ count: this.context.count - 1 }, this);
      },
      reset() {
        return createMachine({ count: 0 }, this);
      },
    });

    expect(typeof extended.increment).toBe('function');
    expect(typeof extended.decrement).toBe('function');
    expect(typeof extended.reset).toBe('function');
  });
});

describe('createMachineBuilder', () => {
  it('should create a builder function from a template machine', () => {
    const template = createMachine(
      { count: 0 },
      {
        increment() {
          return createMachine({ count: this.context.count + 1 }, this);
        },
      }
    );

    const builder = createMachineBuilder(template);
    const machine1 = builder({ count: 5 });
    const machine2 = builder({ count: 10 });

    expect(machine1.context.count).toBe(5);
    expect(machine2.context.count).toBe(10);
    expect(typeof machine1.increment).toBe('function');
    expect(typeof machine2.increment).toBe('function');
  });

  it('should preserve transitions in built machines', () => {
    const template = createMachine(
      { count: 0 },
      {
        increment() {
          return createMachine({ count: this.context.count + 1 }, this);
        },
        add(n: number) {
          return createMachine({ count: this.context.count + n }, this);
        },
      }
    );

    const builder = createMachineBuilder(template);
    const machine = builder({ count: 5 });

    const incremented = machine.increment();
    expect(incremented.context.count).toBe(6);

    const added = machine.add(10);
    expect(added.context.count).toBe(15);
  });

  it('should preserve the template prototype and instance fields', () => {
    class ScaledCounter extends MachineBase<{ count: number }> {
      constructor(context: { count: number }, readonly step: number) {
        super(context);
      }

      increment() {
        return setContext(this, { count: this.context.count + this.step });
      }
    }

    const builder = createMachineBuilder(new ScaledCounter({ count: 0 }, 4));
    const machine = builder({ count: 5 });

    expect(machine).toBeInstanceOf(ScaledCounter);
    expect(machine.step).toBe(4);
    expect(machine.increment().context.count).toBe(9);
  });
});

describe('matchMachine', () => {
  it('should pattern match on discriminated union context', () => {
    type IdleContext = { status: 'idle' };
    type LoadingContext = { status: 'loading' };
    type SuccessContext = { status: 'success'; data: string };

    const machine = createMachine<IdleContext | LoadingContext | SuccessContext>(
      { status: 'success', data: 'test' } as SuccessContext,
      {}
    );

    const result = matchMachine(machine, 'status', {
      idle: () => 'is idle',
      loading: () => 'is loading',
      success: (ctx) => `success: ${ctx.data}`,
    });

    expect(result).toBe('success: test');
  });

  it('should throw error for missing handler', () => {
    const machine = createMachine(
      { status: 'unknown' as any },
      {}
    );

    expect(() => {
      matchMachine(machine, 'status', {
        idle: () => 'idle',
        loading: () => 'loading',
      } as any);
    }).toThrow();
  });
});

describe('hasState', () => {
  it('should return true for matching state', () => {
    const machine = createMachine(
      { status: 'loading' as const, data: null },
      {}
    );

    expect(hasState(machine, 'status', 'loading')).toBe(true);
  });

  it('should return false for non-matching state', () => {
    const machine = createMachine(
      { status: 'loading' as const },
      {}
    );

    expect(hasState(machine, 'status', 'idle' as any)).toBe(false);
  });

  it('should narrow types with discriminated union', () => {
    type Context =
      | { status: 'idle' }
      | { status: 'loading' }
      | { status: 'success'; data: string };

    const machine = createMachine<Context>(
      { status: 'success', data: 'test' },
      {}
    );

    if (hasState(machine, 'status', 'success')) {
      // Type should be narrowed - data property should be accessible
      expect(machine.context.data).toBe('test');
      // TypeScript should know this is the success state
      const data: string = machine.context.data; // Should compile
      expect(data).toBe('test');
    }
  });

  it('should narrow complex discriminated unions', () => {
    type FetchContext =
      | { state: 'idle' }
      | { state: 'loading'; startTime: number }
      | { state: 'success'; data: string; duration: number }
      | { state: 'error'; error: Error };

    const machine = createMachine(
      { state: 'success' as const, data: 'result', duration: 100 },
      {}
    );

    // Test success state narrowing
    if (hasState(machine, 'state', 'success')) {
      expect(machine.context.data).toBe('result');
      expect(machine.context.duration).toBe(100);
      // Both properties should be typed correctly
      const data: string = machine.context.data;
      const duration: number = machine.context.duration;
      expect(data).toBe('result');
      expect(duration).toBe(100);
    } else {
      throw new Error('Should have matched success state');
    }
  });

  it('should narrow with error state', () => {
    type FetchContext =
      | { state: 'idle' }
      | { state: 'loading' }
      | { state: 'success'; data: string }
      | { state: 'error'; error: Error };

    const testError = new Error('Test error');
    const machine = createMachine(
      { state: 'error' as const, error: testError },
      {}
    );

    if (hasState(machine, 'state', 'error')) {
      expect(machine.context.error).toBe(testError);
      // Error property should be typed as Error
      const error: Error = machine.context.error;
      expect(error.message).toBe('Test error');
    } else {
      throw new Error('Should have matched error state');
    }
  });

  it('should work with nested discriminated unions', () => {
    type AuthContext =
      | { auth: 'loggedOut' }
      | { auth: 'loggedIn'; user: { id: number; name: string } }
      | { auth: 'loading'; attempt: number };

    const machine = createMachine(
      { auth: 'loggedIn' as const, user: { id: 1, name: 'Alice' } },
      {}
    );

    if (hasState(machine, 'auth', 'loggedIn')) {
      expect(machine.context.user.id).toBe(1);
      expect(machine.context.user.name).toBe('Alice');
      // Nested object should be properly typed
      const userName: string = machine.context.user.name;
      expect(userName).toBe('Alice');
    } else {
      throw new Error('Should have matched loggedIn state');
    }
  });

  it('should work in if-else chains', () => {
    type Context =
      | { status: 'idle' }
      | { status: 'loading' }
      | { status: 'success'; data: number };

    const machine = createMachine<Context>(
      { status: 'success', data: 42 },
      {}
    );

    let result: string;
    if (hasState(machine, 'status', 'idle')) {
      result = 'idle';
    } else if (hasState(machine, 'status', 'loading')) {
      result = 'loading';
    } else if (hasState(machine, 'status', 'success')) {
      result = `success: ${machine.context.data}`;
    } else {
      result = 'unknown';
    }

    expect(result).toBe('success: 42');
  });

  it('should handle multiple discriminant values', () => {
    type Context =
      | { status: 'idle'; mode: 'manual' }
      | { status: 'loading'; mode: 'auto' }
      | { status: 'success'; mode: 'auto'; result: string };

    const machine = createMachine<Context>(
      { status: 'success', mode: 'auto', result: 'done' },
      {}
    );

    // First check status
    if (hasState(machine, 'status', 'success')) {
      expect(machine.context.result).toBe('done');

      // Then check mode within narrowed context
      if (hasState(machine, 'mode', 'auto')) {
        // Both discriminants should be narrowed
        expect(machine.context.status).toBe('success');
        expect(machine.context.mode).toBe('auto');
        const result: string = machine.context.result;
        expect(result).toBe('done');
      }
    }
  });

  it('should work with literal types', () => {
    type Context = { count: 0 | 1 | 2 | 3 };
    const machine = createMachine({ count: 2 as const }, {});

    if (hasState(machine, 'count', 2)) {
      // Should narrow to exactly 2
      const count: 2 = machine.context.count;
      expect(count).toBe(2);
    }
  });

  it('should preserve transitions while narrowing', () => {
    const machine = createMachine(
      { status: 'success' as const, data: 'test', count: 5 },
      {
        incrementCount: function() {
          return setContext(this, (ctx) => ({ ...ctx, count: ctx.count + 1 }));
        }
      }
    );

    if (hasState(machine, 'status', 'success')) {
      // Should still have transitions available after narrowing
      expect(typeof machine.incrementCount).toBe('function');
      // Should be able to access narrowed properties
      expect(machine.context.data).toBe('test');
      expect(machine.context.status).toBe('success');

      // Should be able to call transitions on narrowed machine
      const newMachine = machine.incrementCount();
      expect(newMachine.context.count).toBe(6);
      expect(newMachine.context.status).toBe('success');
    }
  });
});

describe('createMachineFactory', () => {
  it('should create a factory with context transformers', () => {
    const counterFactory = createMachineFactory<{ count: number }>()({
      increment: (ctx) => ({ count: ctx.count + 1 }),
      decrement: (ctx) => ({ count: ctx.count - 1 }),
      add: (ctx, n: number) => ({ count: ctx.count + n }),
    });

    const counter = counterFactory({ count: 0 });

    expect(counter.context.count).toBe(0);
    expect(typeof counter.increment).toBe('function');
    expect(typeof counter.add).toBe('function');
  });

  it('should return new machines on transitions', () => {
    const counterFactory = createMachineFactory<{ count: number }>()({
      increment: (ctx) => ({ count: ctx.count + 1 }),
    });

    const counter = counterFactory({ count: 0 });
    const next = counter.increment();

    expect(counter.context.count).toBe(0);
    expect(next.context.count).toBe(1);
  });

  it('should handle transitions with parameters', () => {
    const counterFactory = createMachineFactory<{ count: number }>()({
      add: (ctx, n: number) => ({ count: ctx.count + n }),
      multiply: (ctx, n: number) => ({ count: ctx.count * n }),
    });

    const counter = counterFactory({ count: 5 });
    const added = counter.add(3);
    const multiplied = counter.multiply(2);

    expect(counter.context.count).toBe(5);
    expect(added.context.count).toBe(8);
    expect(multiplied.context.count).toBe(10);
  });

  it('should support async transitions', async () => {
    const asyncCounterFactory = createMachineFactory<{ count: number }>()({
      increment: (ctx) => ({ count: ctx.count + 1 }),
    });

    const counter = asyncCounterFactory({ count: 0 });

    // Simulate async transition
    const incrementAsync = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return counter.increment();
    };

    const next = await incrementAsync();

    expect(counter.context.count).toBe(0);
    expect(next.context.count).toBe(1);
  });
});

describe('MachineBase', () => {
  it('should work as a base class for OOP machines', () => {
    class Counter extends MachineBase<{ count: number }> {
      constructor(count = 0) {
        super({ count });
      }

      increment(): Counter {
        return new Counter(this.context.count + 1);
      }

      add(n: number): Counter {
        return new Counter(this.context.count + n);
      }
    }

    const counter = new Counter(0);
    expect(counter.context.count).toBe(0);

    const incremented = counter.increment();
    expect(incremented.context.count).toBe(1);
    expect(counter.context.count).toBe(0);

    const added = incremented.add(10);
    expect(added.context.count).toBe(11);
  });

  it('should preserve readonly context', () => {
    class TestMachine extends MachineBase<{ value: number }> {
      constructor(value: number) {
        super({ value });
      }
    }

    const machine = new TestMachine(5);
    expect(machine.context.value).toBe(5);

    // Context should be readonly (TypeScript enforces this)
    expect(() => {
      (machine.context as any).value = 10;
    }).not.toThrow(); // Runtime doesn't prevent this, only TypeScript
  });
});

describe('Type extraction utilities', () => {
  it('should extract context type', () => {
    const machine = createMachine(
      { count: 0, name: 'test' },
      {
        increment() {
          return createMachine({ count: this.context.count + 1, name: this.context.name }, this);
        },
      }
    );

    type ExtractedContext = Context<typeof machine>;

    const ctx: ExtractedContext = { count: 5, name: 'test' };
    expect(ctx.count).toBe(5);
  });
});
