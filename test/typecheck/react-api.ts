import { createMachine, useMachine } from '../../src/entry-react';

function CounterComponent() {
  const [counter, actions] = useMachine(() => createMachine({ count: 0 }, {
    add(amount: number) {
      return createMachine({ count: this.context.count + amount }, this);
    },
  }));

  const next = actions.add(2);
  next.context.count satisfies number;
  counter.context.count satisfies number;

  // @ts-expect-error add requires its declared amount
  actions.add();
  // @ts-expect-error unknown transitions are not exposed by the hook
  actions.reset();

  return null;
}

void CounterComponent;
