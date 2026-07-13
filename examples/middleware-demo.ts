/** Focused middleware examples using the current call contract. */

import {
  createMachine,
  createMiddleware,
  withHistory,
  withValidation,
  type Machine,
} from '../src/index';

type CounterContext = { count: number };

function createCounter(count = 0) {
  type CounterBase = Machine<CounterContext>;
  type CounterTransitions = {
    increment(this: CounterBase): ReturnType<typeof createCounter>;
    add(this: CounterBase, amount: number): ReturnType<typeof createCounter>;
  };

  const transitions: CounterTransitions = {
    increment() {
      return createCounter(this.context.count + 1);
    },
    add(amount) {
      return createCounter(this.context.count + amount);
    },
  };

  return createMachine({ count }, transitions);
}

const events: string[] = [];
const observed = createMiddleware(createCounter(), {
  before: ({ transitionName }) => {
    events.push(`before:${transitionName}`);
  },
  after: ({ transitionName, nextContext }) => {
    events.push(`after:${transitionName}:${nextContext.count}`);
  },
});

const incremented = observed.increment.call(observed);
console.log(incremented.context.count, events); // 1, before/after entries

const validated = withValidation(createCounter(), ({ transitionName, args }) => {
  if (transitionName === 'add' && Number(args[0]) < 0) {
    throw new RangeError('amount must be non-negative');
  }
});

console.log(validated.add.call(validated, 3).context.count); // 3

const tracked = withHistory(createCounter());
tracked.increment.call(tracked);
tracked.add.call(tracked, 5);
console.log(tracked.history.map(entry => entry.transitionName));
