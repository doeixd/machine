import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMachine } from '../src/index';
import {
  createRunner,
  createEnsemble,
  runWithRunner,
  runWithEnsemble,
  MultiMachineBase,
  createMultiMachine,
  createMutableMachine,
  type Runner,
  type Ensemble,
  type StateStore,
} from '../src/multi';

// ============================================================================
// RUNNER TESTS
// ============================================================================

describe('createRunner', () => {
  it('should create a runner with initial machine state', () => {
    const machine = createMachine({ count: 0 }, {
      increment() {
        return createMachine({ count: this.count + 1 }, this);
      },
    });

    const runner = createRunner(machine);

    expect(runner.state).toBe(machine);
    expect(runner.context).toEqual({ count: 0 });
  });

  it('should provide stable actions object', () => {
    const machine = createMachine({ count: 0 }, {
      increment() {
        return createMachine({ count: this.count + 1 }, this);
      },
    });

    const runner = createRunner(machine);
    const actionsRef = runner.actions;

    expect(runner.actions).toBe(actionsRef);
  });

  it('should update state when action is called', () => {
    const machine = createMachine({ count: 0 }, {
      increment() {
        return createMachine({ count: this.count + 1 }, this);
      },
    });

    const runner = createRunner(machine);
    runner.actions.increment();

    expect(runner.state.context.count).toBe(1);
    expect(runner.context.count).toBe(1);
  });

  it('should return new machine from actions', () => {
    const machine = createMachine({ count: 0 }, {
      increment() {
        return createMachine({ count: this.count + 1 }, this);
      },
    });

    const runner = createRunner(machine);
    const result = runner.actions.increment();

    expect(result.context.count).toBe(1);
  });

  it('should handle multiple consecutive transitions', () => {
    const machine = createMachine({ count: 0 }, {
      increment() {
        return createMachine({ count: this.count + 1 }, this);
      },
      add(n: number) {
        return createMachine({ count: this.count + n }, this);
      },
    });

    const runner = createRunner(machine);
    runner.actions.increment();
    runner.actions.add(5);
    runner.actions.increment();

    expect(runner.context.count).toBe(7);
  });

  it('should call onChange callback after each transition', () => {
    const onChange = vi.fn();
    const machine = createMachine({ count: 0 }, {
      increment() {
        return createMachine({ count: this.count + 1 }, this);
      },
    });

    const runner = createRunner(machine, onChange);
    runner.actions.increment();
    runner.actions.increment();

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      context: { count: 2 }
    }));
  });

  it('should support setState for manual state updates', () => {
    const machine = createMachine({ count: 0 }, {
      increment() {
        return createMachine({ count: this.count + 1 }, this);
      },
    });

    const runner = createRunner(machine);
    const newMachine = createMachine({ count: 10 }, {
      increment() {
        return createMachine({ count: this.count + 1 }, this);
      },
    });

    runner.setState(newMachine);

    expect(runner.state.context.count).toBe(10);
  });

  it('should fire onChange when setState is called', () => {
    const onChange = vi.fn();
    const machine = createMachine({ count: 0 }, {
      increment() {
        return createMachine({ count: this.count + 1 }, this);
      },
    });

    const runner = createRunner(machine, onChange);
    const newMachine = createMachine({ count: 5 }, {
      increment() {
        return createMachine({ count: this.count + 1 }, this);
      },
    });

    runner.setState(newMachine);

    expect(onChange).toHaveBeenCalledWith(newMachine);
  });

  it('should handle transitions with parameters', () => {
    const machine = createMachine({ count: 0 }, {
      add(n: number) {
        return createMachine({ count: this.count + n }, this);
      },
    });

    const runner = createRunner(machine);
    runner.actions.add(5);
    runner.actions.add(3);

    expect(runner.context.count).toBe(8);
  });

  it('should return undefined for non-existent actions', () => {
    const machine = createMachine({ count: 0 }, {
      increment() {
        return createMachine({ count: this.count + 1 }, this);
      },
    });

    const runner = createRunner(machine);
    expect((runner.actions as any).nonExistent).toBeUndefined();
  });

  it('should work with union-type machines (Type-State)', () => {
    type LoggedOut = ReturnType<typeof createLoggedOut>;
    type LoggedIn = ReturnType<typeof createLoggedIn>;
    type AuthMachine = LoggedOut | LoggedIn;

    const createLoggedOut = () => createMachine(
      { status: 'loggedOut' as const },
      {
        login: (username: string) => createLoggedIn(username)
      }
    );

    const createLoggedIn = (username: string) => createMachine(
      { status: 'loggedIn' as const, username },
      {
        logout: () => createLoggedOut()
      }
    );

    const runner = createRunner(createLoggedOut() as AuthMachine);

    expect(runner.state.context.status).toBe('loggedOut');
    (runner.actions as any).login('alice');
    expect(runner.state.context.status).toBe('loggedIn');
    expect((runner.state as any).context.username).toBe('alice');
  });
});

