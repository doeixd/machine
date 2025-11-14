import { describe, it, expect, vi } from 'vitest';
import { createMachine, createAsyncMachine } from '../src/index';
import {
  isState,
  createEvent,
  mergeContext,
  pipeTransitions,
  logState,
} from '../src/utils';
import { MachineBase } from '../src/index';

describe('isState', () => {
  class LoggedOut extends MachineBase<{ status: 'loggedOut' }> {
    constructor() {
      super({ status: 'loggedOut' });
    }

    login(username: string): LoggedIn {
      return new LoggedIn(username);
    }
  }

  class LoggedIn extends MachineBase<{ status: 'loggedIn'; username: string }> {
    constructor(username: string) {
      super({ status: 'loggedIn', username });
    }

    logout(): LoggedOut {
      return new LoggedOut();
    }
  }

  it('should return true for correct instance', () => {
    const machine = new LoggedIn('alice');
    expect(isState(machine, LoggedIn)).toBe(true);
  });

  it('should return false for incorrect instance', () => {
    const machine = new LoggedOut();
    expect(isState(machine, LoggedIn)).toBe(false);
  });

  it('should narrow types as a type guard', () => {
    const machine: LoggedIn | LoggedOut = new LoggedIn('bob');

    if (isState(machine, LoggedIn)) {
      // Type should be narrowed to LoggedIn
      expect(machine.context.username).toBe('bob');
    }
  });
});

describe('createEvent', () => {
  it('should create a type-safe event object', () => {
    type TestMachine = ReturnType<typeof createTestMachine>;

    function createTestMachine() {
      return createMachine(
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
    }

    const incrementEvent = createEvent<TestMachine, 'increment'>('increment');
    expect(incrementEvent).toEqual({ type: 'increment', args: [] });

    const addEvent = createEvent<TestMachine, 'add'>('add', 5);
    expect(addEvent).toEqual({ type: 'add', args: [5] });
  });

  it('should create events with multiple arguments', () => {
    type TestMachine = ReturnType<typeof createTestMachine>;

    function createTestMachine() {
      return createMachine(
        { x: 0, y: 0 },
        {
          moveTo(x: number, y: number) {
            return createMachine({ x, y }, this);
          },
        }
      );
    }

    const event = createEvent<TestMachine, 'moveTo'>('moveTo', 10, 20);
    expect(event).toEqual({ type: 'moveTo', args: [10, 20] });
  });
});

describe('mergeContext', () => {
  it('should shallow merge partial context', () => {
    const machine = createMachine(
      { count: 0, name: 'test', active: true },
      {
        increment() {
          return createMachine(
            { count: this.count + 1, name: this.name, active: this.active },
            this
          );
        },
      }
    );

    const updated = mergeContext(machine, { count: 10, active: false });

    expect(updated.context.count).toBe(10);
    expect(updated.context.name).toBe('test');
    expect(updated.context.active).toBe(false);
  });

  it('should not modify original machine', () => {
    const machine = createMachine(
      { count: 0, name: 'test' },
      {
        increment() {
          return createMachine({ count: this.count + 1, name: this.name }, this);
        },
      }
    );

    const updated = mergeContext(machine, { count: 100 });

    expect(machine.context.count).toBe(0);
    expect(updated.context.count).toBe(100);
  });

  it('should preserve transitions', () => {
    const machine = createMachine(
      { count: 0, name: 'test' },
      {
        increment() {
          return createMachine({ count: this.count + 1, name: this.name }, this);
        },
      }
    );

    const updated = mergeContext(machine, { count: 50 });

    expect(typeof updated.increment).toBe('function');
  });
});

describe('pipeTransitions', () => {
  it('should apply sync transitions sequentially', async () => {
    const transitions = {
      increment() {
        return createAsyncMachine({ count: this.count + 1 }, transitions);
      },
      double() {
        return createAsyncMachine({ count: this.count * 2 }, transitions);
      },
      add(n: number) {
        return createAsyncMachine({ count: this.count + n }, transitions);
      },
    };

    const machine = createAsyncMachine({ count: 0 }, transitions);

    const result = await pipeTransitions(
      machine,
      (m) => m.increment.call(m.context),
      (m) => m.increment.call(m.context),
      (m) => m.double.call(m.context),
      (m) => m.add.call(m.context, 10)
    );

    // (0 + 1 + 1) * 2 + 10 = 14
    expect(result.context.count).toBe(14);
  });

  it('should apply async transitions sequentially', async () => {
    const transitions = {
      async asyncIncrement() {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return createAsyncMachine({ count: this.count + 1 }, transitions);
      },
      async asyncDouble() {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return createAsyncMachine({ count: this.count * 2 }, transitions);
      },
    };

    const machine = createAsyncMachine({ count: 0 }, transitions);

    const result = await pipeTransitions(
      machine,
      (m) => m.asyncIncrement.call(m.context),
      (m) => m.asyncIncrement.call(m.context),
      (m) => m.asyncDouble.call(m.context)
    );

    // (0 + 1 + 1) * 2 = 4
    expect(result.context.count).toBe(4);
  });

  it('should handle mixed sync and async transitions', async () => {
    const transitions = {
      increment() {
        return createAsyncMachine({ count: this.count + 1 }, transitions);
      },
      async asyncDouble() {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return createAsyncMachine({ count: this.count * 2 }, transitions);
      },
    };

    const machine = createAsyncMachine({ count: 0 }, transitions);

    const result = await pipeTransitions(
      machine,
      (m) => m.increment.call(m.context),
      (m) => m.asyncDouble.call(m.context),
      (m) => m.increment.call(m.context)
    );

    // (0 + 1) * 2 + 1 = 3
    expect(result.context.count).toBe(3);
  });

  it('should not mutate original machine', async () => {
    const transitions = {
      increment() {
        return createAsyncMachine({ count: this.count + 1 }, transitions);
      },
    };

    const machine = createAsyncMachine({ count: 0 }, transitions);

    await pipeTransitions(
      machine,
      (m) => m.increment.call(m.context),
      (m) => m.increment.call(m.context)
    );

    expect(machine.context.count).toBe(0);
  });
});

describe('logState', () => {
  it('should log machine context and return machine', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const machine = createMachine(
      { count: 5, name: 'test' },
      {
        increment() {
          return createMachine({ count: this.count + 1, name: this.name }, this);
        },
      }
    );

    const result = logState(machine);

    expect(consoleSpy).toHaveBeenCalledWith({ count: 5, name: 'test' });
    expect(result).toBe(machine);

    consoleSpy.mockRestore();
  });

  it('should log with label', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const machine = createMachine({ count: 10 }, {});

    logState(machine, 'Current state:');

    expect(consoleSpy).toHaveBeenCalledWith('Current state:', { count: 10 });

    consoleSpy.mockRestore();
  });

  it('should work as a tap function in a chain', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const transitions = {
      increment() {
        return createAsyncMachine({ count: this.count + 1 }, transitions);
      },
    };

    const machine = createAsyncMachine({ count: 0 }, transitions);

    const result = await pipeTransitions(
      machine,
      (m) => m.increment.call(m.context),
      (m) => logState(m),
      (m) => m.increment.call(m.context)
    );

    expect(consoleSpy).toHaveBeenCalledWith({ count: 1 });
    expect(result.context.count).toBe(2);

    consoleSpy.mockRestore();
  });
});
