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
} from '../src/index';

describe('createMachine', () => {
  it('should create a machine with context and transitions', () => {
    const machine = createMachine(
      { count: 0 },
      {
        increment() {
          return createMachine({ count: this.count + 1 }, this);
        },
      }
    );

    expect(machine.context).toEqual({ count: 0 });
    expect(typeof machine.increment).toBe('function');
  });

  it('should bind context as this in transition functions', () => {
    const machine = createMachine(
      { count: 5 },
      {
        getValue() {
          return this.count;
        },
      }
    );

    expect((machine.getValue as any).call(machine.context)).toBe(5);
  });

  it('should preserve immutability - transitions return new machines', () => {
    const machine = createMachine(
      { count: 0 },
      {
        increment() {
          return createMachine({ count: this.count + 1 }, this);
        },
      }
    );

    const nextMachine = machine.increment.call(machine.context);

    expect(machine.context.count).toBe(0);
    expect(nextMachine.context.count).toBe(1);
    expect(machine).not.toBe(nextMachine);
  });

  it('should handle multiple transitions', () => {
    const transitions = {
      increment() {
        return createMachine({ count: this.count + 1 }, transitions);
      },
      decrement() {
        return createMachine({ count: this.count - 1 }, transitions);
      },
      reset() {
        return createMachine({ count: 0 }, transitions);
      },
    };

    const machine = createMachine({ count: 0 }, transitions);

    let current = machine;
    current = current.increment.call(current.context);
    current = current.increment.call(current.context);
    current = current.decrement.call(current.context);

    expect(current.context.count).toBe(1);
  });

  it('should handle transitions with parameters', () => {
    const machine = createMachine(
      { count: 0 },
      {
        add(n: number) {
          return createMachine({ count: this.count + n }, this);
        },
      }
    );

    const nextMachine = machine.add.call(machine.context, 5);
    expect(nextMachine.context.count).toBe(5);
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
          return createAsyncMachine({ value: this.value + 1 }, this);
        },
      }
    );

    const nextMachine = await machine.increment.call(machine.context);
    expect(nextMachine.context.value).toBe(1);
  });
});

describe('setContext', () => {
  it('should update context with a new object', () => {
    const machine = createMachine(
      { count: 0 },
      {
        increment() {
          return createMachine({ count: this.count + 1 }, this);
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
          return createMachine({ count: this.count + 1, name: this.name }, this);
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
          return createMachine({ count: this.count + 1 }, this);
        },
        decrement() {
          return createMachine({ count: this.count - 1 }, this);
        },
      }
    );

    const updated = setContext(machine, { count: 100 });

    expect(typeof updated.increment).toBe('function');
    expect(typeof updated.decrement).toBe('function');
  });
});

describe('next', () => {
  it('should update context using updater function', () => {
    const machine = createMachine(
      { count: 0 },
      {
        increment() {
          return createMachine({ count: this.count + 1 }, this);
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
          return createMachine({ count: this.count + 1 }, this);
        },
      }
    );

    const updated = next(machine, (ctx) => ({ count: ctx.count + 1 }));

    expect(typeof updated.increment).toBe('function');
  });
});

describe('overrideTransitions', () => {
  it('should override existing transitions', () => {
    const machine = createMachine(
      { count: 0 },
      {
        increment() {
          return createMachine({ count: this.count + 1 }, this);
        },
      }
    );

    const overridden = overrideTransitions(machine, {
      increment() {
        return createMachine({ count: this.count + 10 }, this);
      },
    });

    const result = overridden.increment.call(overridden.context);
    expect(result.context.count).toBe(10);
  });

  it('should add new transitions', () => {
    const machine = createMachine(
      { count: 0 },
      {
        increment() {
          return createMachine({ count: this.count + 1 }, this);
        },
      }
    );

    const overridden = overrideTransitions(machine, {
      decrement() {
        return createMachine({ count: this.count - 1 }, this);
      },
    });

    expect(typeof overridden.decrement).toBe('function');
    const result = overridden.decrement.call(overridden.context);
    expect(result.context.count).toBe(-1);
  });

  it('should not modify original machine', () => {
    const machine = createMachine(
      { count: 0 },
      {
        increment() {
          return createMachine({ count: this.count + 1 }, this);
        },
      }
    );

    const overridden = overrideTransitions(machine, {
      increment() {
        return createMachine({ count: this.count + 100 }, this);
      },
    });

    const original = machine.increment.call(machine.context);
    const modified = overridden.increment.call(overridden.context);

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
          return createMachine({ count: this.count + 1 }, this);
        },
      }
    );

    const extended = extendTransitions(machine, {
      decrement() {
        return createMachine({ count: this.count - 1 }, this);
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
          return createMachine({ count: this.count + 1 }, this);
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
          return createMachine({ count: this.count + 1 }, this);
        },
        add(n: number) {
          return createMachine({ count: this.count + n }, this);
        },
      }
    );

    const builder = createMachineBuilder(template);
    const machine = builder({ count: 5 });

    const incremented = machine.increment.call(machine.context);
    expect(incremented.context.count).toBe(6);

    const added = machine.add.call(machine.context, 10);
    expect(added.context.count).toBe(15);
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

  it('should narrow types with type guard', () => {
    type Context =
      | { status: 'idle' }
      | { status: 'loading' }
      | { status: 'success'; data: string };

    const machine = createMachine<Context>(
      { status: 'success', data: 'test' },
      {}
    );

    if (hasState(machine, 'status', 'success')) {
      // Type should be narrowed here
      expect(machine.context.data).toBe('test');
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
    const next = counter.increment.call(counter.context);

    expect(counter.context.count).toBe(0);
    expect(next.context.count).toBe(1);
  });

  it('should handle transitions with parameters', () => {
    const counterFactory = createMachineFactory<{ count: number }>()({
      add: (ctx, n: number) => ({ count: ctx.count + n }),
      multiply: (ctx, n: number) => ({ count: ctx.count * n }),
    });

    const counter = counterFactory({ count: 5 });
    const added = counter.add.call(counter.context, 10);
    const multiplied = added.multiply.call(added.context, 2);

    expect(multiplied.context.count).toBe(30);
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
          return createMachine({ count: this.count + 1, name: this.name }, this);
        },
      }
    );

    type ExtractedContext = Context<typeof machine>;

    const ctx: ExtractedContext = { count: 5, name: 'test' };
    expect(ctx.count).toBe(5);
  });
});