// ============================================================================
// STATE STORE TESTS
// ============================================================================

describe('StateStore interface', () => {
  it('should work with simple object store', () => {
    let context = { count: 0 };
    const store: StateStore<typeof context> = {
      getContext: () => context,
      setContext: (newCtx) => { context = newCtx; }
    };

    store.setContext({ count: 5 });
    expect(store.getContext()).toEqual({ count: 5 });
  });

  it('should provide fresh context on each getContext call', () => {
    let context = { count: 0 };
    const store: StateStore<typeof context> = {
      getContext: () => context,
      setContext: (newCtx) => { context = newCtx; }
    };

    const ctx1 = store.getContext();
    store.setContext({ count: 1 });
    const ctx2 = store.getContext();

    expect(ctx1.count).toBe(0);
    expect(ctx2.count).toBe(1);
  });
});

// ============================================================================
// ENSEMBLE TESTS
// ============================================================================

describe('createEnsemble', () => {
  it('should create an ensemble with initial context', () => {
    let context = { status: 'idle' as const };
    const store = {
      getContext: () => context,
      setContext: (newCtx: typeof context) => { context = newCtx; }
    };

    const factories = {
      idle: (ctx: typeof context) => createMachine(ctx, {
        start: () => store.setContext({ status: 'loading' as const })
      })
    };

    const ensemble = createEnsemble(store, factories, (ctx) => ctx.status);

    expect(ensemble.context).toEqual({ status: 'idle' });
  });

  it('should provide current machine based on context state', () => {
    let context: { status: 'idle' | 'loading' } = { status: 'idle' };
    const store = {
      getContext: () => context,
      setContext: (newCtx: typeof context) => { context = newCtx; }
    };

    const factories = {
      idle: (ctx: typeof context) => createMachine(ctx, {
        start: () => store.setContext({ status: 'loading' })
      }),
      loading: (ctx: typeof context) => createMachine(ctx, {
        stop: () => store.setContext({ status: 'idle' })
      })
    };

    const ensemble = createEnsemble(store, factories, (ctx) => ctx.status);

    expect(ensemble.state.context.status).toBe('idle');
    expect(typeof (ensemble.state as any).start).toBe('function');
  });

  it('should dynamically reconstruct machine based on current state', () => {
    let context: { status: 'idle' | 'loading' } = { status: 'idle' };
    const store = {
      getContext: () => context,
      setContext: (newCtx: typeof context) => { context = newCtx; }
    };

    const factories = {
      idle: (ctx: typeof context) => createMachine(ctx, {
        start: () => store.setContext({ status: 'loading' })
      }),
      loading: (ctx: typeof context) => createMachine(ctx, {
        stop: () => store.setContext({ status: 'idle' })
      })
    };

    const ensemble = createEnsemble(store, factories, (ctx) => ctx.status);

    (ensemble.actions as any).start();
    expect(ensemble.context.status).toBe('loading');
    expect(typeof (ensemble.state as any).stop).toBe('function');
  });

  it('should call transitions through actions', () => {
    let context: { status: 'idle' | 'loading'; data?: string } = { status: 'idle' };
    const store = {
      getContext: () => context,
      setContext: (newCtx: typeof context) => { context = newCtx; }
    };

    const factories = {
      idle: (ctx: typeof context) => createMachine(ctx, {
        fetch: () => store.setContext({ ...ctx, status: 'loading' })
      }),
      loading: (ctx: typeof context) => createMachine(ctx, {
        succeed: (data: string) => store.setContext({ status: 'idle', data })
      })
    };

    const ensemble = createEnsemble(store, factories, (ctx) => ctx.status);

    (ensemble.actions as any).fetch();
    expect(ensemble.context.status).toBe('loading');
    (ensemble.actions as any).succeed('hello');
    expect(ensemble.context.status).toBe('idle');
    expect(ensemble.context.data).toBe('hello');
  });

  it('should throw for invalid state in getDiscriminant', () => {
    let context: { status: string } = { status: 'idle' };
    const store = {
      getContext: () => context,
      setContext: (newCtx: typeof context) => { context = newCtx; }
    };

    const factories = {
      idle: (ctx: typeof context) => createMachine(ctx, {})
    };

    const ensemble = createEnsemble(store, factories, (ctx) => ctx.status);

    context = { status: 'invalid' };

    expect(() => ensemble.state).toThrow();
  });

  it('should throw when action is not valid for current state', () => {
    let context: { status: 'idle' | 'loading' } = { status: 'idle' };
    const store = {
      getContext: () => context,
      setContext: (newCtx: typeof context) => { context = newCtx; }
    };

    const factories = {
      idle: (ctx: typeof context) => createMachine(ctx, {
        start: () => store.setContext({ status: 'loading' })
      }),
      loading: (ctx: typeof context) => createMachine(ctx, {
        stop: () => store.setContext({ status: 'idle' })
      })
    };

    const ensemble = createEnsemble(store, factories, (ctx) => ctx.status);

    expect(() => (ensemble.actions as any).stop()).toThrow();
  });

  it('should maintain stable actions object', () => {
    let context = { status: 'idle' as const };
    const store = {
      getContext: () => context,
      setContext: (newCtx: typeof context) => { context = newCtx; }
    };

    const factories = {
      idle: (ctx: typeof context) => createMachine(ctx, {})
    };

    const ensemble = createEnsemble(store, factories, (ctx) => ctx.status);
    const actions1 = ensemble.actions;
    const actions2 = ensemble.actions;

    expect(actions1).toBe(actions2);
  });

  it('should work with complex discriminant function', () => {
    type Context = { user?: { role: string } };
    let context: Context = { user: { role: 'admin' } };

    const store = {
      getContext: () => context,
      setContext: (newCtx: Context) => { context = newCtx; }
    };

    const factories = {
      admin: (ctx: Context) => createMachine(ctx, {}),
      guest: (ctx: Context) => createMachine(ctx, {})
    };

    const ensemble = createEnsemble(
      store,
      factories,
      (ctx) => (ctx.user?.role || 'guest') as 'admin' | 'guest'
    );

    expect(ensemble.context.user?.role).toBe('admin');
  });
});

