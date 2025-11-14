[![npm version](https://badge.fury.io/js/@doeixd%2Fmachine.svg)](https://badge.fury.io/js/@doeixd%2Fmachine)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/doeixd/machine)

# Machine

A minimal, type-safe state machine library for TypeScript.

> **Philosophy**: Provide minimal primitives that capture the essence of finite state machines, with maximum type safety and flexibility. **Type-State Programming** is our core paradigm—we use TypeScript's type system itself to represent finite states, making illegal states unrepresentable and invalid transitions impossible to write. The compiler becomes your safety net, catching state-related bugs before your code ever runs.

## Installation

```bash
npm install @doeixd/machine
# or
yarn add @doeixd/machine
# or
pnpm add @doeixd/machine
```

## 🧩 Core Tenets of State Machines

A state machine (formally, a **finite state machine** or FSM) is a mathematical model of computation defined by:

### Formal Definition

An FSM is a 5-tuple: **M = (S, Σ, δ, s₀, F)** where:

- **S** - Finite set of states (the system can only be in one discrete configuration at a time)
- **Σ** - Input alphabet (the set of events/symbols the machine can respond to)
- **δ** - Transition function: `δ : S × Σ → S` (given current state and input, determine next state)
- **s₀** - Initial state (the defined starting state)
- **F** - Final/accepting states (optional, for recognizers)

### Key Properties

1. **Determinism**: A deterministic FSM yields exactly one next state per (state, input) pair
2. **Markov Property**: The next state depends only on the current state and input, not on history
3. **Finite States**: Only a limited number of discrete configurations exist

### How `@doeixd/machine` Implements These Tenets

```typescript
type Machine<C extends object> = {
  context: C;  // Encodes the current state (s ∈ S)
} & Record<string, (...args: any[]) => Machine<any>>; // Transition functions (δ)
```

**Mapping to formal FSM:**

- **States (S)**: Represented by the machine's `context` and type signature. In Type-State Programming, different types = different states.
- **Input Alphabet (Σ)**: The transition function names (e.g., `increment`, `login`, `fetch`).
- **Transition Function (δ)**: Each method on the machine is a transition. It takes the current context (`this`) plus arguments (input symbols) and returns the next machine state.
- **Initial State (s₀)**: The first context passed to `createMachine()`.
- **Determinism**: Each transition is a pure function that deterministically computes the next state.
- **Markov Property**: Transitions only access `this.context` (current state) and their arguments (input). No hidden state or history.

**Flexibility**: Unlike rigid FSM implementations, you can choose your level of immutability. Want to mutate? You can. Want pure functions? You can. Want compile-time state validation? Type-State Programming gives you that.

**Read more about our core principles:** [ 📖 Core Principles Guide ](./docs/principles.md)

## Quick Start

### Basic Counter (Simple State)

```typescript
import { createMachine } from "@doeixd/machine";

const counter = createMachine(
  { count: 0 }, // Initial state (s₀)
  {
    // Transitions (δ)
    increment: function() {
      return createMachine({ count: this.count + 1 }, this);
    },
    add: function(n: number) {
      return createMachine({ count: this.count + n }, this);
    }
  }
);

const next = counter.increment();
console.log(next.context.count); // 1

// Original is untouched (immutability by default)
console.log(counter.context.count); // 0
```

### Type-State Programming (Compile-Time State Safety)

The most powerful pattern: different machine types represent different states.

```typescript
import { createMachine, Machine } from "@doeixd/machine";

// Define distinct machine types for each state
type LoggedOut = Machine<{ status: "loggedOut" }> & {
  login: (username: string) => LoggedIn;
};

type LoggedIn = Machine<{ status: "loggedIn"; username: string }> & {
  logout: () => LoggedOut;
  viewProfile: () => LoggedIn;
};

// Create factory functions
const createLoggedOut = (): LoggedOut => {
  return createMachine({ status: "loggedOut" }, {
    login: function(username: string): LoggedIn {
      return createLoggedIn(username);
    }
  });
};

const createLoggedIn = (username: string): LoggedIn => {
  return createMachine({ status: "loggedIn", username }, {
    logout: function(): LoggedOut {
      return createLoggedOut();
    },
    viewProfile: function(): LoggedIn {
      console.log(`Viewing ${this.username}'s profile`);
      return this;
    }
  });
};

