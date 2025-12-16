# Actor Model

The Actor Model in `@doeixd/machine` provides a powerful way to manage state machines as reactive, event-driven entities. It wraps your robust type-state machines with an asynchronous mailbox, observability, and framework integrations.

## Core Concepts

- **Actor**: A stateful instance of a Machine.
- **Mailbox**: Ensures all transitions (sync and async) are processed sequentially.
- **Observability**: Subscribe to state changes.
- **Interop**: Convert Promises and Observables into Actors.

## Usage

### Creating an Actor

```typescript
import { createMachine, createActor } from '@doeixd/machine';

const counter = createMachine({ count: 0 }, {
  increment() { return { ...this, count: this.count + 1 }; }
});

const actor = createActor(counter);
```

### Dispatching Events

There are two ways to send messages to an actor:

**Pattern A: RPC-Style (Recommended)**
Proxy-based methods for better DX and autocompletion.

```typescript
actor.send.increment();
```

**Pattern B: Event Objects**
Serializable event objects, useful for Redux-like patterns.

```typescript
actor.dispatch({ type: 'increment', args: [] });
// or via the ref
actor.ref.send({ type: 'increment', args: [] });
```

### Subscribing to State

```typescript
const unsubscribe = actor.subscribe((snapshot) => {
  console.log('New state:', snapshot.context);
});
```

### React Integration

Use the `useActor` hook to subscribe to an actor in React components.

```tsx
import { useActor, useActorSelector } from '@doeixd/machine/react';

function Counter({ actor }) {
  const snapshot = useActor(actor);
  // or optimized selection
  const count = useActorSelector(actor, state => state.context.count);

  return <button onClick={() => actor.send.increment()}>{count}</button>;
}
```

## Advanced Features

### Promise Interop

Convert a Promise creator into an Actor. The actor machine will have `status` ('pending' | 'resolved' | 'rejected'), `data`, and `error`.

```typescript
import { fromPromise } from '@doeixd/machine';

const promiseActor = fromPromise(async () => {
  const data = await fetch('/api/data');
  return data.json();
});

promiseActor.subscribe(state => {
  if (state.context.status === 'resolved') {
    console.log('Data:', state.context.data);
  }
});
```

### Observable Interop

Convert an RxJS-style Observable into an Actor.

```typescript
import { fromObservable } from '@doeixd/machine';
import { interval } from 'rxjs';

const obsActor = fromObservable(interval(1000));
obsActor.subscribe(state => console.log(state.context.value));
```

### Spawning Actors

Use `spawn` to create an `ActorRef` which can be passed around. It is functionally equivalent to `createActor` but emphasizes the reference interface.

```typescript
import { spawn } from '@doeixd/machine';

const child = spawn(someMachine);
```

### Inspection

Debug your actors globally using the inspector.

```typescript
import { Actor } from '@doeixd/machine';

Actor.inspect((inspectionEvent) => {
  console.log('Actor event:', inspectionEvent);
  // { type: '@actor/send', actor, event, snapshot }
});
```
