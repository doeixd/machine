# Event-Driven Adapters: Integrating Machines with Any Architecture

The core of `@doeixd/machine` is built on a type-safe, method-call-based paradigm (`machine.doSomething()`). This provides incredible compile-time safety and a direct, imperative feel.

However, many software architectures are built on **event-driven** patterns, where components are decoupled and communicate by sending and listening for named events. The browser's `EventTarget` and Node.js's `EventEmitter` are the two most common examples.

The **Adapters** are a powerful set of optional primitives that bridge these two worlds. They wrap your type-safe machine and make it behave like a standard event bus, allowing you to integrate `@doeixd/machine` seamlessly into any event-driven architecture.

### Table of Contents
1.  [The Core Idea: Why Use Adapters?](#the-core-idea-why-use-adapters)
2.  [**For the Browser:** `asEventTarget`](#for-the-browser-aseventtarget)
    -   [Quick Start](#quick-start)
    -   [Listening for State Changes](#listening-for-state-changes)
    -   [Dispatching Transitions](#dispatching-transitions)
    -   [Full Example: Decoupling UI Components](#full-example-decoupling-ui-components)
    -   [Type Safety with `MachineEventMap` and `listen`](#type-safety-with-machineeventmap-and-listen)
3.  [**For Node.js:** `asEventEmitter`](#for-nodejs-aseventemitter)
    -   [Quick Start](#quick-start-1)
    -   [Listening for State Changes](#listening-for-state-changes-1)
    -   [Dispatching Transitions](#dispatching-transitions-1)
    -   [Full Example: A Backend Session Manager](#full-example-a-backend-session-manager)
4.  [Summary: When to Use Adapters](#summary-when-to-use-adapters)

<br />

## The Core Idea: Why Use Adapters?

Adapters solve the problem of **decoupling**.

Imagine you have a `ControlPanel` component and a `StatusDisplay` component.
-   Without an adapter, the `ControlPanel` might need a direct reference to the `StatusDisplay` to tell it to update. This creates tight coupling.
-   With an adapter, the `ControlPanel` simply fires an "event" into a central event bus. The `StatusDisplay` listens for changes on that same bus. Neither component needs to know the other exists.

The adapters turn your state machine into that central, intelligent event bus.

| Your Machine's API | Adapter | The Outside World's API |
| :--- | :---: | :--- |
| `machine.increment()` |  `asEventTarget` | `target.dispatchEvent(new CustomEvent('increment'))` |
| `machine.add(5)` | `asEventEmitter` | `emitter.dispatch('add', 5)` |

<br />

## For the Browser: `asEventTarget`

The `asEventTarget` adapter makes your machine behave just like a DOM element. You can use `addEventListener` and `dispatchEvent` with it, making it a perfect tool for building decoupled front-end applications.

### Quick Start

First, create a machine. Then, wrap it with `asEventTarget`.

```typescript
// central-state.ts
import { createCounterMachine } from './machines';
import { asEventTarget } from '@doeixd/machine/adapters';

// 1. Create your machine as usual.
const counterMachine = createCounterMachine();

// 2. Wrap it to create a global, decoupled event target.
export const counterTarget = asEventTarget(counterMachine);
```
Now, `counterTarget` is a super-powered `EventTarget` that can be imported and used by any component in your application.

### Listening for State Changes

The adapter emits a `CustomEvent` named **`statechange`** every time the machine's internal state is updated. The new machine state is available in `event.detail.state`.

```typescript
// StatusDisplay.tsx

import { counterTarget } from './central-state';

// The `state` property gives you the current snapshot.
console.log('Initial count:', counterTarget.state.context.count);

// Listen for future changes.
counterTarget.addEventListener('statechange', (event) => {
  // The event is a CustomEvent<{ state: MachineType }>
  const newState = event.detail.state;
  console.log('Count changed to:', newState.context.count);
});
```

### Dispatching Transitions

You can trigger transitions in two ways:

**1. The Type-Safe `dispatch` Method (Recommended):**
The adapter includes a convenient `.dispatch()` method that provides full autocompletion and type-checking for your machine's transitions.

```typescript
// For a transition `increment()`
counterTarget.dispatch('increment');

// For a transition `add(n: number, m: number)`
counterTarget.dispatch('add', 5, 10);
```

**2. Raw `dispatchEvent` (For interoperability):**
You can also use the standard browser `dispatchEvent` API. The arguments for the transition must be passed as an array in the `detail` property of the `CustomEvent`.

```typescript
// For a transition `increment()`
counterTarget.dispatchEvent(new CustomEvent('increment'));

// For a transition `add(n: number)`
counterTarget.dispatchEvent(new CustomEvent('add', { detail: [5] }));
```

### Full Example: Decoupling UI Components

Here’s how to build a simple counter app where the display and controls are completely unaware of each other.

```typescript
// ControlPanel.tsx
import { counterTarget } from './central-state';

function ControlPanel() {
  return (
    <div>
      <button onClick={() => counterTarget.dispatch('increment')}>
        Increment
      </button>
      <button onClick={() => counterTarget.dispatch('add', 5)}>
        Add 5
      </button>
    </div>
  );
}

// StatusDisplay.tsx
import { useState, useEffect } from 'react';
import { counterTarget } from './central-state';

function StatusDisplay() {
  // Get the initial state directly
  const [count, setCount] = useState(counterTarget.state.context.count);

  useEffect(() => {
    const handleStateChange = (event) => {
      // Listen for 'statechange' to update our local React state
      setCount(event.detail.state.context.count);
    };

    counterTarget.addEventListener('statechange', handleStateChange);
    return () => counterTarget.removeEventListener('statechange', handleStateChange);
  }, []);

  return <h1>Count: {count}</h1>;
}
```
This architecture is incredibly scalable. You can have dozens of components all interacting with the `counterTarget` without any direct coupling.

### Type Safety with `MachineEventMap` and `listen`

To make `addEventListener` fully type-safe, the library exports helper types and a utility function.

-   **`MachineEventMap<M>`:** A type that maps event names to their specific `CustomEvent` types.
-   **`listen(target, eventName, callback)`:** An ergonomic helper that adds a listener and returns an `unsubscribe` function.

```typescript
import { listen, MachineEventMap, MachineEventTarget } from '@doeixd/machine/adapters';

// Let's assume `MyMachine` has a transition `add(n: number)`
type MyEventMap = MachineEventMap<MyMachine>;

const target: MachineEventTarget<MyMachine> = asEventTarget(createMyMachine());

// The `listen` helper provides perfect type inference.
const unsubscribe = listen(target, 'add', (event) => {
  // `event` is correctly typed as CustomEvent<[number]>
  const numberToAdd = event.detail[0]; 
  console.log(numberToAdd);
});

// Ideal for useEffect cleanup
useEffect(() => unsubscribe, []);
```

<br />

## For Node.js: `asEventEmitter`

The `asEventEmitter` adapter is the backend equivalent of `asEventTarget`. It wraps your machine in a standard Node.js `EventEmitter`, perfect for services, scripts, and message-driven architectures.

### Quick Start

```typescript
// session-manager.ts
import { createAuthMachine } from './machines';
import { asEventEmitter } from '@doeixd/machine/adapters';

const authMachine = createAuthMachine();
export const sessionEmitter = asEventEmitter(authMachine);
```

### Listening for State Changes

The emitter fires a **`statechange`** event with the new machine instance as the payload. It also emits an **`error`** event if you try to dispatch an invalid transition.

```typescript
import { sessionEmitter } from './session-manager';

// The `state` property gives a snapshot of the current state.
console.log('Initial status:', sessionEmitter.state.context.status);

// Listen for successful state changes.
sessionEmitter.on('statechange', (newState) => {
  console.log(`Session status is now: ${newState.context.status}`);
  // e.g., write to database, log analytics, etc.
});

// Listen for errors.
sessionEmitter.on('error', (err) => {
  console.error('A state transition failed:', err.message);
});
```

### Dispatching Transitions

The emitter has one primary input method: the type-safe **`.dispatch()`**.

-   The first argument is the **event name** (a string).
-   The subsequent arguments are the **payload** for that transition.

```typescript
// For a transition `login(username: string, token: string)`
sessionEmitter.dispatch('login', 'alice', 'xyz123');

// For a transition `logout()`
sessionEmitter.dispatch('logout');
```
This API provides full autocompletion for the event name and type-checking for the arguments.

### Full Example: A Backend Session Manager

Imagine a service that manages user sessions based on commands from a message queue.

```typescript
// session-service.ts
import { sessionEmitter } from './session-manager';

// The "Side Effects Layer" reacts to state changes.
sessionEmitter.on('statechange', (newState) => {
  if (newState.context.status === 'loggedIn') {
    console.log(`User ${newState.context.username} is now active. Refreshing session in DB.`);
    // db.updateUserSession(newState.context.userId, { status: 'active' });
  }
});

// The "Input Layer" consumes messages and dispatches them to the machine.
function handleMessage(message: { command: string; payload: any[] }) {
  const { command, payload } = message;

  // We can dynamically dispatch, but it's safer to use a switch.
  // The `dispatch` method is dynamically typed, so this is safe.
  if (typeof (sessionEmitter as any).dispatch[command] === 'function') {
      sessionEmitter.dispatch(command, ...payload);
  } else {
      sessionEmitter.dispatch(command as any, ...payload); // Let the emitter handle the error
  }
}

// --- Simulate incoming messages ---

// 1. A user logs in.
handleMessage({ command: 'login', payload: ['alice', 'password123'] });
// Logs: "Session status is now: loggedIn"
// Logs: "User alice is now active. Refreshing session in DB."

// 2. An invalid command is received for the current state.
handleMessage({ command: 'login', payload: ['bob', 'password456'] });
// Logs: "A state transition failed: Invalid event "login" for current state."
```

## Summary: When to Use Adapters

Adapters are your tool for **integration and decoupling**.

-   **Use `asEventTarget`** in browser environments when you want to create a central, decoupled state "bus" that any component can listen to or dispatch events to. It's an excellent pattern for managing global or cross-component state without prop-drilling or complex context providers.

-   **Use `asEventEmitter`** in Node.js or backend environments to integrate your pure state logic into a message-driven architecture. It cleanly separates the "what" (the state logic) from the "how" (the event bus).

By using adapters, you can write your core application logic in a pure, testable, and type-safe way with `@doeixd/machine`, and then plug it into any architecture you need, confident that the integration is as robust as the machine itself.


## For Reactive Streams: `asObservable`

The `asObservable` adapter makes your machine conform to the **Observable** pattern, a powerful standard for managing asynchronous data streams, popularized by libraries like [RxJS](https://rxjs.dev/). This is the ideal adapter for integrating `@doeixd/machine` into stream-based architectures, common in frameworks like Angular or any project using RxJS.

### Quick Start

Wrap your machine with `asObservable`. The returned object is a stream that emits the new machine state on every transition.

```typescript
// state-stream.ts
import { createCounterMachine } from './machines';
import { asObservable } from '@doeixd/machine/adapters';

const counterMachine = createCounterMachine();
export const counter$ = asObservable(counterMachine); // The '$' suffix is a common convention for Observables.
```
Now `counter$` is an observable stream of state machine instances.

### Subscribing to State Changes

You use the standard `.subscribe()` method to listen to the stream of states. The `next` handler will be called immediately with the current state, and then again for every subsequent state change.

```typescript
import { counter$ } from './state-stream';

console.log('Current state:', counter$.state.context.count); // Access the initial state synchronously

const subscription = counter$.subscribe({
  next: (newState) => {
    // This is called for every state change.
    console.log('New state received:', newState.context.count);
  },
  error: (err) => {
    // This is called if an invalid transition is dispatched.
    console.error('An error occurred in the machine:', err.message);
  },
  complete: () => {
    // This is called if the machine signals completion.
    console.log('The machine has completed its lifecycle.');
  }
});

// Later, to clean up:
// subscription.unsubscribe();
```

### Dispatching Transitions

The observable object has a type-safe `.dispatch()` method to trigger transitions.

```typescript
// For a transition `increment()`
counter$.dispatch('increment');
// Console logs: "New state received: 1"

// For a transition `add(n: number)`
counter$.dispatch('add', 10);
// Console logs: "New state received: 11"

// For an invalid transition
counter$.dispatch('invalidTransition' as any);
// Console logs: "An error occurred in the machine: Invalid event..."
```

### Full Example: Using with RxJS Operators

The real power of observables comes from using operators to transform, filter, and combine streams. Since `MachineObservable` conforms to the standard, it works seamlessly with libraries like RxJS.

```typescript
import { counter$ } from './state-stream';
import { map, distinctUntilChanged, filter, debounceTime } from 'rxjs/operators';

// Let's create a stream of just the `count` value.
const count$ = counter$.pipe(
  map(machine => machine.context.count),
  distinctUntilChanged() // Only emit when the count actually changes
);

// Subscribe to the derived stream.
count$.subscribe(count => {
  console.log(`The count is now: ${count}`);
});

// Create another stream that only emits when the count is a multiple of 10.
const milestone$ = count$.pipe(
  filter(count => count % 10 === 0)
);

milestone$.subscribe(milestone => {
  console.log(`MILESTONE REACHED: ${milestone}!`);
});


// Now, let's dispatch some events and see the streams react.
counter$.dispatch('add', 5);  // Logs: "The count is now: 5"
counter$.dispatch('add', 5);  // Logs: "The count is now: 10", "MILESTONE REACHED: 10!"
counter$.dispatch('increment'); // Logs: "The count is now: 11"
```

### Summary of Benefits

-   **Seamless Integration:** Plugs `@doeixd/machine` into any RxJS, Angular, or other stream-based architecture.
-   **Powerful Composition:** Allows you to use the vast ecosystem of observable operators (`map`, `filter`, `debounceTime`, `switchMap`, etc.) to create complex, declarative data flows from your machine's state.
-   **Type-Safety:** The `MachineObservable` is fully type-safe, both for dispatching events and for the state objects emitted by the stream.

By providing `asObservable`, `@doeixd/machine` becomes a versatile and powerful core for state logic that can be adapted to fit virtually any architectural pattern, from simple object-oriented code to complex reactive streams.