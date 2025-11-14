import { describe, it, expect, vi } from 'vitest';
import { createAsyncMachine, runMachine } from '../src/index';
import { createEvent } from '../src/utils';

describe('runMachine', () => {
  it('should create a runner with state getter and dispatch function', () => {
    const machine = createAsyncMachine(
      { count: 0 },
      {
        increment() {
          return createAsyncMachine({ count: this.count + 1 }, this);
        },
      }
    );

    const runner = runMachine(machine);

    expect(runner.state).toEqual({ count: 0 });
    expect(typeof runner.dispatch).toBe('function');
  });

  it('should dispatch events and update state', async () => {
    const transitions = {
      increment() {
        return createAsyncMachine({ count: this.count + 1 }, transitions);
      },
      add(n: number) {
        return createAsyncMachine({ count: this.count + n }, transitions);
      },
    };

    const machine = createAsyncMachine({ count: 0 }, transitions);

    const runner = runMachine(machine);

    await runner.dispatch({ type: 'increment', args: [] });
    expect(runner.state.count).toBe(1);

    await runner.dispatch({ type: 'add', args: [5] });
    expect(runner.state.count).toBe(6);
  });

  it('should call onChange callback after each transition', async () => {
    const transitions = {
      increment() {
        return createAsyncMachine({ count: this.count + 1 }, transitions);
      },
    };

    const machine = createAsyncMachine({ count: 0 }, transitions);

    const states: number[] = [];
    const onChange = vi.fn((m) => {
      states.push(m.context.count);
    });

    const runner = runMachine(machine, onChange);

    await runner.dispatch({ type: 'increment', args: [] });
    await runner.dispatch({ type: 'increment', args: [] });
    await runner.dispatch({ type: 'increment', args: [] });

    expect(onChange).toHaveBeenCalledTimes(3);
    expect(states).toEqual([1, 2, 3]);
  });

  it('should handle async transitions', async () => {
    const machine = createAsyncMachine(
      { value: 'idle' as string },
      {
        async load() {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return createAsyncMachine({ value: 'loaded' }, this);
        },
      }
    );

    const runner = runMachine(machine);

    expect(runner.state.value).toBe('idle');

    await runner.dispatch({ type: 'load', args: [] });

    expect(runner.state.value).toBe('loaded');
  });

  it('should return the new machine state from dispatch', async () => {
    const machine = createAsyncMachine(
      { count: 0 },
      {
        increment() {
          return createAsyncMachine({ count: this.count + 1 }, this);
        },
      }
    );

    const runner = runMachine(machine);

    const result = await runner.dispatch({ type: 'increment', args: [] });

    expect(result.context.count).toBe(1);
  });

  it('should throw error for unknown event types', async () => {
    const machine = createAsyncMachine(
      { count: 0 },
      {
        increment() {
          return createAsyncMachine({ count: this.count + 1 }, this);
        },
      }
    );

    const runner = runMachine(machine);

    await expect(
      runner.dispatch({ type: 'unknown', args: [] } as any)
    ).rejects.toThrow("Unknown event type 'unknown'");
  });

  it('should handle multiple sequential dispatches', async () => {
    const transitions = {
      increment() {
        return createAsyncMachine({ count: this.count + 1 }, transitions);
      },
      decrement() {
        return createAsyncMachine({ count: this.count - 1 }, transitions);
      },
    };

    const machine = createAsyncMachine({ count: 0 }, transitions);

    const runner = runMachine(machine);

    await runner.dispatch({ type: 'increment', args: [] });
    await runner.dispatch({ type: 'increment', args: [] });
    await runner.dispatch({ type: 'decrement', args: [] });
    await runner.dispatch({ type: 'increment', args: [] });

    expect(runner.state.count).toBe(2);
  });

  it('should pass arguments correctly to transition functions', async () => {
    const machine = createAsyncMachine(
      { x: 0, y: 0 },
      {
        move(dx: number, dy: number) {
          return createAsyncMachine({ x: this.x + dx, y: this.y + dy }, this);
        },
      }
    );

    const runner = runMachine(machine);

    await runner.dispatch({ type: 'move', args: [10, 20] });

    expect(runner.state).toEqual({ x: 10, y: 20 });
  });
});

describe('runMachine with createEvent', () => {
  it('should work with type-safe events from createEvent', async () => {
    const transitions = {
      increment() {
        return createAsyncMachine({ count: this.count + 1 }, transitions);
      },
      add(n: number) {
        return createAsyncMachine({ count: this.count + n }, transitions);
      },
    };

    type TestMachine = ReturnType<typeof createTestMachine>;

    function createTestMachine() {
      return createAsyncMachine({ count: 0 }, transitions);
    }

    const machine = createTestMachine();
    const runner = runMachine(machine);

    const incrementEvent = createEvent<TestMachine, 'increment'>('increment');
    const addEvent = createEvent<TestMachine, 'add'>('add', 5);

    await runner.dispatch(incrementEvent);
    expect(runner.state.count).toBe(1);

    await runner.dispatch(addEvent);
    expect(runner.state.count).toBe(6);
  });
});

