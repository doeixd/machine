import { createMachine } from './index';

type ContextA = { count: number };
type ContextB = { text: string };

const machineA = createMachine<ContextA, any>({ count: 0 }, {
  next() {
    // Check if this.transitions exists
    console.log('this.transitions is:', (this as any).transitions);

    // Passing `this` which includes `context: ContextA`
    // to a machine that expects `ContextB`.
    return createMachine<ContextB, any>({ text: "hello" }, this);
  }
});

// Check the type of machineA.next()
const machineB = machineA.next();

// machineB.context should be ContextB
// But if the issue exists, it might have issues.
const text: string = machineB.context.text;

// Let's try to access a property that shouldn't exist if types are correct
// @ts-expect-error
const count: number = machineB.context.count;