// Usage
const machine = createLoggedOut();

// TypeScript prevents invalid transitions at compile time!
// machine.logout(); // ❌ Error: Property 'logout' does not exist on type 'LoggedOut'

const loggedIn = machine.login("alice");
// loggedIn.login("bob"); // ❌ Error: Property 'login' does not exist on type 'LoggedIn'

const loggedOut = loggedIn.logout(); // ✅ Valid
```

This pattern makes **illegal states unrepresentable** in your type system.

## 🎯 Type-State Programming: The Core Philosophy

Type-State Programming is **the fundamental philosophy** of this library. Instead of representing states as strings or enums that you check at runtime, **states are types themselves**. TypeScript's compiler enforces state validity at compile time.

### Why Type-State Programming?

**Traditional Approach (Runtime Checks):**
```typescript
// ❌ State is just data - compiler can't help
type State = { status: "loggedOut" } | { status: "loggedIn"; username: string };

function logout(state: State) {
  if (state.status === "loggedOut") {
    // Oops! Already logged out, but this only fails at runtime
    throw new Error("Already logged out!");
  }
  return { status: "loggedOut" as const };
}

// Nothing prevents you from calling logout on loggedOut state
const state: State = { status: "loggedOut" };
logout(state); // Runtime error!
```

**Type-State Approach (Compile-Time Enforcement):**
```typescript
// ✅ States are distinct types - compiler enforces validity
type LoggedOut = Machine<{ status: "loggedOut" }> & {
  login: (user: string) => LoggedIn;
  // No logout method - impossible to call
};

type LoggedIn = Machine<{ status: "loggedIn"; username: string }> & {
  logout: () => LoggedOut;
  // No login method - impossible to call
};

const state: LoggedOut = createLoggedOut();
// state.logout(); // ❌ Compile error! Property 'logout' does not exist
```

### How TypeScript Catches Bugs

The type system prevents entire categories of bugs:

#### 1. Invalid State Transitions
```typescript
const loggedOut: LoggedOut = createLoggedOut();
const loggedIn: LoggedIn = loggedOut.login("alice");

// ❌ Compile error! Can't login when already logged in
// loggedIn.login("bob");
//          ^^^^^
// Property 'login' does not exist on type 'LoggedIn'

// ❌ Compile error! Can't logout when already logged out
// loggedOut.logout();
//           ^^^^^^
// Property 'logout' does not exist on type 'LoggedOut'
```

#### 2. Accessing Invalid State Data
```typescript
const loggedOut: LoggedOut = createLoggedOut();

// ❌ Compile error! 'username' doesn't exist on LoggedOut
// console.log(loggedOut.context.username);
//                                ^^^^^^^^
// Property 'username' does not exist on type '{ status: "loggedOut" }'

const loggedIn: LoggedIn = loggedOut.login("alice");
console.log(loggedIn.context.username); // ✅ OK! TypeScript knows it exists
```

#### 3. Exhaustive Pattern Matching
```typescript
// TypeScript enforces handling ALL possible states
const message = matchMachine(machine, "status", {
  idle: (ctx) => "Waiting...",
  loading: (ctx) => "Loading...",
  success: (ctx) => `Done: ${ctx.data}`,
  error: (ctx) => `Error: ${ctx.error}`
  // If you forget a case, TypeScript error!
});
```

#### 4. Type Narrowing with Guards
```typescript
declare const machine: IdleMachine | LoadingMachine | SuccessMachine;

if (hasState(machine, "status", "success")) {
  // TypeScript narrows the type to SuccessMachine
  console.log(machine.context.data); // ✅ 'data' is known to exist
  machine.retry(); // ✅ Only methods available on SuccessMachine are accessible
}
```

#### 5. Event Type Safety
```typescript
type FetchMachine = AsyncMachine<{ status: string }> & {
  fetch: (id: number) => Promise<FetchMachine>;
  retry: () => Promise<FetchMachine>;
};