// ============================================================================
// GENERATOR-BASED INTEGRATION TESTS
// ============================================================================

describe('runWithRunner', () => {
  it('should execute generator workflow with runner', () => {
    const machine = createMachine({ count: 0 }, {
      increment() {
        return createMachine({ count: this.count + 1 }, this);
      },
      add(n: number) {
        return createMachine({ count: this.count + n }, this);
      }
    });

    const result = runWithRunner(function* (runner) {
      runner.actions.increment();
      runner.actions.add(5);
      return runner.context.count;
    }, machine);

    expect(result).toBe(6);
  });

  it('should allow conditional logic in generator', () => {
    const machine = createMachine({ count: 0 }, {
      increment() {
        return createMachine({ count: this.count + 1 }, this);
      },
      reset() {
        return createMachine({ count: 0 }, this);
      }
    });

    const result = runWithRunner(function* (runner) {
      runner.actions.increment();
      runner.actions.increment();
      if (runner.context.count > 1) {
        runner.actions.reset();
      }
      return runner.context.count;
    }, machine);

    expect(result).toBe(0);
  });

  it('should return generator return value', () => {
    const machine = createMachine({ count: 0 }, {
      increment() {
        return createMachine({ count: this.count + 1 }, this);
      }
    });

    const result = runWithRunner(function* (runner) {
      runner.actions.increment();
      return { final: runner.context.count, message: 'done' };
    }, machine);

    expect(result).toEqual({ final: 1, message: 'done' });
  });

  it('should handle multiple state transitions in loop', () => {
    const machine = createMachine({ count: 0 }, {
      increment() {
        return createMachine({ count: this.count + 1 }, this);
      }
    });

    const result = runWithRunner(function* (runner) {
      for (let i = 0; i < 5; i++) {
        runner.actions.increment();
      }
      return runner.context.count;
    }, machine);

    expect(result).toBe(5);
  });
});

