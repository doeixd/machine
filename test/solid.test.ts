import { describe, expect, it } from 'vitest';
import { createAsyncMachine as createCoreAsyncMachine, MachineBase } from '../src';
import {
  batchTransitions,
  createAsyncMachine,
  createMachine,
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
});
