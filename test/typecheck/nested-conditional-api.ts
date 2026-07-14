import {
  createMachine,
  guardSync,
  type Machine,
  type TypeState,
} from '../../src/index';
import { delegate } from '../../src/delegate';
import { createParallelMachine } from '../../src/higher-order';
import { factory, machine, withChildren } from '../../src/minimal';

const childCounter = createMachine({ count: 0 }, next => ({
  increment: () => next({ count: 1 }),
}));

const nestedParent = createMachine(
  { title: 'Overview', counter: childCounter },
  next => ({
    rename: (title: string) => next({ ...nestedParent.context, title }),
  }),
);

const nextChild = nestedParent.context.counter.increment();
createMachine({ ...nestedParent.context, counter: nextChild }, nestedParent);

const createCounter = factory<{ count: number }>()((state, next) => ({
  increment: () => next({ count: state.count + 1 }),
}));

withChildren(
  { title: 'Overview' },
  { counter: createCounter({ count: 0 }) },
).counter.increment().counter.increment();

const delegatedParent = machine(
  { counter: createCounter({ count: 0 }) },
  (state, next) => ({ ...delegate(state, 'counter', next) }),
);

delegatedParent.increment();

const left = createMachine({ left: 0 }, next => ({
  incrementLeft: () => next({ left: 1 }),
}));
const right = createMachine({ right: false }, next => ({
  toggleRight: () => next({ right: true }),
}));
createParallelMachine(left, right).incrementLeft().toggleRight();

type Editable = TypeState<
  { status: 'editable'; content: string },
  { edit(content: string): Editable; lock(): Locked }
>;
type Locked = TypeState<
  { status: 'locked'; content: string },
  { unlock(): Editable }
>;

const createEditable = (content: string): Editable =>
  createMachine({ status: 'editable', content }, {
    edit(nextContent: string) {
      return createEditable(nextContent);
    },
    lock() {
      return createLocked(this.context.content);
    },
  });

const createLocked = (content: string): Locked =>
  createMachine({ status: 'locked', content }, {
    unlock() {
      return createEditable(this.context.content);
    },
  });

createEditable('Draft').lock().unlock().edit('Revised');

const account = createMachine({ balance: 100 }, {
  withdraw: guardSync(
    (context: { balance: number }, amount: number) =>
      context.balance >= amount,
    function (this: Machine<{ balance: number }>, amount: number) {
      return createMachine(
        { balance: this.context.balance - amount },
        this,
      );
    },
    { onFail: 'throw', errorMessage: 'Insufficient funds' },
  ),
});

account.withdraw(50);