describe('runWithEnsemble', () => {
  it('should execute generator workflow with ensemble', () => {
    let context: { status: 'idle' | 'done'; value: number } = { status: 'idle', value: 0 };
    const store = {
      getContext: () => context,
      setContext: (newCtx: typeof context) => { context = newCtx; }
    };

    const factories = {
      idle: (ctx: typeof context) => createMachine(ctx, {
        finish: (value: number) => store.setContext({ status: 'done', value })
      }),
      done: (ctx: typeof context) => createMachine(ctx, {})
    };

    const ensemble = createEnsemble(store, factories, (ctx) => ctx.status);

    const result = runWithEnsemble(function* (e) {
      (e.actions as any).finish(42);
      return e.context.value;
    }, ensemble);

    expect(result).toBe(42);
  });

  it('should share context across entire workflow', () => {
    let context: { count: number; status: string } = { count: 0, status: 'pending' };
    const store = {
      getContext: () => context,
      setContext: (newCtx: typeof context) => { context = newCtx; }
    };

    const factories = {
      pending: (ctx: typeof context) => createMachine(ctx, {
        update: (count: number) => store.setContext({ ...ctx, count, status: 'done' })
      }),
      done: (ctx: typeof context) => createMachine(ctx, {})
    };

    const ensemble = createEnsemble(store, factories, (ctx) => ctx.status);

    const result = runWithEnsemble(function* (e) {
      const initialCount = e.context.count;
      (e.actions as any).update(10);
      return { initial: initialCount, final: e.context.count };
    }, ensemble);

    expect(result).toEqual({ initial: 0, final: 10 });
  });

  it('should allow conditional logic based on ensemble state', () => {
    let context: { status: 'idle' | 'processing'; value: number } = { status: 'idle', value: 0 };
    const store = {
      getContext: () => context,
      setContext: (newCtx: typeof context) => { context = newCtx; }
    };

    const factories = {
      idle: (ctx: typeof context) => createMachine(ctx, {
        process: (value: number) => store.setContext({ status: 'processing', value })
      }),
      processing: (ctx: typeof context) => createMachine(ctx, {})
    };

    const ensemble = createEnsemble(store, factories, (ctx) => ctx.status);

    const result = runWithEnsemble(function* (e) {
      if (e.context.status === 'idle') {
        (e.actions as any).process(99);
      }
      return e.context.value;
    }, ensemble);

    expect(result).toBe(99);
  });
});

// ============================================================================
// MULTI-MACHINE BASE CLASS TESTS
// ============================================================================