const runner = runMachine(createFetchMachine());

// ✅ TypeScript knows the exact event shape
await runner.dispatch({ type: "fetch", args: [123] });

// ❌ Compile error! Wrong argument type
// await runner.dispatch({ type: "fetch", args: ["abc"] });
//                                               ^^^^^

// ❌ Compile error! Unknown event type
// await runner.dispatch({ type: "unknown", args: [] });
//                                ^^^^^^^^^^
```

### Type-State vs. String-Based State

| Aspect | String-Based | Type-State Programming |
|--------|-------------|------------------------|
| **State Representation** | String literals (`"idle"`, `"loading"`) | TypeScript types (different machine types) |
| **Validation** | Runtime checks (`if (state === "idle")`) | Compile-time (type system) |
| **Transition Safety** | No enforcement - any transition possible | Compiler prevents invalid transitions |
| **Available Actions** | All methods available, must check state | Only valid methods available per state |
| **Data Access** | May access undefined data | Type system ensures data exists |
| **Bugs Caught** | At runtime (in production) | At compile time (during development) |
| **Refactoring Safety** | Easy to miss edge cases | Compiler finds all affected code |
| **Learning Curve** | Familiar to most developers | Requires understanding advanced TypeScript |

### Benefits of Type-State Programming

1. **Bugs caught at compile time**, not in production
2. **Impossible to write invalid state transitions**
3. **Autocomplete shows only valid transitions** for current state
4. **Refactoring is safer** - compiler finds all breaking changes
5. **Self-documenting code** - types express the state machine structure
6. **No runtime overhead** - all checks happen at compile time
7. **Gradual adoption** - can mix with simpler approaches

### When to Use Type-State Programming

**Use Type-State when:**
- ✅ You have distinct states with different available actions
- ✅ Invalid state transitions would cause bugs
- ✅ Different states have different data available
- ✅ You want maximum compile-time safety
- ✅ Complex state machines (auth, network requests, multi-step forms)

**Use simple context-based state when:**
- ✅ Just tracking data changes (like a counter)
- ✅ All operations are always valid
- ✅ Simplicity is more important than exhaustive safety

### Example: Network Request State Machine

This shows the full power of Type-State Programming:

```typescript
// Define the states as distinct types
type IdleState = Machine<{ status: "idle" }> & {
  fetch: (url: string) => LoadingState;
};

type LoadingState = Machine<{ status: "loading"; url: string }> & {
  cancel: () => IdleState;
  // Note: No fetch - can't start new request while loading
};

type SuccessState = Machine<{ status: "success"; data: any }> & {
  refetch: () => LoadingState;
  clear: () => IdleState;
  // Note: No cancel - nothing to cancel
};

type ErrorState = Machine<{ status: "error"; error: string }> & {
  retry: () => LoadingState;
  clear: () => IdleState;
};

// Union type for the overall machine
type FetchMachine = IdleState | LoadingState | SuccessState | ErrorState;

// Implementation
const createIdle = (): IdleState =>
  createMachine({ status: "idle" }, {
    fetch: function(url: string): LoadingState {
      return createLoading(url);
    }
  });

const createLoading = (url: string): LoadingState =>
  createMachine({ status: "loading", url }, {
    cancel: function(): IdleState {
      return createIdle();
    }
  });

// ... implement other states

// Usage - TypeScript guides you
const machine: FetchMachine = createIdle();

