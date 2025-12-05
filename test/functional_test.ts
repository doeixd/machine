import { createMachine, Machine } from '../src/index';

type Context = { count: number };

const machine = createMachine({ count: 0 }, (next) => ({
  increment(this: Context) {
    // `this` is inferred as Context
    console.log('Current count:', this.count);
    // `next` is a helper that returns a Machine with the same transitions
    return next({ count: this.count + 1 });
  },
  add(this: Context, n: number) {
    return next({ count: this.count + n });
  }
}));

// Usage
const nextState = machine.increment();
console.log('Next count:', nextState.context.count);

if (nextState.context.count !== 1) {
  throw new Error('Expected count to be 1');
}

const nextState2 = nextState.add(5);
console.log('Next count 2:', nextState2.context.count);

if (nextState2.context.count !== 6) {
  throw new Error('Expected count to be 6');
}

console.log('Functional test passed!');