describe('MultiMachineBase', () => {
  it('should allow extending with custom transitions', () => {
    type CounterContext = { count: number };

    class CounterMachine extends MultiMachineBase<CounterContext> {
      increment() {
        this.setContext({ count: this.context.count + 1 });
      }
    }

    let sharedContext: CounterContext = { count: 0 };
    const store = {
      getContext: () => sharedContext,
      setContext: (ctx: CounterContext) => { sharedContext = ctx; }
    };

    const instance = new CounterMachine(store);
    expect(instance.context.count).toBe(0);
    instance.increment();
    expect(instance.context.count).toBe(1);
  });

  it('should provide context getter', () => {
    type AppContext = { name: string };

    class AppMachine extends MultiMachineBase<AppContext> {
      getName() {
        return this.context.name;
      }
    }

    let sharedContext: AppContext = { name: 'test' };
    const store = {
      getContext: () => sharedContext,
      setContext: (ctx: AppContext) => { sharedContext = ctx; }
    };

    const instance = new AppMachine(store);
    expect(instance.getName()).toBe('test');
  });

  it('should provide setContext method', () => {
    type CounterContext = { count: number };

    class CounterMachine extends MultiMachineBase<CounterContext> {
      add(n: number) {
        this.setContext({ count: this.context.count + n });
      }
    }

    let sharedContext: CounterContext = { count: 5 };
    const store = {
      getContext: () => sharedContext,
      setContext: (ctx: CounterContext) => { sharedContext = ctx; }
    };

    const instance = new CounterMachine(store);
    instance.add(3);
    expect(sharedContext.count).toBe(8);
  });
});

// ============================================================================
// CREATE MULTI-MACHINE TESTS
// ============================================================================

