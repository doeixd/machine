/** Generator composition using the published generator helpers. */

import { bindTransitions, createMachine, type Machine } from '../src/index';
import { createFlow, run, runAsync, step, stepAsync } from '../src/generators';

type CounterContext = { count: number };

function createCounter(count = 0) {
  type CounterBase = Machine<CounterContext>;
  type CounterTransitions = {
    increment(this: CounterBase): ReturnType<typeof createCounter>;
    add(this: CounterBase, amount: number): ReturnType<typeof createCounter>;
    reset(this: CounterBase): ReturnType<typeof createCounter>;
  };

  const transitions: CounterTransitions = {
    increment() {
      return createCounter(this.context.count + 1);
    },
    add(amount) {
      return createCounter(this.context.count + amount);
    },
    reset() {
      return createCounter();
    },
  };

  return createMachine({ count }, transitions);
}

const counter = bindTransitions(createCounter());

const total = run(function* (machine) {
  machine = yield* step(machine.increment());
  machine = yield* step(machine.add(4));
  return machine.context.count;
}, counter);

console.log(total); // 5

const addThenReset = createFlow(function* (machine: typeof counter) {
  machine = yield* step(machine.add(10));
  return yield* step(machine.reset());
});

console.log(run(machine => addThenReset(machine), counter).context.count); // 0

async function runAsyncExample() {
  const asyncTotal = await runAsync(async function* (machine) {
    machine = yield* stepAsync(await Promise.resolve(machine.add(2)));
    return machine.context.count;
  }, counter);

  console.log(asyncTotal); // 2
}

void runAsyncExample();
