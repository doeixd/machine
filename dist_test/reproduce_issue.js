"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
const machineA = (0, index_1.createMachine)({ count: 0 }, {
    next() {
        // Check if this.transitions exists
        console.log('this.transitions is:', this.transitions);
        // Passing `this` which includes `context: ContextA`
        // to a machine that expects `ContextB`.
        return (0, index_1.createMachine)({ text: "hello" }, this);
    }
});
// Check the type of machineA.next()
const machineB = machineA.next();
// machineB.context should be ContextB
// But if the issue exists, it might have issues.
const text = machineB.context.text;
// Let's try to access a property that shouldn't exist if types are correct
// @ts-expect-error
const count = machineB.context.count;
