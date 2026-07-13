/** History, snapshots, restoration, and replay with current middleware APIs. */

import { createMachine, withTimeTravel, type Machine } from '../src/index';

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

let counter = withTimeTravel(createCounter(), { maxSize: 20 });
counter = counter.increment.call(counter);
counter = counter.add.call(counter, 5);

console.log(counter.context.count); // 6
console.log(counter.history.map(entry => entry.transitionName));
console.log(counter.snapshots.map(snapshot => snapshot.after));

const restored = counter.restoreSnapshot(counter.snapshots[0].after);
console.log(restored.context.count); // 1

const replayed = counter.replayFrom(0);
console.log(replayed.context.count); // 6

counter.clearTimeTravel();