if (hasState(machine, "status", "idle")) {
  const loading = machine.fetch("/api/data"); // ✅ OK
  // loading.fetch("/other"); // ❌ Error! Can't fetch while loading
  const idle = loading.cancel(); // ✅ Can cancel loading
}
```

**The compiler prevents you from:**
- Starting a new fetch while one is in progress
- Canceling when there's nothing to cancel
- Accessing `data` before the request succeeds
- Accessing `error` when request succeeds
- Any other invalid state transition

This is the essence of Type-State Programming: **Make illegal states unrepresentable**.

## Core API

### Machine Creation

#### `createMachine<C, T>(context, transitions)`

Creates a synchronous state machine.

```typescript
const machine = createMachine(
  { count: 0 },  // Context (state data)
  {              // Transitions (state transformations)
    increment: function() {
      return createMachine({ count: this.count + 1 }, this);
    }
  }
);
```

#### `createAsyncMachine<C, T>(context, transitions)`

Creates an async state machine (for side effects, API calls, etc.).

```typescript
const machine = createAsyncMachine(
  { status: "idle", data: null },
  {
    async fetch() {
      try {
        const data = await api.getData();
        return createAsyncMachine({ status: "success", data }, this);
      } catch (error) {
        return createAsyncMachine({ status: "error", data: null }, this);
      }
    }
  }
);
```

#### `createMachineFactory<C>()`

Higher-order function for cleaner machine creation. Write pure context transformers instead of full transition functions.

```typescript
import { createMachineFactory } from "@doeixd/machine";

// Define pure transformations
const counterFactory = createMachineFactory<{ count: number }>()({
  increment: (ctx) => ({ count: ctx.count + 1 }),
  add: (ctx, n: number) => ({ count: ctx.count + n }),
  reset: (ctx) => ({ count: 0 })
});

// Create instances
const counter = counterFactory({ count: 0 });
const next = counter.add(5); // { count: 5 }
```

Benefits:
- Less boilerplate (no `createMachine` calls in transitions)
- Pure functions are easier to test
- Cleaner separation of logic and structure

### Runtime & Events

#### `runMachine<M>(initial, onChange?)`

Creates a managed runtime for async machines with event dispatching.

```typescript
import { runMachine, Event } from "@doeixd/machine";

const runner = runMachine(
  createFetchMachine(),
  (machine) => {
    console.log("State changed:", machine.context);
  }
);

// Type-safe event dispatch
await runner.dispatch({ type: "fetch", args: [123] });

// Access current state
console.log(runner.state); // Current context
```

The `Event<M>` type automatically generates a discriminated union of all valid events from your machine type:

```typescript
type FetchEvent = Event<FetchMachine>;
// = { type: "fetch", args: [number] } | { type: "retry", args: [] } | ...
```

### State Utilities

#### `setContext<M>(machine, newContext)`

Immutably updates a machine's context while preserving transitions.

```typescript
import { setContext } from "@doeixd/machine";

// With updater function
const updated = setContext(machine, (ctx) => ({ count: ctx.count + 1 }));

// With direct value
const reset = setContext(machine, { count: 0 });
```

#### `next<C>(machine, update)`

Simpler version of `setContext` - applies an update function to the context.

```typescript
import { next } from "@doeixd/machine";

const updated = next(counter, (ctx) => ({ count: ctx.count + 1 }));
```

#### `matchMachine<M, K, R>(machine, key, handlers)`

Type-safe pattern matching on discriminated unions in context.

```typescript
import { matchMachine } from "@doeixd/machine";

const message = matchMachine(machine, "status", {
  idle: (ctx) => "Ready to start",
  loading: (ctx) => "Loading...",
  success: (ctx) => `Loaded: ${ctx.data}`,
  error: (ctx) => `Error: ${ctx.error}`
});
```

TypeScript enforces exhaustive checking - you must handle all cases!

#### `hasState<M, K, V>(machine, key, value)`

Type guard for state checking with type narrowing.

```typescript
import { hasState } from "@doeixd/machine";

if (hasState(machine, "status", "loading")) {
  // TypeScript knows machine.context.status === "loading"
  console.log("Currently loading");
}
```

### Composition & Transformation

#### `overrideTransitions<M, T>(machine, overrides)`

Creates a new machine with replaced/added transitions. Perfect for testing and decoration.

```typescript
import { overrideTransitions } from "@doeixd/machine";

// Mock for testing
const mocked = overrideTransitions(counter, {
  increment: function() {
    return createMachine({ count: 999 }, this);
  }
});

