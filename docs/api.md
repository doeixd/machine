# API Reference

Welcome to the complete API reference for `@doeixd/machine`. This document provides detailed information on all exported types, functions, and classes. For conceptual guides and patterns, please refer to the other documents in this directory.

## Table of Contents

1.  [**Core Types**](#1-core-types)
2.  [**Type Utilities**](#2-type-utilities)
3.  [**Machine Creation**](#3-machine-creation)
4.  [**Factories & Builders**](#4-factories--builders)
5.  [**Immutable Helpers**](#5-immutable-helpers)
6.  [**Runtime & Orchestration**](#6-runtime--orchestration)
7.  [**State & Type Guards**](#7-state--type-guards)
8.  [**Utilities**](#8-utilities)
9.  [**Advanced Patterns (`multi.ts`)**](#9-advanced-patterns-multits)
10. [**Adapters (`adapters.ts`)**](#10-adapters-adaptersts)
11. [**Middleware (`middleware.ts`)**](#11-middleware-middlewarets)
12. [**Statechart Primitives (`primitives.ts`)**](#12-statechart-primitives-primitivests)

<br />

## 1. Core Types
_Best for: Understanding the fundamental building blocks of the library._

---
### `Machine<C>`
The fundamental shape of a **synchronous** state machine. It's an object with a `context` property for state and methods for transitions.

```typescript
type Machine<C extends object> = {
  readonly context: C;
} & Record<string, (...args: any[]) => Machine<any>>;
```
---
### `AsyncMachine<C>`
The shape of an **asynchronous** state machine, where transitions can return `Promise`s. Async transitions automatically receive `TransitionOptions` (containing an `AbortSignal`) as their last argument when used with `runMachine`.

```typescript
type AsyncMachine<C extends object> = {
  readonly context: C;
} & Record<string, (...args: any[]) => MaybePromise<AsyncMachine<any>>>;
```
---
### `BaseMachine<C>`
A generic base type that both `Machine` and `AsyncMachine` extend from, useful for generic constraints.

```typescript
type BaseMachine<C extends object> = {
  readonly context: C;
} & Record<string, (...args: any[]) => any>;
```
---
### `MaybePromise<T>`
A utility type for values that can be either synchronous (`T`) or asynchronous (`Promise<T>`).

```typescript
type MaybePromise<T> = T | Promise<T>;
```
---
### `TransitionOptions`
An options object passed as the last argument to all asynchronous transitions managed by `runMachine`.

```typescript
interface TransitionOptions {
  signal: AbortSignal;
}
```
_See also: `docs/abort.md`_

<br />

## 2. Type Utilities
_Best for: Introspecting your machine types to build generic functions or extract type information._

---
### `Context<M>`
Extracts the context type from a machine type `M`.

```typescript
type MyMachine = Machine<{ count: number }>;
type Ctx = Context<MyMachine>; // { count: number }
```
---
### `Transitions<M>`
Extracts the transition function signatures from a machine `M`, excluding the `context` property.

```typescript
type MyMachine = Machine<{}> & { increment: () => any };
type Fns = Transitions<MyMachine>; // { increment: () => any }
```
---
### `TransitionArgs<M, K>`
Extracts the argument types for a specific transition `K` on machine `M` as a tuple.

```typescript
type MyMachine = Machine<{}> & { add: (n: number, m: string) => any };
type Args = TransitionArgs<MyMachine, 'add'>; // [n: number, m: string]
```
---
### `TransitionNames<M>`
Extracts the names of all transitions from machine `M` as a string union.

```typescript
type Names = TransitionNames<MyMachine>; // "add"
```
---
### `Event<M>`
Generates a discriminated union of all possible event objects for a machine `M`, for use with `runMachine`.

```typescript
type Ev = Event<MyMachine>; // { type: 'add', args: [number, string] }
```

<br />

## 3. Machine Creation
_Best for: The fundamental ways to create a new machine instance._

---
### `createMachine()`
Creates a synchronous state machine.

-   **Signature:** `function createMachine<C, T>(context: C, fns: T): { context: C } & T`
-   **Parameters:**
    -   `context`: The initial state object.
    -   `fns`: An object of transition functions. `this` inside each function is the `context`.
-   **Returns:** A new, immutable machine instance.
-   **Example:**
```typescript
const counter = createMachine({ count: 0 }, (next) => ({
  increment() { return next({ count: this.count + 1 }); }
}));
```
---
### `createAsyncMachine()`
Creates an asynchronous state machine.

-   **Signature:** `function createAsyncMachine<C, T>(context: C, fns: T): { context: C } & T`
-   **Parameters:** Same as `createMachine`, but functions in `fns` can be `async` and return `Promise<AsyncMachine>`.
-   **Returns:** A new, immutable async machine instance.
---
### `MachineBase`
An optional base class for creating machines in an Object-Oriented style.

-   **Signature:** `class MachineBase<C extends object>`
-   **Example:**
    ```typescript
    class Counter extends MachineBase<{ count: number }> {
      constructor(count = 0) { super({ count }); }
      increment = () => new Counter(this.context.count + 1);
    }
    ```
_See also: `docs/vs-state-pattern.md`_

<br />

## 4. Factories & Builders
_Best for: Creating reusable, configurable machine constructors._

_See also: `docs/factories.md`_

---
### `createMachineFactory()`
A higher-order function that creates a factory from pure context transformers.

-   **Use Case:** Ideal for single-state machines where transitions only modify data.
-   **Example:**
```typescript
const createCounter = createMachineFactory<{ count: number }>()({
  increment: (ctx) => ({ count: ctx.count + 1 }),
  add: (ctx, n: number) => ({ count: ctx.count + n })
});

const counter = createCounter({ count: 0 });
const result = counter.add(5); // Returns new machine with count: 5
```

#### `createMachine<C, T>(context, factory)`

Creates a synchronous state machine using the **Functional Builder** pattern. This is the recommended approach for type safety and ergonomics.

```typescript
const machine = createMachine({ count: 0 }, (next) => ({
  increment() {
    // `this` is correctly inferred as Context
    return next({ count: this.count + 1 });
  },
  add(n: number) {
    return next({ count: this.count + n });
  }
}));
```

#### `createMachine<C, T>(context, transitions)` (Traditional)

Creates a synchronous state machine from a context and transition functions.

**Recommended (better type inference):**
```typescript
const machine = createMachine({ count: 0 }, (next) => ({
  increment() { return next({ count: this.count + 1 }); }
}));
```

**Traditional (requires explicit `this` typing):**
```typescript
const transitions = {
  increment(this: { count: number }) { return createMachine({ count: this.count + 1 }, transitions); }
};
const machine = createMachine({ count: 0 }, transitions);
```
---
### `createMachineBuilder()`
Creates a factory function from a template class instance.

-   **Use Case:** For class-based machines when you want a simple factory function instead of using `new`.
-   **Example:**
    ```typescript
    const createCounter = createMachineBuilder(new Counter({ count: 0 }));
    const counter1 = createCounter({ count: 50 });
    ```
---
### `createTransitionFactory()`
Creates a factory for building type-safe transitions from pure context transformers.

-   **Signature:** `function createTransitionFactory<C>(): (transformer) => TransitionFunction`
-   **Use Case:** For functional-style machine construction where you want to separate data transformation logic from machine creation.
-   **Example:**
    ```typescript
    const createTransition = createTransitionFactory<{ count: number }>();
    const increment = createTransition(ctx => ({ count: ctx.count + 1 }));
    const add = createTransition((ctx, amount: number) => ({ count: ctx.count + amount }));

    const machine = createMachine({ count: 0 }, { increment, add });
    ```
---
### `createTransitionExtender()`
Creates a factory for functionally extending existing machines with new transitions.

-   **Signature:** `function createTransitionExtender<M>(machine: M): ExtenderObject`
-   **Use Case:** For progressive enhancement of machines through functional composition.
-   **Example:**
    ```typescript
    const baseMachine = createMachine({ value: 10 }, {});
    const extended = createTransitionExtender(baseMachine)
      .addTransition('double', ctx => ({ value: ctx.value * 2 }))
      .addTransition('reset', ctx => ({ value: 0 }));

    const result = extended.machine.double().reset();
    ```
---
### `createFunctionalMachine()`
Creates a complete machine using a curried, two-step approach that separates data from behavior.

-   **Signature:** `function createFunctionalMachine<C>(initialContext: C): (transformers) => Machine<C>`
-   **Use Case:** For the most declarative machine construction where everything is defined as pure data transformations.
-   **Example:**
    ```typescript
    const createCounter = createFunctionalMachine({ count: 0 });
    const counter = createCounter({
      increment: ctx => ({ count: ctx.count + 1 }),
      add: (ctx, amount: number) => ({ count: ctx.count + amount }),
      reset: ctx => ({ count: 0 })
    });
    ```
---
### `state()`
A smart, type-safe function that automatically chooses between traditional and functional machine creation patterns based on the arguments provided.

-   **Signature:** `function state<C>(context: C): (transformers) => Machine<C>` (functional pattern)
-   **Signature:** `function state<C, T>(context: C, transitions: T): Machine<C> & T` (traditional pattern)
-   **Use Case:** When you want a single function that can handle both machine creation patterns intelligently.
-   **Example:**
    ```typescript
    // Traditional pattern (with transitions object)
    const machine1 = state({ count: 0 }, {
      increment() { return createMachine({ count: this.count + 1 }, this); }
    });

    // Functional pattern (curried, with transformers)
    const createCounter = state({ count: 0 });
    const machine2 = createCounter({
      increment: ctx => ({ count: ctx.count + 1 }),
      add: (ctx, n: number) => ({ count: ctx.count + n })
    });
    ```

<br />

## 5. Immutable Helpers
_Best for: Creating a new machine state based on an existing one._

---
### `setContext()`
Creates a new machine with an updated context, preserving all transitions.

-   **Signature:** `function setContext<M>(machine: M, newContextOrFn: Context<M> | ((ctx: Context<M>) => Context<M>)): M`
-   **Example:**
    ```typescript
    const nextMachine = setContext(machine, (ctx) => ({ ...ctx, count: ctx.count + 1 }));
    ```
---
### `next()`
A simpler version of `setContext` that only accepts an updater function.

-   **Signature:** `function next<C>(m: Machine<C>, update: (ctx: C) => C): Machine<C>`
---
### `mergeContext()`
Shallowly merges a partial context into the current context to create a new machine.

-   **Signature:** `function mergeContext<M>(machine: M, partialContext: Partial<Context<M>>): M`
---
### `overrideTransitions()`
Creates a new machine by adding or **replacing** transitions.

-   **Use Case:** Mocking transitions in tests or dynamically changing behavior.
---
### `extendTransitions()`
Creates a new machine by **adding** new transitions. Throws a compile-time error if a transition name already exists.

-   **Use Case:** Safely decorating a machine with new capabilities.

<br />

## 6. Runtime & Orchestration
_Best for: Running async machines and composing workflows._

---
### `runMachine()`
The interpreter for `AsyncMachine`s, providing event dispatch and automatic async cancellation.

-   **Signature:** `function runMachine<M>(initial: M, onChange?): { state, dispatch, stop }`
-   **Returns:** A runner object:
    -   `state`: A getter for the current machine `context`.
    -   `dispatch`: An `async` function to send type-safe events.
    -   `stop`: A function to cancel any in-flight async transition (e.g., on component unmount).
-   **Example:**
    ```typescript
    const runner = runMachine(myAsyncMachine, (newState) => console.log(newState));
    await runner.dispatch({ type: 'fetchData', args: [123] });
    ```
_See also: `docs/abort.md`_
---
### `pipeTransitions()`
Sequentially applies an array of sync or async transitions to a machine.

-   **Signature:** `function pipeTransitions<M>(initial, ...transitions): Promise<M>`
-   **Example:**
    ```typescript
    const finalState = await pipeTransitions(
      counter,
      (m) => m.increment(),
      (m) => m.addAsync(5)
    );
    ```

<br />

## 7. State & Type Guards
_Best for: Safely checking the current state of a machine at runtime._

---
### `isState()`
A **type guard** that checks if a machine is an instance of a specific class.

-   **Use Case:** For class-based, Type-State machines.
-   **Example:**
    ```typescript
    if (isState(machine, LoggedInMachine)) {
      // `machine` is now typed as LoggedInMachine
      console.log(machine.context.username);
    }
    ```
---
### `hasState()`
A **type guard** that checks if a machine's context has a specific discriminant property value.

-   **Use Case:** For functional, Type-State machines with a discriminant field like `status`.
-   **Example:**
    ```typescript
    if (hasState(machine, 'status', 'success')) {
      // `machine.context` is now narrowed
      console.log(machine.context.data);
    }
    ```
---
### `matchMachine()`
Provides exhaustive, type-safe pattern matching on a context's discriminant property.

-   **Use Case:** A clean alternative to `switch` statements for handling different states.
-   **Example:**
    ```typescript
    const message = matchMachine(machine, 'status', {
      idle: () => 'Please start.',
      loading: () => 'Loading...',
      success: (ctx) => `Data loaded: ${ctx.data}`,
    });
    ```

<br />

## 8. Utilities
_Best for: General-purpose helper functions that improve developer experience and solve common problems._

---
### `createEvent()`
A type-safe factory for creating event objects for `runMachine`. This is the recommended way to create events to ensure full type safety.

-   **Signature:** `function createEvent<M, K>(type: K, ...args: TransitionArgs<M, K>): Event<M>`
-   **Benefit:** Provides full autocompletion for the `type` argument (event names) and strong type-checking for the `args` passed to the transition.
-   **Example:**
    ```typescript
    type MyMachine = Machine<{}> & { add: (n: number, m: string) => any };

    // Correct: TypeScript knows 'add' expects a number and a string.
    const event = createEvent<MyMachine, 'add'>('add', 5, 'hello');
    
    // Incorrect: TypeScript will show a compile-time error.
    // const badEvent = createEvent<MyMachine, 'add'>('add', 'wrong', 10); // 🔴 Error!

    await runner.dispatch(event);
    ```
---
### `logState()`
A "tap" utility for `console.log`ing a machine's `context` at any point in a chain of operations, without interrupting the flow.

-   **Signature:** `function logState<M extends Machine<any>>(machine: M, label?: string): M`
-   **Returns:** The original, unmodified machine instance.
-   **Example:**
    ```typescript
    import { logState as tap } from '@doeixd/machine';
    
    const finalState = await pipeTransitions(
      counter,
      tap, // Logs initial state: { count: 0 }
      (m) => m.increment(),
      (m) => tap(m, 'After increment:') // Logs: After increment: { count: 1 }
    );
    ```
---
### `call()`, `bindTransitions()`, `BoundMachine`
Helpers for managing the `this` context binding of transition functions, which is especially useful in generator-based workflows.

-   **`call(fn, context, ...args)`**: Explicitly calls a transition `fn` with a specific `context` bound as `this`.
-   **`bindTransitions(machine)`**: A Proxy-based helper that automatically binds all of a machine's transitions to its context.
-   **`BoundMachine(machine)`**: A class-based, fully type-safe alternative to `bindTransitions`.

_See also: `docs/binding-strategies.md` for a detailed guide on which to choose._

<br />

## 9. Advanced Patterns (`multi.ts`)
_Best for: Building complex application architectures, managing global state, and optimizing for specific environments._

_See also: `docs/patterns.md` and `docs/mutability.md`_

---
### `createRunner()`
Creates a stateful controller that wraps a single machine, providing a stable `actions` object for ergonomic state transitions.

-   **Signature:** `function createRunner<M>(initialMachine: M, onChange?): Runner<M>`
-   **Best for:** Local or component-level state in UI frameworks. It solves the problem of `machine = machine.transition()` reassignment.
-   **Example:**
    ```typescript
    // In a React component
    const runner = useMemo(() => createRunner(createCounter(), (newState) => {
      // update component state
    }), []);
    
    // `runner.actions` is a stable reference, perfect for event handlers.
    return <button onClick={runner.actions.increment}>Increment</button>;
    ```
---
### `createEnsemble()`
Orchestrates machine logic over an external, framework-agnostic state store (like Zustand, Redux, or a simple object).

-   **Signature:** `function createEnsemble<C, F>(store: StateStore<C>, factories: F, getDiscriminant): Ensemble<...>`
-   **Best for:** Global or shared application state where multiple, decoupled domains of logic need to operate on a single state object.
-   **Example:**
    ```typescript
    const store = { getContext: () => myGlobalState, setContext: (s) => { myGlobalState = s; } };
    const authEnsemble = createEnsemble(store, authFactories, ctx => ctx.auth.status);
    const cartEnsemble = createEnsemble(store, cartFactories, ctx => ctx.cart.status);
    
    // Both ensembles operate on the same global state without knowing about each other.
    authEnsemble.actions.login('user');
    cartEnsemble.actions.addItem({ id: 1, name: 'Book' });
    ```
---
### `createEnsembleFactory()`
Creates a higher-order factory function that captures your application's state store and discriminant logic, enabling consistent ensemble creation across large applications.

-   **Signature:** `function createEnsembleFactory<C>(store: StateStore<C>, getDiscriminant): (factories) => Ensemble<...>`
-   **Best for:** Large applications where you want to establish architectural consistency and separate infrastructure setup from feature business logic.
-   **Example:**
    ```typescript
    // Set up your app's state environment once
    const createAppEnsemble = createEnsembleFactory(globalStore, ctx => ctx.auth.status);

    // Feature developers only provide business logic
    const authEnsemble = createAppEnsemble({
      loggedOut: ctx => createMachine(ctx, { login: () => globalStore.setContext({...}) }),
      loggedIn: ctx => createMachine(ctx, { logout: () => globalStore.setContext({...}) })
    });

    const cartEnsemble = createAppEnsemble({
      idle: ctx => createMachine(ctx, { addItem: item => globalStore.setContext({...}) }),
      checkout: ctx => createMachine(ctx, { complete: () => globalStore.setContext({...}) })
    });
    ```
---
### `createMutableMachine()`
Creates a machine with a stable object reference whose `context` is mutated in place by transitions.

-   **Signature:** `function createMutableMachine<C, F>(sharedContext: C, factories: F, getDiscriminant): MutableMachine<...>`
-   **Best for:** High-performance, non-UI environments like backend services, game loops, or complex scripts where object allocation is a concern.
-   **Example:**
    ```typescript
    const player = createMutableMachine({ x: 0, y: 0, state: 'idle' }, playerFactories, c => c.state);
    
    // In a game loop, this is a fast, zero-allocation state update.
    player.move(1, 0); // player object reference is stable, properties change.
    ```
---
### `MultiMachineBase`
An `abstract` base class for building OOP-style, mutable machines that integrate with `createMultiMachine`. Provides protected `.context` and `.setContext()` methods.

<br />

## 10. Adapters (`adapters.ts`)
_Best for: Integrating your machine into standard event-driven architectures, enabling full decoupling._

_See also: `docs/adapters.md`_

---
### `asEventTarget()`
Wraps a machine in a browser-native `EventTarget` interface.

-   **Signature:** `function asEventTarget<M>(initialMachine: M): MachineEventTarget<M>`
-   **Emits:** `statechange` (on every update) and `error` (on invalid transitions).
-   **Receives:** `CustomEvent`s where `event.type` is the transition name and `event.detail` is an array of arguments.
-   **Best for:** Decoupling UI components or creating a global client-side event bus.
---
### `asEventEmitter()`
Wraps a machine in a Node.js-style `EventEmitter` interface.

-   **Signature:** `function asEventEmitter<M>(initialMachine: M): MachineEventEmitter<M>`
-   **Emits:** `statechange` and `error`.
-   **Receives:** Transitions via a type-safe `.dispatch(eventName, ...args)` method.
-   **Best for:** Backend services, scripts, and message-driven architectures.
---
### `asObservable()`
Wraps a machine in a spec-compliant `Observable` interface.

-   **Signature:** `function asObservable<M>(initialMachine: M): MachineObservable<M>`
-   **Emits:** A stream of machine state instances via the `next` channel of its subscribers.
-   **Best for:** Integration with reactive stream libraries like RxJS or in frameworks like Angular.

<br />

## 11. Middleware (`middleware.ts`)
_Best for: Adding cross-cutting concerns like logging, validation, debugging, and resilience without modifying your core machine logic._

_See also: `docs/middleware.md`_

---
### `createMiddleware()`
The core function for wrapping a machine with `before`, `after`, and `error` interception hooks. This is the foundation of the middleware system.
---
### `compose()`
Applies a stack of middleware functions to a machine, creating a single, instrumented machine.

-   **Example:**
    ```typescript
    const instrumented = compose(
      myMachine,
      withLogging,
      withAnalytics(myTracker)
    );
    ```
---
### Pre-built Middleware
A rich library of common, ready-to-use middleware functions:
-   `withLogging()`: Adds detailed console logging for all transitions.
-   `withAnalytics(trackFn)`: Sends transition data to an analytics service.
-   `withValidation(validateFn)`: Validates transitions before they run.
-   `withPermissions(canFn)`: Implements role-based or permission-based access control.
-   `withErrorReporting(reportFn)`: Reports errors to a monitoring service like Sentry.
-   `withRetry(options)`: Adds automatic retry logic with exponential backoff to async transitions.
-   **`withHistory()`**: Records a log of all transition calls and their arguments.
-   **`withSnapshot()`**: Records a log of context changes (before and after states).
-   **`withTimeTravel()`**: Combines `withHistory` and `withSnapshot` to provide a complete time-travel debugging experience, including replaying transitions.

<br />

## 12. Statechart Primitives (`primitives.ts`)
_Best for: Annotating your code to enable automatic statechart extraction for visualization and analysis._

**Important:** These are **identity functions at runtime** (zero overhead). Their only purpose is to add metadata for the static (`npm run extract`) and runtime analysis tools.

_See also: `docs/statechart-extraction.md`_

---
### `transitionTo()`
Annotates a transition with its target state class. The most fundamental primitive.
```typescript
login = transitionTo(LoggedInMachine, (user) => new LoggedInMachine({ user }));
```
---
### `describe()`
Adds a human-readable description to a transition, which appears in the generated statechart.
```typescript
logout = describe("Logs the user out and clears the session", transitionTo(...));
```
---
### `guarded()`
Adds **metadata** for a guard condition to a transition for the statechart diagram. This does **not** add runtime validation.
```typescript
delete = guarded({ name: "isAdmin" }, transitionTo(...));
```
---
### `invoke()`
Annotates an async transition as an "invoked service," specifying `onDone` and `onError` target states for the statechart.
```typescript
load = invoke({ src: "fetchData", onDone: Success, onError: Error }, async ({ signal }) => ...);
```
---
### `action()`
Adds metadata for a side effect (an "action") to a transition for the statechart.
```typescript
save = action({ name: "persistToDb" }, transitionTo(...));
```
---
### `guard()`
Creates a **runtime guard** that checks a condition before executing a transition. This is a true runtime feature that provides actual protection.

-   **Example:**
    ```typescript
    withdraw = guard(
      (ctx, amount) => ctx.balance >= amount,
      function(amount) { /* ... */ },
      { onFail: 'throw', errorMessage: 'Insufficient funds' }
    );
    ```
---
### `whenGuard()`
A fluent, chainable API for creating runtime guards.

-   **Example:**
    ```typescript
    delete = whenGuard((ctx) => ctx.isAdmin)
      .do((id) => { /* delete logic */ })
      .else(() => { /* handle unauthorized */ });
    ```