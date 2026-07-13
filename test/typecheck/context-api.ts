import { MachineBase, next, setContext } from '../../src';

class Counter extends MachineBase<{ count: number }> {
  increment() {
    return next(this, context => ({ count: context.count + 1 }));
  }
}

const counter = new Counter({ count: 0 });
const updated: Counter = setContext(counter, { count: 5 });
const incremented: Counter = next(updated, context => ({ count: context.count + 1 }));

updated.increment();
incremented.increment();
