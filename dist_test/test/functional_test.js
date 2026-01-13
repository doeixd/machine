"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../src/index");
const machine = (0, index_1.createMachine)({ count: 0 }, (transition) => ({
    increment() {
        // `this` is inferred as Context
        console.log('Current count:', this.context.count);
        // `transition` is a helper that returns a Machine with the same transitions
        return transition({ count: this.context.count + 1 });
    },
    add(n) {
        return transition({ count: this.context.count + n });
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