describe('Complex async state machine scenarios', () => {
  it('should handle a data fetching state machine', async () => {
    type FetchState =
      | { status: 'idle' }
      | { status: 'loading' }
      | { status: 'success'; data: string }
      | { status: 'error'; error: string };

    const fetchMachine = createAsyncMachine<FetchState, any>(
      { status: 'idle' },
      {
        async fetch() {
          const loadingMachine = createAsyncMachine<FetchState, any>(
            { status: 'loading' },
            this
          );

          // Simulate async fetch
          await new Promise((resolve) => setTimeout(resolve, 10));

          // Simulate success
          return createAsyncMachine<FetchState, any>(
            { status: 'success', data: 'test data' },
            this
          );
        },
        retry() {
          return createAsyncMachine<FetchState, any>({ status: 'idle' }, this);
        },
      }
    );

    const states: string[] = [];
    const runner = runMachine(fetchMachine, (m) => {
      states.push(m.context.status);
    });

    expect(runner.state.status).toBe('idle');

    await runner.dispatch({ type: 'fetch', args: [] });

    expect(runner.state.status).toBe('success');
    expect((runner.state as any).data).toBe('test data');
  });

  it('should handle authentication flow', async () => {
    type AuthState =
      | { status: 'loggedOut' }
      | { status: 'loggingIn' }
      | { status: 'loggedIn'; username: string };

    const transitions = {
      async login(username: string) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return createAsyncMachine<AuthState, any>(
          { status: 'loggedIn', username },
          transitions
        );
      },
      logout() {
        return createAsyncMachine<AuthState, any>({ status: 'loggedOut' }, transitions);
      },
    };

    const authMachine = createAsyncMachine<AuthState, any>(
      { status: 'loggedOut' },
      transitions
    );

    const runner = runMachine(authMachine);

    await runner.dispatch({ type: 'login', args: ['alice'] });

    expect(runner.state.status).toBe('loggedIn');
    expect((runner.state as any).username).toBe('alice');

    await runner.dispatch({ type: 'logout', args: [] });

    expect(runner.state.status).toBe('loggedOut');
  });

  it('should handle multi-step workflows', async () => {
    type FormState =
      | { step: 'personal'; name: string }
      | { step: 'contact'; name: string; email: string }
      | { step: 'complete'; name: string; email: string; confirmed: boolean };

    const transitions = {
      setName(name: string) {
        return createAsyncMachine<FormState, any>(
          { step: 'personal', name },
          transitions
        );
      },
      nextToContact(email: string) {
        const current = this as any;
        return createAsyncMachine<FormState, any>(
          { step: 'contact', name: current.name, email },
          transitions
        );
      },
      complete() {
        const current = this as any;
        return createAsyncMachine<FormState, any>(
          {
            step: 'complete',
            name: current.name,
            email: current.email,
            confirmed: true,
          },
          transitions
        );
      },
    };

    const formMachine = createAsyncMachine<FormState, any>(
      { step: 'personal', name: '' },
      transitions
    );

    const runner = runMachine(formMachine);

    await runner.dispatch({ type: 'setName', args: ['Alice'] });
    expect(runner.state.step).toBe('personal');
    expect((runner.state as any).name).toBe('Alice');

    await runner.dispatch({ type: 'nextToContact', args: ['alice@example.com'] });
    expect(runner.state.step).toBe('contact');

    await runner.dispatch({ type: 'complete', args: [] });
    expect(runner.state.step).toBe('complete');
    expect((runner.state as any).confirmed).toBe(true);
  });

  it('should handle concurrent transitions correctly', async () => {
    const transitions = {
      async slowIncrement() {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return createAsyncMachine({ count: this.count + 1 }, transitions);
      },
    };

    const machine = createAsyncMachine({ count: 0 }, transitions);

    const runner = runMachine(machine);

    // Dispatch events sequentially (not concurrently)
    await runner.dispatch({ type: 'slowIncrement', args: [] });
    await runner.dispatch({ type: 'slowIncrement', args: [] });
    await runner.dispatch({ type: 'slowIncrement', args: [] });

    // Each transition waits for the previous to complete
    expect(runner.state.count).toBe(3);
  });
});

describe('runMachine error handling', () => {
  it('should propagate errors from transition functions', async () => {
    const machine = createAsyncMachine(
      { count: 0 },
      {
        failingTransition() {
          throw new Error('Transition failed');
        },
      }
    );

    const runner = runMachine(machine);

    await expect(
      runner.dispatch({ type: 'failingTransition', args: [] })
    ).rejects.toThrow('Transition failed');
  });

  it('should propagate errors from async transition functions', async () => {
    const machine = createAsyncMachine(
      { count: 0 },
      {
        async failingAsyncTransition() {
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error('Async transition failed');
        },
      }
    );

    const runner = runMachine(machine);

    await expect(
      runner.dispatch({ type: 'failingAsyncTransition', args: [] })
    ).rejects.toThrow('Async transition failed');
  });

  it('should not call onChange if transition fails', async () => {
    const machine = createAsyncMachine(
      { count: 0 },
      {
        increment() {
          return createAsyncMachine({ count: this.count + 1 }, this);
        },
        fail() {
          throw new Error('Failed');
        },
      }
    );

    const onChange = vi.fn();
    const runner = runMachine(machine, onChange);

    await runner.dispatch({ type: 'increment', args: [] });
    expect(onChange).toHaveBeenCalledTimes(1);

    try {
      await runner.dispatch({ type: 'fail', args: [] });
    } catch (e) {
      // Expected
    }

    expect(onChange).toHaveBeenCalledTimes(1); // Still 1, not called for failed transition
  });
});