describe('createMultiMachine', () => {
  it('should create instance from MultiMachine class', () => {
    type CounterContext = { count: number };

    class CounterMachine extends MultiMachineBase<CounterContext> {
      increment() {
        this.setContext({ count: this.context.count + 1 });
      }
    }

    let sharedContext: CounterContext = { count: 0 };
    const store = {
      getContext: () => sharedContext,
      setContext: (ctx: CounterContext) => { sharedContext = ctx; }
    };

    const machine = createMultiMachine(CounterMachine, store);

    expect((machine as any).count).toBe(0);
  });

  it('should allow accessing context properties directly', () => {
    type AppContext = { status: string; count: number };

    class AppMachine extends MultiMachineBase<AppContext> {}

    let sharedContext: AppContext = { status: 'idle', count: 0 };
    const store = {
      getContext: () => sharedContext,
      setContext: (ctx: AppContext) => { sharedContext = ctx; }
    };

    const machine = createMultiMachine(AppMachine, store);

    expect((machine as any).status).toBe('idle');
    expect((machine as any).count).toBe(0);
  });

  it('should call methods on machine instance', () => {
    type CounterContext = { count: number };

    class CounterMachine extends MultiMachineBase<CounterContext> {
      increment() {
        this.setContext({ count: this.context.count + 1 });
      }
    }

    let sharedContext: CounterContext = { count: 0 };
    const store = {
      getContext: () => sharedContext,
      setContext: (ctx: CounterContext) => { sharedContext = ctx; }
    };

    const machine = createMultiMachine(CounterMachine, store);
    (machine as any).increment();

    expect((machine as any).count).toBe(1);
  });

  it('should update context through methods', () => {
    type CounterContext = { count: number };

    class CounterMachine extends MultiMachineBase<CounterContext> {
      add(n: number) {
        this.setContext({ count: this.context.count + n });
      }

      reset() {
        this.setContext({ count: 0 });
      }
    }

    let sharedContext: CounterContext = { count: 0 };
    const store = {
      getContext: () => sharedContext,
      setContext: (ctx: CounterContext) => { sharedContext = ctx; }
    };

    const machine = createMultiMachine(CounterMachine, store);
    (machine as any).add(5);
    (machine as any).add(3);
    expect((machine as any).count).toBe(8);
    (machine as any).reset();
    expect((machine as any).count).toBe(0);
  });

  it('should reflect store changes in proxied object', () => {
    type CounterContext = { count: number };

    class CounterMachine extends MultiMachineBase<CounterContext> {
      increment() {
        this.setContext({ count: this.context.count + 1 });
      }
    }

    let sharedContext: CounterContext = { count: 0 };
    const store = {
      getContext: () => sharedContext,
      setContext: (ctx: CounterContext) => { sharedContext = ctx; }
    };

    const machine = createMultiMachine(CounterMachine, store);

    // Manually update store (simulating external change)
    store.setContext({ count: 10 });

    expect((machine as any).count).toBe(10);
  });

  it('should support multiple methods', () => {
    type CounterContext = { count: number };

    class CounterMachine extends MultiMachineBase<CounterContext> {
      increment() {
        this.setContext({ count: this.context.count + 1 });
      }

      decrement() {
        this.setContext({ count: this.context.count - 1 });
      }

      multiply(n: number) {
        this.setContext({ count: this.context.count * n });
      }
    }

    let sharedContext: CounterContext = { count: 1 };
    const store = {
      getContext: () => sharedContext,
      setContext: (ctx: CounterContext) => { sharedContext = ctx; }
    };

    const machine = createMultiMachine(CounterMachine, store);

    (machine as any).increment();
    (machine as any).increment();
    (machine as any).multiply(3);
    (machine as any).decrement();

    expect((machine as any).count).toBe(8); // (1 + 1 + 1) * 3 - 1
  });

  it('should support async methods', async () => {
    type DataContext = { status: string; data?: any };

    class DataMachine extends MultiMachineBase<DataContext> {
      async loadData() {
        this.setContext({ ...this.context, status: 'loading' });
        // Simulate async work
        await new Promise(resolve => setTimeout(resolve, 0));
        this.setContext({ ...this.context, status: 'loaded', data: 'test' });
      }
    }

    let sharedContext: DataContext = { status: 'idle' };
    const store = {
      getContext: () => sharedContext,
      setContext: (ctx: DataContext) => { sharedContext = ctx; }
    };

    const machine = createMultiMachine(DataMachine, store);

    await (machine as any).loadData();

    expect((machine as any).status).toBe('loaded');
    expect((machine as any).data).toBe('test');
  });

  it('should support methods with parameters', () => {
    type CounterContext = { count: number; multiplier: number };

    class CounterMachine extends MultiMachineBase<CounterContext> {
      add(n: number) {
        this.setContext({ count: this.context.count + n, multiplier: this.context.multiplier });
      }

      setMultiplier(m: number) {
        this.setContext({ count: this.context.count, multiplier: m });
      }
    }

    let sharedContext: CounterContext = { count: 0, multiplier: 1 };
    const store = {
      getContext: () => sharedContext,
      setContext: (ctx: CounterContext) => { sharedContext = ctx; }
    };

    const machine = createMultiMachine(CounterMachine, store);

    (machine as any).add(5);
    (machine as any).setMultiplier(2);

    expect((machine as any).count).toBe(5);
    expect((machine as any).multiplier).toBe(2);
  });

  it('should support property assignment through proxy', () => {
    type CounterContext = { count: number };

    class CounterMachine extends MultiMachineBase<CounterContext> {}

    let sharedContext: CounterContext = { count: 0 };
    const store = {
      getContext: () => sharedContext,
      setContext: (ctx: CounterContext) => { sharedContext = ctx; }
    };

    const machine = createMultiMachine(CounterMachine, store);

    (machine as any).count = 5;

    expect((machine as any).count).toBe(5);
    expect(sharedContext.count).toBe(5);
  });

  it('should support in operator', () => {
    type CounterContext = { count: number };

    class CounterMachine extends MultiMachineBase<CounterContext> {
      increment() {
        this.setContext({ count: this.context.count + 1 });
      }
    }

    let sharedContext: CounterContext = { count: 0 };
    const store = {
      getContext: () => sharedContext,
      setContext: (ctx: CounterContext) => { sharedContext = ctx; }
    };

    const machine = createMultiMachine(CounterMachine, store);

    expect('count' in machine).toBe(true);
    expect('increment' in machine).toBe(true);
    expect('nonExistent' in machine).toBe(false);
  });
});

// ============================================================================
// MUTABLE MACHINE TESTS
// ============================================================================

