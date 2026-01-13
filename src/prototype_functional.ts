// Mocking the core types for the prototype
type Machine<C, T> = { context: C } & T;

function createMachineInternal<C, T>(context: C, transitions: T): Machine<C, T> {
  return Object.assign({ context }, transitions) as Machine<C, T>;
}

// Proposed API
// fn takes a 'transition' helper and returns the transitions object
export function createMachine<C, T extends Record<string, (this: C, ...args: any[]) => any>>(
  context: C,
  fn: (transition: (newContext: C) => Machine<C, T>) => T
): Machine<C, T> {
  // We need to handle the circularity:
  // T depends on the return type of fn.
  // fn needs 'transition' which returns Machine<C, T>.

  // In runtime:
  let transitions: T;

  const transition = (newContext: C) => {
    return createMachineInternal(newContext, transitions);
  };

  transitions = fn(transition);

  return createMachineInternal(context, transitions);
}

// Usage Test
type Context = { count: number };

const machine = createMachine({ count: 0 }, (transition) => ({
  inc() {
    // 'this' should be Context
    return transition({ count: this.context.count + 1 });
  },
  add(n: number) {
    return transition({ count: this.context.count + n });
  }
}));

// Verify types
const next = machine.inc(); // Should be Machine<Context, ...>
const val = next.context.count;
const next2 = next.add(5);
