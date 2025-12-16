# The Actor Model

The `Actor` is a runtime container for a state machine. It provides a stable reference for interacting with a machine instance, managing its state transitions, handling asynchronous effects safely, and offering observability.

While a **Machine** defines the _logic_ (states, transitions, context), an **Actor** represents a _running instance_ of that logic.

## Why use an Actor?

1.  **State Isolation**: Each actor maintains its own independent state. You can spawn multiple actors from the same machine definition.
2.  **The Mailbox (Async Safety)**: The actor manages a queue of incoming events. If an event triggers an asynchronous transition, the actor buffers subsequent events until the async operation completes and the state settles. This prevents race conditions common in raw async code.
3.  **Observability**: Actors provide a `subscribe` method to listen for state changes, making it easy to integrate with UI frameworks (React, Vue, etc.) or logging systems.
4.  **Stable Reference**: The `actor.ref` provides a way to pass the capability to send events without exposing the entire actor API.

## Getting Started

First, define your machine, then create an actor from it.

```typescript
import { createMachine, createActor } from '@doeixd/machine';

// 1. Define the Machine
const counterMachine = createMachine({ count: 0 }, (next) => ({
  increment() {
    return next({ count: this.count + 1 });
  },
  add(amount: number) {
    return next({ count: this.count + amount });
  }
}));

// 2. Create the Actor
const actor = createActor(counterMachine);

// 3. Subscribe to changes
actor.subscribe((state) => {
  console.log('Current count:', state.context.count);
});

// 4. Send events
actor.send.increment(); // Logs: Current count: 1
actor.send.add(5);      // Logs: Current count: 6
```

## Core Concepts

### Dispatch Patterns

There are two main ways to send events to an actor.

#### 1. The Proxy Dispatch (Recommended)
The `actor.send` property is a proxy that maps method calls directly to event names. This feels like calling a standard method but actually dispatches a transition event.

```typescript
actor.send.increment();
actor.send.add(10);
```

#### 2. The Event Object Dispatch
If you need to pass an event object dynamically (e.g., from a serialized source or generic handler), use `actor.dispatch` or `actor.ref.send`.

```typescript
actor.dispatch({ type: 'increment', args: [] });
// or
actor.ref.send({ type: 'add', args: [10] });
```

### The Mailbox (Queue)

One of the most powerful features of the Actor is its internal event queue. If a transition is asynchronous (returns a Promise), the actor enters a "processing" state. Any events sent during this time are queued and processed in order once the current transition completes.

```typescript
const asyncMachine = createAsyncMachine({ status: 'idle' }, (next) => ({
  async saveData() {
    await api.save(); // Takes 100ms
    return next({ status: 'saved' });
  },
  reset() {
    return next({ status: 'idle' });
  }
}));

const actor = createActor(asyncMachine);

// These will be processed sequentially, not concurrently!
actor.send.saveData(); 
actor.send.reset();    // Will wait for saveData to finish before running
```

### Observability

You can subscribe to all state changes or select specific parts of the state.

```typescript
// Subscribe to everything
const unsubscribe = actor.subscribe((state) => {
  console.log(state);
});

// Select a specific value (snapshot at call time)
const count = actor.select((state) => state.context.count);
```

## API Reference

### `createActor(machine)` / `spawn(machine)`
Creates a new `Actor` instance. `spawn` is an alias for explicit actor hierarchies.

### `Actor` Class

| Member | Description |
|---|---|
| `send.[transitionName](...args)` | 	Dispatches a transition by name. |
| `dispatch(event)` | Dispatches a raw event object `{ type, args }`. |
| `getSnapshot()` | Returns the current immutable state of the machine. |
| `subscribe(observer)` | Registers a callback that runs on every state change. Returns an unsubscription function. |
| `select(selector)` | Helper to run a selector function against the current state. |
| `start()` / `stop()` | Lifecycle methods. Currently `stop` clears observers. |

### Interop: Promises & Observables

You can create actors from other sources to treat them uniformly.

#### `fromPromise(promiseFn)`
Creates an actor that represents the state of a promise. The state context will have a `status` ('pending', 'resolved', 'rejected'), `data`, and `error`.

```typescript
import { fromPromise } from '@doeixd/machine';

const userActor = fromPromise(() => fetchUser(123));

userActor.subscribe(state => {
  if (state.context.status === 'resolved') {
    console.log('User loaded:', state.context.data);
  }
});
```

#### `fromObservable(observable)`
Creates an actor from an RxJS-like observable. Transitions `idle` -> `active` -> `done` or `error`.

```typescript
import { fromObservable } from '@doeixd/machine';
// import { interval } from 'rxjs'; // example

const timerActor = fromObservable(interval(1000));
```

### Global Inspection

For debugging tools or logging, you can register a global inspector that receives all events sent to *any* actor.

```typescript
import { Actor } from '@doeixd/machine';

Actor.inspect((inspectionEvent) => {
  console.log('Event sent:', inspectionEvent.event.type);
  console.log('Target actor:', inspectionEvent.actor);
});
```

## React Integration

Use the `@doeixd/machine/react` entry point to integrate actors with React components.

### `useActor(actor)`

Subscribes to an actor and returns its current snapshot.

```tsx
import { useActor } from '@doeixd/machine/react';

function Counter({ actor }) {
  const state = useActor(actor);
  return <button>{state.context.count}</button>;
}
```

### `useActorSelector(actor, selector, isEqual?)`

Selects a specific value from the actor's state, only re-rendering when that value changes.

```tsx
import { useActorSelector } from '@doeixd/machine/react';

function CountDisplay({ actor }) {
  const count = useActorSelector(actor, (state) => state.context.count);
  return <div>{count}</div>;
}
```

## Gotchas & Philosophy

- **Hot Start**: Actors are "hot" immediately upon creation; you generally don't *need* to call `start()`, though it's provided for lifecycle symmetry.
- **Reference Equality**: Usage of `select` or `getSnapshot` returns the exact state object from the machine. Since machines produce immutable state updates, you can use `===` to check if state has changed.
- **Async Errors**: Errors in async transitions are caught and logged by the actor to prevent crashing the process, but they might leave the actor in the previous state if not handled by the machine logic itself (e.g., try/catch inside the machine transition). Ideally, your machine should model error states explicitly.