describe('createMutableMachine', () => {
  it('should create mutable machine with initial context', () => {
    type AuthContext = { status: 'idle' };

    const factories = {
      idle: (ctx: AuthContext) => createMachine(ctx, {
        login: () => ({ status: 'loggedIn' as const, username: 'alice' })
      })
    };

    const mutable = createMutableMachine(
      { status: 'idle' as const } as any,
      factories,
      (ctx) => ctx.status
    );

    expect((mutable as any).status).toBe('idle');
  });

  it('should update mutable context through transitions', () => {
    type AuthContext = { status: 'idle' | 'loggedIn'; username?: string };

    const factories = {
      idle: (ctx: AuthContext) => createMachine(ctx, {
        login: (username: string) => ({ status: 'loggedIn' as const, username })
      }),
      loggedIn: (ctx: AuthContext) => createMachine(ctx, {
        logout: () => ({ status: 'idle' as const })
      })
    };

    let context: AuthContext = { status: 'idle' };

    const mutable = createMutableMachine(
      context,
      factories,
      (ctx) => ctx.status
    );

    (mutable as any).login('alice');

    expect((mutable as any).status).toBe('loggedIn');
    expect((mutable as any).username).toBe('alice');
  });

  it('should maintain object reference through mutations', () => {
    type CounterContext = { count: number };

    const factories = {
      idle: (ctx: CounterContext) => createMachine(ctx, {
        increment: () => ({ count: ctx.count + 1 })
      })
    };

    const context: CounterContext = { count: 0 };
    const mutable = createMutableMachine(
      context,
      factories,
      () => 'idle' as const
    );

    const ref = mutable;
    (mutable as any).increment();

    expect(ref).toBe(mutable);
    expect((ref as any).count).toBe(1);
  });

  it('should throw for invalid state in getDiscriminant', () => {
    type Context = { status: string };

    const factories = {
      idle: (ctx: Context) => createMachine(ctx, {})
    };

    const context: Context = { status: 'invalid' };

    const mutable = createMutableMachine(
      context,
      factories,
      (ctx) => ctx.status as 'idle'
    );

    expect(() => (mutable as any).someMethod).toThrow();
  });

  it('should support property access via proxy', () => {
    type Context = { count: number };

    const factories = {
      idle: (ctx: Context) => createMachine(ctx, {})
    };

    const context: Context = { count: 5 };

    const mutable = createMutableMachine(
      context,
      factories,
      () => 'idle' as const
    );

    expect((mutable as any).count).toBe(5);
  });

  it('should support property mutation via proxy', () => {
    type Context = { count: number };

    const factories = {
      idle: (ctx: Context) => createMachine(ctx, {})
    };

    const context: Context = { count: 0 };

    const mutable = createMutableMachine(
      context,
      factories,
      () => 'idle' as const
    );

    (mutable as any).count = 10;

    expect((mutable as any).count).toBe(10);
  });

  it('should handle multiple state transitions', () => {
    type GameContext = { state: 'idle' | 'running' | 'paused'; score: number };

    const factories = {
      idle: (ctx: GameContext) => createMachine(ctx, {
        start: () => ({ ...ctx, state: 'running' as const })
      }),
      running: (ctx: GameContext) => createMachine(ctx, {
        pause: () => ({ ...ctx, state: 'paused' as const }),
        addScore: (points: number) => ({ ...ctx, score: ctx.score + points })
      }),
      paused: (ctx: GameContext) => createMachine(ctx, {
        resume: () => ({ ...ctx, state: 'running' as const })
      })
    };

    const context: GameContext = { state: 'idle', score: 0 };

    const game = createMutableMachine(
      context,
      factories,
      (ctx) => ctx.state
    );

    (game as any).start();
    expect((game as any).state).toBe('running');

    (game as any).addScore(10);
    expect((game as any).score).toBe(10);

    (game as any).pause();
    expect((game as any).state).toBe('paused');

    (game as any).resume();
    expect((game as any).state).toBe('running');
  });

  it('should warn if transition does not return valid context', () => {
    const warnSpy = vi.spyOn(console, 'warn');

    type Context = { count: number };

    const factories = {
      idle: (ctx: Context) => createMachine(ctx, {
        invalid: () => null as any
      })
    };

    const context: Context = { count: 0 };

    const mutable = createMutableMachine(
      context,
      factories,
      () => 'idle' as const
    );

    (mutable as any).invalid();

    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
