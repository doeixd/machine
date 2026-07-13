import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { createAsyncMachine as createCoreAsyncMachine, createMachine as createCoreMachine, MachineBase } from '../src';
import {
  batchTransitions,
  createAsyncMachine,
  createMachine,
  createMachineContext,
  createMachineStore,
} from '../src/solid';

class Idle extends MachineBase<{ tag: 'idle' }> {
  constructor() {
    super({ tag: 'idle' });
  }

  start(): Active {
    return new Active();
  }
}

class Active extends MachineBase<{ tag: 'active'; count: number }> {
  constructor(count = 0) {
    super({ tag: 'active', count });
  }

  increment(): Active {
    return new Active(this.context.count + 1);
  }

  reset(): Idle {
    return new Idle();
  }
}

describe('Solid integration', () => {
  it('keeps actions in sync when typestate transition names change', () => {
    const [machine, actions] = createMachine<Idle | Active>(() => new Idle());

    actions.start();
    expect(machine()).toBeInstanceOf(Active);

    actions.increment();
    expect((machine() as Active).context.count).toBe(1);

    actions.reset();
    expect(machine()).toBeInstanceOf(Idle);
  });

  it('rejects transitions that are unavailable in the current state', () => {
    const [, actions] = createMachine<Idle | Active>(() => new Idle());
    expect(() => actions.reset()).toThrow("Transition 'reset' is not available");
  });

  it('constructs an async machine only once', () => {
    let initializations = 0;

    createAsyncMachine(() => {
      initializations += 1;
      return createCoreAsyncMachine({ count: 0 }, {
        increment() {
          return createCoreAsyncMachine({ count: this.context.count + 1 }, this);
        },
      });
    });

    expect(initializations).toBe(1);
  });

  it('uses Solid batch without requiring CommonJS globals', () => {
    const machine = new Active();
    let current = machine;

    const result = batchTransitions(
      machine,
      (next) => {
        current = typeof next === 'function' ? next(current) : next;
        return current;
      },
      (state) => state.increment(),
      (state) => state.increment(),
    );

    expect(result.context.count).toBe(2);
    expect(current.context.count).toBe(2);
  });

  it('resolves store-backed actions against the current typestate', () => {
    const [store, , actions] = createMachineStore<Idle | Active>(() => new Idle());

    actions.start();

    expect(store.context.tag).toBe('active');
    expect(() => actions.start()).toThrow("Transition 'start' is not available");
    actions.increment();
    expect((store.context as Active['context']).count).toBe(1);
  });

  it('keeps external context updates in sync with subsequent actions', () => {
    const initial = createCoreMachine({ count: 0 }, {
      increment() {
        return createCoreMachine({ count: this.context.count + 1 }, this);
      }
    });
    const [context, setContext, actions] = createMachineContext(() => initial);

    setContext('count', 5);
    actions.increment();

    expect(context.count).toBe(6);
  });

  it('keeps external machine-store updates in sync with subsequent actions', () => {
    const initial = createCoreMachine({ count: 0 }, {
      increment() {
        return createCoreMachine({ count: this.context.count + 1 }, this);
      }
    });
    const [store, setStore, actions] = createMachineStore(() => initial);

    setStore('context', 'count', 5);
    actions.increment();

    expect(store.context.count).toBe(6);
  });

  it('rejects invalid synchronous transition results', () => {
    const [, actions] = createMachine(() => createCoreMachine({ count: 0 }, {
      invalid: (() => null) as any,
    }));

    expect(() => actions.invalid()).toThrow('did not return a machine with a context property');
  });

  it('stops async runners when their Solid owner is disposed', async () => {
    let resolve!: (value: ReturnType<typeof createCoreAsyncMachine>) => void;
    const { state, dispatch, dispose } = createRoot(dispose => {
      const [state, dispatch] = createAsyncMachine(() => createCoreAsyncMachine({ count: 0 }, {
        increment() {
          return new Promise(done => { resolve = done; });
        }
      }));
      return { state, dispatch, dispose };
    });

    const pending = dispatch({ type: 'increment', args: [] });
    dispose();
    resolve(createCoreAsyncMachine({ count: 1 }, {}));
    await pending;

    expect(state().context.count).toBe(0);
  });

});