// Decorate with logging
const logged = overrideTransitions(counter, {
  increment: function() {
    console.log("Before:", this.count);
    const next = counter.increment.call(this);
    console.log("After:", next.context.count);
    return next;
  }
});
```

#### `extendTransitions<M, T>(machine, newTransitions)`

Safely adds new transitions. Prevents accidental overwrites with compile-time errors.

```typescript
import { extendTransitions } from "@doeixd/machine";

const extended = extendTransitions(counter, {
  reset: function() {
    return createMachine({ count: 0 }, this);
  }
});

// Compile error if transition already exists:
// extendTransitions(counter, { increment: ... }); // ❌ Error!
```

#### `createMachineBuilder<M>(template)`

Creates a factory from a template machine. Excellent for class-based machines.

```typescript
import { MachineBase, createMachineBuilder } from "@doeixd/machine";

class User extends MachineBase<{ id: number; name: string }> {
  rename(name: string) {
    return buildUser({ ...this.context, name });
  }
}

const template = new User({ id: 0, name: "" });
const buildUser = createMachineBuilder(template);

// Stamp out instances
const alice = buildUser({ id: 1, name: "Alice" });
const bob = buildUser({ id: 2, name: "Bob" });
```

### Type Utilities

#### Type Extraction

```typescript
import { Context, Transitions, Event, TransitionArgs } from "@doeixd/machine";

type MyMachine = Machine<{ count: number }> & {
  add: (n: number) => MyMachine;
};

type Ctx = Context<MyMachine>;           // { count: number }
type Trans = Transitions<MyMachine>;     // { add: (n: number) => MyMachine }
type Evt = Event<MyMachine>;             // { type: "add", args: [number] }
type Args = TransitionArgs<MyMachine, "add">; // [number]
```

#### Additional Types

```typescript
import {
  DeepReadonly,      // Make types deeply immutable
  InferMachine,      // Extract machine type from factory
  TransitionNames,   // Get union of transition names
  BaseMachine,       // Base type for Machine & AsyncMachine
  MachineLike,       // Machine or Promise<Machine>
  MachineResult      // Machine or [Machine, cleanup]
} from "@doeixd/machine";

type Factory = () => createMachine({ count: 0 }, { ... });
type M = InferMachine<Factory>; // Extracts return type

type Names = TransitionNames<MyMachine>; // "add" | "increment" | ...

// For functions that can return sync or async machines
function getMachine(): MachineLike<{ count: number }> {
  // Can return either Machine or Promise<Machine>
}

// For transitions with cleanup effects
function enterState(): MachineResult<{ timer: number }> {
  const interval = setInterval(() => tick(), 1000);
  const machine = createMachine({ timer: 0 }, { ... });
  return [machine, () => clearInterval(interval)];
}
```

## Advanced Features

### Generator-Based Composition

For complex multi-step workflows, use generator-based composition. This provides an imperative, procedural style while maintaining immutability and type safety.

```typescript
import { run, step } from "@doeixd/machine";

const result = run(function* (machine) {
  // Write sequential code with generators
  let m = yield* step(machine.increment());
  m = yield* step(m.add(5));

  // Use normal control flow
  if (m.context.count > 10) {
    m = yield* step(m.reset());
  }

  // Loops work naturally
  for (let i = 0; i < 3; i++) {
    m = yield* step(m.increment());
  }

  return m.context.count;
}, counter);
```

**Benefits:**
- Write imperative code that feels sequential
- Maintain immutability (each step yields a new state)
- Full type safety maintained
- Use if/else, loops, try/catch naturally
- Great for testing and step-by-step workflows

**Utilities:**
- `run(flow, initial)` - Execute a generator flow
- `step(machine)` - Yield a state and receive the next
- `runSequence(initial, flows)` - Compose multiple flows
- `createFlow(fn)` - Create reusable flow patterns
- `runWithDebug(flow, initial)` - Debug with logging
- `runAsync(flow, initial)` - Async generator support

```typescript
// Async generators for async machines
const result = await runAsync(async function* (m) {
  m = yield* stepAsync(await m.fetchData());
  m = yield* stepAsync(await m.processData());
  return m.context;
}, asyncMachine);

