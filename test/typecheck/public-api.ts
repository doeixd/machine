import {
  createAsyncMachine,
  createMachine,
  runMachine,
  type TransitionOptions,
} from '../../src';
import { MachineBase } from '../../src/base';
import { createMachine as createSolidMachine } from '../../src/solid';

const counter = createMachine({ count: 0 }, (next) => ({
  increment() {
    return next({ count: this.context.count + 1 });
  },
}));

counter.increment().increment();

const asyncCounter = createAsyncMachine({ count: 0 }, {
  async add(amount: number, { signal }: TransitionOptions) {
    if (signal.aborted) return this;
    return createAsyncMachine({ count: this.context.count + amount }, this);
  },
});

const runner = runMachine(asyncCounter);
runner.dispatch({ type: 'add', args: [2] });

class Idle extends MachineBase<{ tag: 'idle' }> {
  constructor() {
    super({ tag: 'idle' });
  }

  start(): Active {
    return new Active();
  }
}

class Active extends MachineBase<{ tag: 'active' }> {
  constructor() {
    super({ tag: 'active' });
  }

  reset(): Idle {
    return new Idle();
  }
}

const [, actions] = createSolidMachine<Idle | Active>(() => new Idle());
actions.start();
actions.reset();
