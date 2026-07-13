import { createMachine, extendTransitions, overrideTransitions, setContext } from '../../src';

const counter = createMachine({ count: 0 }, {
  increment() {
    return setContext(this, context => ({ count: context.count + 1 }));
  },
});

const extended = extendTransitions(counter, {
  decrement() {
    return setContext(this, context => ({ count: context.count - 1 }));
  },
  reset() {
    return setContext(this, { count: 0 });
  },
});

extended.increment();
extended.decrement();
extended.reset();

const overridden = overrideTransitions(counter, {
  increment() {
    return setContext(this, context => ({ count: context.count + 2 }));
  },
});

overridden.increment();

// @ts-expect-error extendTransitions rejects existing transition names
extendTransitions(counter, { increment() { return this; } });