// Reusable flows
const incrementThrice = createFlow(function* (m) {
  m = yield* step(m.increment());
  m = yield* step(m.increment());
  m = yield* step(m.increment());
  return m;
});

const result = run(function* (m) {
  m = yield* incrementThrice(m);  // Compose flows
  m = yield* step(m.add(10));
  return m;
}, counter);
```

### React Integration

```typescript
import { useMachine } from "@doeixd/machine/react";

function Counter() {
  const [machine, dispatch] = useMachine(() => createCounterMachine());

  return (
    <div>
      <p>Count: {machine.context.count}</p>
      <button onClick={() => dispatch({ type: "increment", args: [] })}>
        Increment
      </button>
    </div>
  );
}
```

### Solid.js Integration

Comprehensive Solid.js integration with signals, stores, and fine-grained reactivity:

```typescript
import { createMachine, createMachineStore, createAsyncMachine } from "@doeixd/machine/solid";

// Signal-based (simple state)
function Counter() {
  const [machine, actions] = createMachine(() => createCounterMachine());

  return (
    <div>
      <p>Count: {machine().context.count}</p>
      <button onClick={actions.increment}>Increment</button>
    </div>
  );
}

// Store-based (fine-grained reactivity for complex context)
function UserProfile() {
  const [machine, setMachine, actions] = createMachineStore(() =>
    createUserMachine()
  );

  return (
    <div>
      <p>Name: {machine.context.profile.name}</p>
      <p>Age: {machine.context.profile.age}</p>
      <button onClick={() => actions.updateName('Alice')}>Change Name</button>
    </div>
  );
}

// Async machine with reactive state
function DataFetcher() {
  const [state, dispatch] = createAsyncMachine(() => createFetchMachine());

  return (
    <Switch>
      <Match when={state().context.status === 'idle'}>
        <button onClick={() => dispatch({ type: 'fetch', args: [] })}>
          Load
        </button>
      </Match>
      <Match when={state().context.status === 'loading'}>
        <p>Loading...</p>
      </Match>
      <Match when={state().context.status === 'success'}>
        <p>Data: {state().context.data}</p>
      </Match>
    </Switch>
  );
}
```

**Solid utilities:**
- `createMachine()` - Signal-based reactive machine
- `createMachineStore()` - Store-based with fine-grained reactivity
- `createAsyncMachine()` - Async machine with signals
- `createMachineContext()` - Context-only store
- `createMachineSelector()` - Memoized derivations
- `createMachineEffect()` - Lifecycle effects on state changes
- `createMachineValueEffect()` - Effects on context values

### DevTools Integration

```typescript
import { connectToDevTools } from "@doeixd/machine/devtools";

const runner = connectToDevTools(createMachine(...));
// Automatically sends state changes to browser extension
```

### Static Analysis & Visualization

Use type-level metadata to extract formal statecharts:

```typescript
import { transitionTo, guarded, invoke, describe } from "@doeixd/machine/primitives";

class AuthMachine extends MachineBase<{ status: "idle" }> {
  // Annotate transitions with metadata
  login = describe(
    "Authenticates the user",
    transitionTo(LoggedInMachine, (username: string) => {
      return new LoggedInMachine({ username });
    })
  );

  // Add guards
  adminAction = guarded(
    { name: "isAdmin" },
    transitionTo(AdminMachine, () => new AdminMachine())
  );

  // Declare async effects
  fetchData = invoke(
    {
      src: "fetchUserData",
      onDone: SuccessMachine,
      onError: ErrorMachine
    },
    async () => { /* ... */ }
  );
}
```

Extract to JSON statechart:

```bash
npx ts-node src/extract.ts > statechart.json
```

This generates formal statechart definitions compatible with visualization tools like Stately.ai.

### OOP Style with `MachineBase`

For complex machines, use class-based approach:

```typescript
import { MachineBase, Context } from "@doeixd/machine";

class Counter extends MachineBase<{ count: number }> {
  constructor(count = 0) {
    super({ count });
  }

  increment(): Counter {
    return new Counter(this.context.count + 1);
  }

  add(n: number): Counter {
    return new Counter(this.context.count + n);
  }
}

