import {
  createAsyncMachine,
  createMachine,
  metadata,
  runMachine,
  state,
  withHistory,
  withSnapshot,
  withTimeTravel,
  type MetadataOf,
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

const functionalCounter = state({ count: 0 })({
  add: (context, amount: number) => ({ count: context.count + amount }),
});
functionalCounter.add(1).add(2);

const historyCounter = withHistory(counter);
historyCounter.increment().history;

const snapshotCounter = withSnapshot(counter);
snapshotCounter.increment().snapshots;

const timeTravelCounter = withTimeTravel(counter);
timeTravelCounter.increment().replayFrom(0);

const annotatedCounter = metadata({ description: 'Counter' }, counter);
type CounterMetadata = MetadataOf<typeof annotatedCounter>;
const counterDescription: CounterMetadata['description'] = 'Counter';
void counterDescription;

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
