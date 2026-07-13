import { createMachine, createMiddleware } from '../../src';

const machine = createMachine({ count: 0 }, {
  increment() {
    return createMachine({ count: this.context.count + 1 }, this);
  },
});

createMiddleware(machine, {
  error: () => createMachine({ count: 10 }, machine),
});

createMiddleware(machine, {
  error: async () => createMachine({ count: 10 }, machine),
});

createMiddleware(machine, {
  error: () => undefined,
});