const counter = new Counter(5);
const next = counter.increment(); // count: 6
```

## Utilities Module

Additional helpers in `@doeixd/machine/utils`:

```typescript
import {
  isState,           // Type-safe state checking (for classes)
  createEvent,       // Event factory with inference
  mergeContext,      // Shallow merge context updates
  pipeTransitions,   // Compose transitions sequentially
  logState          // Debug helper (tap function)
} from "@doeixd/machine/utils";

// Type-safe class instance check
if (isState(machine, LoggedInMachine)) {
  machine.logout(); // TypeScript knows it's LoggedInMachine
}

// Event creation
const event = createEvent<MyMachine, "add">("add", 5);

// Merge partial context
const updated = mergeContext(user, { status: "active" });

// Compose transitions
const result = await pipeTransitions(
  machine,
  (m) => m.increment(),
  (m) => m.add(5),
  (m) => m.increment()
);

// Debug logging
pipeTransitions(
  machine,
  logState, // Logs current state
  (m) => m.increment(),
  (m) => logState(m, "After increment:")
);
```

## Philosophy & Design Principles

### 1. Type-State Programming First

**Type-State Programming is the heart of this library.** The type system itself represents your state machine:

- **States are types**, not strings or enums
- **Invalid transitions are compile errors**, not runtime exceptions
- **TypeScript is your safety net** - bugs are caught during development
- **The compiler guides you** - autocomplete shows only valid transitions

This isn't just a feature—it's the fundamental way you should think about state machines in TypeScript. Make illegal states unrepresentable.

### 2. Minimal Primitives

The core library provides only the essential building blocks:
- `Machine<C>` and `AsyncMachine<C>` types
- `createMachine()` and `createAsyncMachine()` functions
- `runMachine()` for async runtime
- Basic composition utilities

Everything else is built on top of these primitives. We give you the foundation; you build what you need.

### 3. TypeScript as the Compiler

We rely heavily on TypeScript's type system to catch bugs:

- **Full type inference** - minimal annotations needed
- **Exhaustive checking** - compiler ensures all cases handled
- **Type narrowing** - guards refine types automatically
- **No escape hatches** - no `any` in public APIs
- **Compile-time validation** - zero runtime overhead for safety

The philosophy: if it compiles, it's safe.

### 4. No Magic Strings - Typed References Only

We avoid magic strings wherever possible. Instead, we use **typed object references** so TypeScript can infer types automatically:

```typescript
// ✅ Good: Typed method reference
const counter = createMachine({ count: 0 }, {
  increment: function() {
    return createMachine({ count: this.count + 1 }, this);
  }
});

counter.increment(); // TypeScript knows this exists

// ✅ Good: Events inferred from machine structure
type CounterEvent = Event<typeof counter>;
// Automatically: { type: "increment", args: [] }

