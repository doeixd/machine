const { createMachine } = require('./dist/index.js');
const { createRunner } = require('./dist/multi.js');

const machine = createMachine({ count: 0 }, {
  increment() {
    console.log('increment called, this.count =', this.count);
    const result = createMachine({ count: this.count + 1 }, this);
    console.log('result.context.count =', result.context.count);
    return result;
  },
});

console.log('Initial machine:', machine.context);

const runner = createRunner(machine);
console.log('Runner state:', runner.state.context);
console.log('Runner context:', runner.context);

console.log('\nCalling runner.actions.increment()');
const result = runner.actions.increment();
console.log('Result from action:', result.context);
console.log('Runner state after action:', runner.state.context);
console.log('Runner context after action:', runner.context);
