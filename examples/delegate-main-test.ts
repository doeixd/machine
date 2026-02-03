import { createMachine } from '../src/index';
import { delegate } from '../src/delegate';

const childTransitions = {
  inc: function () {
    return createMachine({ count: this.context.count + 1 }, childTransitions);
  }
};
const childMachine = createMachine({ count: 10 }, childTransitions);

// Testing if delegate works with main library's createMachine
const parent = createMachine(
  { child: childMachine },
  (next) => ({
    ...delegate({ child: childMachine }, 'child', next)
  })
);

console.log('Parent status:', parent.context.child.context.count); // 10
const nextParent = parent.inc();
console.log('Parent count after inc:', nextParent.context.child.context.count); // 11