// ❌ Bad (other libraries): Magic strings
// send({ type: "INCREMENT" }) // Easy to typo, no refactoring support
```

**Benefits:**
- **Rename refactoring works perfectly** - change method name, all call sites update
- **Impossible to typo** - TypeScript catches invalid references
- **Autocomplete everywhere** - IDE knows what methods exist
- **Type inference flows naturally** - no manual type annotations needed
- **No runtime string matching** - direct function calls are faster

### 5. Flexibility Over Prescription

- **Immutability by default but not enforced** - mutate if you need to
- **Multiple styles supported**: functional, OOP, factory pattern
- **No hidden magic** - what you see is what you get
- **Pay for what you use** - minimal runtime overhead
- **Progressive enhancement** - start simple, add Type-State when needed

### 6. Solid Foundation for Extension

This library is designed to be extended:
- Build your own abstractions on top
- Add custom primitives for your domain
- Use the type system to enforce your invariants
- Extract formal models with static analysis
- Create domain-specific state machine libraries

## Comparison with Other Libraries

> **📖 [Read the full in-depth comparison with XState](./docs/XSTATE_COMPARISON.md)** - Comprehensive analysis of philosophy, features, API differences, strengths/weaknesses, use cases, and code examples.

### vs. XState (Summary)

**XState** is a comprehensive implementation of Statecharts with nested states, parallel states, actors, and more.

**Key Differences:**
- **Paradigm**: XState is declarative (config objects). `@doeixd/machine` is imperative (method calls).
- **Type Safety**: XState uses string-based states with good TypeScript support. We use **Type-State Programming**—states ARE types, enforced at compile time.
- **Complexity**: XState provides full Statecharts features. `@doeixd/machine` provides minimal primitives to build upon.
- **Strings**: XState uses event strings (`send('ACTION')`). We use typed method references (`machine.action()`).
- **Use Case**: XState for complex app-wide orchestration. `@doeixd/machine` for type-safe component logic and custom abstractions.
- **Bundle Size**: XState ~15-20KB. `@doeixd/machine` ~1.3KB.

**When to use each:**
- **XState**: Need nested states, parallel states, actors, visual editor, or complex workflows
- **@doeixd/machine**: Want maximum type safety, minimal bundle, compile-time guarantees, or building on primitives

### vs. Robot3

**Robot3** is also minimal and functional.

- **API**: Robot3 uses message passing (`send()`). We use direct method calls (`machine.action()`).
- **Type-State**: Robot3 has good TS support, but Type-State Programming is more central here.
- **Flexibility**: Both are flexible, but we provide more compositional utilities out of the box.
- **Strings**: Robot3 uses event strings. We avoid magic strings entirely.

### Choose `@doeixd/machine` if you:

- Want to leverage TypeScript's type system for **compile-time correctness**
- Prefer **minimal primitives** you can build upon
- Need **Type-State Programming** for finite state validation
- Want **flexibility** in how you model state (immutable, mutable, classes, functions)
- Value **mathematical foundations** and formal correctness
- Want to **avoid magic strings** and use typed references
- Care about **bundle size** (1.3KB vs 15KB+)

## API Reference

### Core Types

```typescript
// Machine types
type Machine<C extends object>
type AsyncMachine<C extends object>
type BaseMachine<C extends object>

// Type utilities
type Context<M>
type Transitions<M>
type Event<M>
type TransitionArgs<M, K>
type TransitionNames<M>
type DeepReadonly<T>
type InferMachine<F>
type MachineLike<C>
type MachineResult<C>

// Classes
class MachineBase<C extends object>
```

### Core Functions

```typescript
// Creation
createMachine<C, T>(context: C, fns: T): Machine<C> & T
createAsyncMachine<C, T>(context: C, fns: T): AsyncMachine<C> & T
createMachineFactory<C>(): (transformers) => (initialContext) => Machine<C>

// Runtime
runMachine<M>(initial: M, onChange?: (m: M) => void): { state, dispatch }

// Composition & State Updates
setContext<M>(machine: M, newContext): M
next<C>(machine: Machine<C>, update: (ctx: C) => C): Machine<C>
overrideTransitions<M, T>(machine: M, overrides: T): M & T
extendTransitions<M, T>(machine: M, newTransitions: T): M & T
createMachineBuilder<M>(template: M): (context) => M

// Pattern Matching
matchMachine<M, K, R>(machine: M, key: K, handlers): R
hasState<M, K, V>(machine: M, key: K, value: V): boolean

// Generator-Based Composition
run<C, T>(flow: (m: Machine<C>) => Generator<...>, initial: Machine<C>): T
step<C>(machine: Machine<C>): Generator<...>
runSequence<C>(initial: Machine<C>, flows: Array<...>): Machine<C>
createFlow<C>(flow: (m: Machine<C>) => Generator<...>): (m: Machine<C>) => Generator<...>
runWithDebug<C, T>(flow: ..., initial: Machine<C>, logger?: ...): T
runAsync<C, T>(flow: (m: Machine<C>) => AsyncGenerator<...>, initial: Machine<C>): Promise<T>
stepAsync<C>(machine: Machine<C>): AsyncGenerator<...>
```

## License

MIT

## Contributing

Contributions welcome! This library aims to stay minimal while providing a solid foundation. When proposing features, consider whether they belong in the core or as a separate extension package.
