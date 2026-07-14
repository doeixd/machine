# Store machines and the legacy `MultiMachine` API

`createStoreMachine` creates a live object that combines:

- context fields read from an external `StateStore`; and
- methods defined on one `StoreMachineBase` subclass instance.

Top-level context fields are read-only to consumers. Store-backed methods are the mutation boundary, so validation and invariants remain explicit.

## Basic example

```typescript
import {
  StoreMachineBase,
  createStoreMachine,
  type StateStore,
} from '@doeixd/machine';

type CounterContext = {
  count: number;
  status: 'idle' | 'limitReached';
};

class Counter extends StoreMachineBase<CounterContext> {
  increment() {
    const count = this.context.count + 1;
    this.setContext({
      count,
      status: count >= 10 ? 'limitReached' : 'idle',
    });
  }

  reset() {
    this.setContext({ count: 0, status: 'idle' });
  }
}

let context: CounterContext = { count: 0, status: 'idle' };

const store: StateStore<CounterContext> = {
  getContext: () => context,
  setContext: (next) => { context = next; },
};

const counter = createStoreMachine(Counter, store);

counter.count;       // 0 — read live from the store
counter.increment(); // method runs on the Counter instance
counter.count;       // 1 — the same proxy sees the new store value
```

`StoreMachineBase` gives subclasses two protected members:

- `this.context` reads the latest complete context;
- `this.setContext(next)` replaces the complete context through the store.

The returned proxy has the TypeScript type `Readonly<C> & T`, so consumers see both public class methods and context fields but cannot assign the fields.

## Proxy behavior

For each property access, the proxy:

1. reads the latest context from `store.getContext()`;
2. returns the context value if that property exists;
3. otherwise, returns a function bound to the class instance if it is a method;
4. otherwise, returns `undefined`.

This means context values are always fresh, even when some other code updates the store. It also means a context field wins if it has the same name as a class method; avoid those collisions.

Direct top-level assignment is rejected by both TypeScript and the runtime proxy:

```typescript
counter.count = 5; // TypeScript error; runtime assignment also fails
```

Update state through class methods, which call the protected `setContext` operation.

This is shallow protection, matching TypeScript's `Readonly<C>`: nested objects are not cloned or frozen. Treat nested context as immutable and replace it from a class method rather than mutating it in place.

## The legacy names

`MultiMachineBase` and `createMultiMachine` remain available so existing 1.x consumers do not break. They are deprecated aliases for this general pattern, because the name incorrectly suggests multi-machine coordination.

The legacy `createMultiMachine` proxy also retains direct assignment for compatibility:

```typescript
legacyCounter.count = 5; // replaces the stored context with a shallow copy
```

New code should use `StoreMachineBase` and `createStoreMachine`. The legacy names and writable proxy can be removed in a future major version.

## What a store machine does not do

A store machine does not provide:

- multiple state-specific machine factories;
- compile-time removal of methods that are invalid in the current state;
- runtime action validation based on a discriminant;
- message queues or serialized asynchronous work;
- subscriptions, transactions, or concurrent-write handling.

A context may contain a discriminant such as `status`, and class methods may inspect it, but every public class method remains present in every state. Enforce state-dependent behavior inside those methods, or use an ensemble when state-specific machine factories are the important part of the design.

## Comparison

| API | Owns state? | Behavior model | Best fit |
| --- | --- | --- | --- |
| `createMachine` | No; it returns an immutable snapshot | Functions on one snapshot | Pure typestate and explicit transitions |
| `createRunner` | Yes, locally | Stable actions over a changing machine snapshot | One imperative controller |
| `createActor` | Yes, locally | Serialized event mailbox | Async ownership and message processing |
| `createEnsemble` | No; it reads an external store | Selects a state-specific factory; multiple domains can share the store | Multi-machine coordination |
| `createStoreMachine` | No; it reads an external store | One class instance whose methods sit beside read-only live context fields | OOP-style store façade |

Sharing a store between several store-machine instances can make them observe the same data, but `createStoreMachine` itself supplies no coordination protocol beyond that store. For explicitly modeled coordination among machine domains, use [ensembles](ensembles.md).
