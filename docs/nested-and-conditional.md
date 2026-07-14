# Nested and conditional machines

`@doeixd/machine` does not impose a hierarchical statechart runtime. Instead, it composes ordinary immutable snapshots. A child machine can be stored as data, exposed under a namespace, delegated through its parent, or combined with an independent region.

Conditional behavior follows the same principle: use distinct typestates when a condition is durable control state, and use a runtime guard when the rule depends on data available only when a transition is called.

## Nested machines are snapshots

A machine can be a value in another machine's context:

```ts
import { createMachine } from '@doeixd/machine';

const counter = createMachine({ count: 0 }, next => ({
  increment() {
    return next({ count: this.context.count + 1 });
  },
}));

const dashboard = createMachine(
  { title: 'Overview', counter },
  next => ({
    rename(title: string) {
      return next({ ...this.context, title });
    },
  }),
);

const nextCounter = dashboard.context.counter.increment();
const updated = createMachine(
  { ...dashboard.context, counter: nextCounter },
  dashboard,
);

console.log(updated.context.counter.context.count); // 1
```

The parent and child are both snapshots. Calling a child transition produces a new child; replacing that value produces the new parent. Nothing mutates or synchronizes the two snapshots behind the scenes.

## Namespaced children with `withChildren`

The minimal entry's `withChildren(parent, children)` performs that replacement for you while keeping each child's API namespaced:

```ts
import { factory, withChildren } from '@doeixd/machine/minimal';

const createCounter = factory<{ count: number }>()((state, next) => ({
  increment: () => next({ count: state.count + 1 }),
}));

const dashboard = withChildren(
  { title: 'Overview' },
  { counter: createCounter({ count: 0 }) },
);

const updated = dashboard.counter.increment();

console.log(dashboard.counter.count); // 0
console.log(updated.counter.count); // 1
```

A child transition returns a new parent containing that child's next snapshot. Other children and parent fields are retained.

This composition is deliberately shallow. It does not:

- propagate parent events to children;
- schedule child effects;
- define entry, exit, history, or ancestor-transition semantics;
- turn nested objects into SCXML-style state nodes.

## Flattened children with `delegate`

The delegation entry exposes selected child transitions directly on a parent:

```ts
import { machine } from '@doeixd/machine/minimal';
import { delegate } from '@doeixd/machine/delegate';

const createCounter = (state: { count: number }) =>
  machine(state, (current, next) => ({
    increment: () => next({ count: current.count + 1 }),
  }));

const dashboard = machine(
  {
    title: 'Overview',
    counter: createCounter({ count: 0 }),
  },
  (state, next) => ({
    ...delegate(state, 'counter', next),
    rename: (title: string) => next({ ...state, title }),
  }),
);

const updated = dashboard.increment();
console.log(updated.counter.count); // 1
```

`delegate` calls the child transition with the child as `this`, replaces the child in the parent context, and passes that context to the parent's `next` function.

You can limit or rename the flattened API:

```ts
delegate(state, 'child', next, { pick: ['submit', 'cancel'] });
delegate(state, 'child', next, { omit: ['reset'] });
delegate(state, 'child', next, { rename: { submit: 'submitForm' } });
```

The `rename` form exposes only the entries in its mapping. `delegateAll` can flatten several children; use its prefix mode when names might overlap because unprefixed duplicate names are not rejected.

Delegation preserves the argument types of the transitions visible on the current child. It does **not** automatically turn one parent factory into a hierarchy whose API narrows whenever a child union changes typestate. For that guarantee, model the parent itself as a typestate union with a branch for each relevant child state. Delegation remains the runtime wiring inside those branches.

See [Machine delegation](delegate.md) for the complete API.

## Independent regions with `createParallelMachine`

Two independent snapshots can be combined into one flat API:

```ts
import { createMachine } from '@doeixd/machine';
import { createParallelMachine } from '@doeixd/machine/higher-order';

const counter = createMachine({ count: 0 }, next => ({
  increment: () => next({ count: 1 }),
}));

const panel = createMachine({ open: false }, next => ({
  toggle: () => next({ open: true }),
}));

const dashboard = createParallelMachine(counter, panel);
const updated = dashboard.increment().toggle();

console.log(updated.context); // { count: 1, open: true }
```

Each transition updates only its owning side. Context keys and transition names must be unique across the inputs; a collision throws when the machines are composed.

This models independent regions, not concurrency. It does not schedule effects, arbitrate simultaneous transitions, or implement full SCXML parallel-state semantics. See [Higher-order machines](higher-order.md#parallel-composition) and [Parallel composition](parallel.md).

## Conditional behavior

There are two primary choices. The distinction is whether the condition belongs to the machine's durable control state.

### Prefer typestates for durable conditions

If a condition determines which operations are valid, represent it as a real state distinction:

```ts
import { createMachine, type TypeState } from '@doeixd/machine';

type Editable = TypeState<
  { status: 'editable'; content: string },
  {
    edit(content: string): Editable;
    lock(): Locked;
  }
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

const locked = createEditable('Draft').lock();
// locked.edit('Published'); // TypeScript error
const editable = locked.unlock();
```

This is the preferred model for distinctions such as anonymous/authenticated, idle/loading, draft/published, or connected/disconnected. Invalid operations disappear from the current snapshot's type.

### Use guards for runtime data rules

Use a guard when the transition exists in the current control state but is allowed only for some data or arguments:

```ts
import {
  createMachine,
  guardSync,
  type Machine,
} from '@doeixd/machine';

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
    {
      onFail: 'throw',
      errorMessage: 'Insufficient funds',
    },
  ),
});
```

The condition receives the current context and the transition arguments. On failure, a guard can:

- throw, optionally with a custom message;
- return the current machine with `onFail: 'ignore'`;
- call a fallback transition function;
- return a static fallback machine.

`guard` and `guardSync` are synchronous. Use `guardAsync` when the condition or transition is asynchronous. A fallback function and `ignore` require the guard to be invoked as a machine transition, because a context-only `this` binding has no complete machine to return or call.

Guards enforce runtime rules and attach extraction metadata. Metadata describes the executable rule; it does not enforce a second, hidden statechart.

See [Conditional transitions](conditional-transitions.md) for failure modes, async guards, metadata, and binding details.

### Conditional middleware is policy, not state

Middleware helpers such as `when` and `branch` choose wrappers according to predicates. They are useful for concerns such as logging, validation, retries, and instrumentation. They do not make a transition appear or disappear from a typestate and should not be used to model durable control state. See [Middleware](middleware.md#conditional-middleware).

## Choosing the composition

| Need | API or model |
| --- | --- |
| Keep a child API under `parent.child` | `withChildren` |
| Expose child operations on the parent | `delegate` |
| Combine two independent snapshots | `createParallelMachine` |
| Make valid operations change with state | A typestate union |
| Check data or arguments at call time | `guard`, `guardSync`, or `guardAsync` |
| Apply cross-cutting transition policy | Conditional middleware |
| Built-in hierarchical statechart semantics | Not provided by these helpers |

The unifying rule is simple: composition creates a new snapshot from existing snapshots. Hierarchy, conditional availability, and concurrency exist only to the extent that the types and transition functions explicitly model them.
