[![npm version](https://badge.fury.io/js/@doeixd%2Fmachine.svg)](https://badge.fury.io/js/@doeixd%2Fmachine)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/doeixd/machine)

# Machine

A minimal, type-safe state machine library for TypeScript.

> **Philosophy**: Provide minimal primitives that capture the essence of finite state machines, with maximum type safety and flexibility. **Type-State Programming** is our core paradigm—we use TypeScript's type system itself to represent finite states, making illegal states unrepresentable and invalid transitions impossible to write. The compiler becomes your safety net, catching state-related bugs before your code ever runs.

> **Middleware System**: For production-ready state machines, we provide a comprehensive middleware system for cross-cutting concerns like logging, analytics, validation, error handling, and debugging. **📖 [Read the Middleware Guide](./docs/middleware.md)**

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

## Choosing the Right Pattern

The library offers multiple patterns for different use cases. **📖 [Pattern Decision Guide](./docs/patterns.md)** - A comprehensive guide to help you choose between Basic Machines, Runner, Ensemble, Generators, Classes, and more.

## Quick Start

### Basic Counter (Simple State)

**Immutable approach (recommended):**

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

**Mutable approach (also supported):**

```typescript
// If you prefer mutable state, just return `this`
const counter = createMachine(
  { count: 0 },
  {
    increment: function() {
      (this.context as any).count++;
      return this; // Return same instance
    }
  }
);

counter.increment();
console.log(counter.context.count); // 1 (mutated in place)
```

This shows the **flexibility** of the library: immutability is the default pattern because it's safer, but you can choose mutability when it makes sense for your use case.

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

### Transition Binding Helpers

These utilities eliminate the need for `.call(m.context, ...)` boilerplate when invoking transitions.

#### `call<C, F>(fn, context, ...args)`

Explicitly binds a transition function to a context and invokes it. Useful when you need to call a transition with proper `this` binding.

```typescript
import { call } from "@doeixd/machine";

type MyContext = { count: number };
const increment = function(this: MyContext) { 
  return { count: this.count + 1 }; 
};

const result = call(increment, { count: 5 }); // Returns { count: 6 }

// Particularly useful with generator-based flows:
const result = run(function* (m) {
  m = yield* step(call(m.increment, m.context));
  m = yield* step(call(m.add, m.context, 5));
  return m;
}, counter);
```

#### `bindTransitions<M>(machine)`

Returns a Proxy that automatically binds all transition methods to the machine's context. Eliminates `.call(m.context, ...)` boilerplate entirely.

```typescript
import { bindTransitions } from "@doeixd/machine";

const counter = bindTransitions(createMachine(
  { count: 0 },
  {
    increment(this: { count: number }) {
      return createMachine({ count: this.count + 1 }, this);
    },
    add(this: { count: number }, n: number) {
      return createMachine({ count: this.count + n }, this);
    }
  }
));

// All methods are automatically bound - no need for .call()!
const next = counter.increment(); // Works!
const result = counter.add(5);    // Works!

// Great for generator-based flows:
const result = run(function* (m) {
  m = yield* step(m.increment());     // Clean syntax!
  m = yield* step(m.add(5));          // No .call() needed
  return m;
}, counter);
```

**How it works:**
The Proxy intercepts all property access on the machine. When a property is a function (transition method), it wraps it to automatically call `.apply(machine.context, args)` before invoking. Non-callable properties are returned as-is.

**Note:** The Proxy preserves type safety while providing ergonomic syntax. Use this when writing generator-based flows or any code that frequently calls transitions.

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

### Middleware System

For production-ready state machines with logging, analytics, validation, error handling, and debugging capabilities:

```typescript
import { createMiddleware, withLogging, withValidation, withAnalytics } from "@doeixd/machine";

// Wrap machines with middleware
const instrumented = createMiddleware(machine, {
  before: ({ transitionName, context, args }) => {
    console.log(`→ ${transitionName}`, args);
  },
  after: ({ transitionName, prevContext, nextContext }) => {
    console.log(`✓ ${transitionName}`);
  },
  error: ({ transitionName, error }) => {
    console.error(`✗ ${transitionName}:`, error);
  }
});

// Or use pre-built middleware
const logged = withLogging(machine);
const validated = withValidation(machine, validateFn);
const tracked = withAnalytics(machine, trackEvent);
```

**Features:**
- Type-safe interception layer
- Pre-built middleware for common use cases
- History tracking and time-travel debugging
- Performance monitoring and error reporting
- Composable and configurable

**📖 [Complete Middleware Documentation](./docs/middleware.md)**

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

### Ergonomic & Integration Patterns

For advanced use cases, the library provides optional patterns that offer better ergonomics and deep framework integration. These are available in @doeixd/machine/multi.

**Runner (createRunner):** A stateful controller that wraps a single machine. It provides a stable actions object (runner.actions.increment()) to eliminate the need for manual state reassignment, which is ideal for complex local state.

**Ensemble (createEnsemble / createMultiMachine):** Coordinates multiple independent state machines that share the same context store, like musicians in an orchestra following a shared conductor. Each machine handles its domain (auth, data, UI) while operating on the same global state.

### Managed State with Runner & Ensemble

For stateful applications, `@doeixd/machine/multi` provides two advanced patterns that eliminate constant variable reassignment while maintaining immutability:

#### Runner: Stateful Controller for Local State

The `Runner` wraps an immutable machine in a stateful controller, providing stable `actions` object so you can call transitions imperatively without reassigning the machine variable.

```typescript
import { createRunner } from "@doeixd/machine/multi";

const counterMachine = createCounterMachine({ count: 0 });
const runner = createRunner(counterMachine, (newState) => {
  console.log('Count is now:', newState.context.count);
});

// Call transitions without reassignment - runner updates internally
runner.actions.increment(); // Logs: "Count is now: 1"
runner.actions.add(5);      // Logs: "Count is now: 6"

// Access current state
console.log(runner.context.count); // 6
console.log(runner.state.context.count); // 6 (full machine)

// Type narrowing works
if (runner.state.context.status === 'loggedIn') {
  runner.actions.logout(); // TypeScript knows logout exists
}
```

**Benefits:**
- No more `machine = machine.transition()` reassignment chains
- Stable `actions` object for clean event handling
- Perfect for React hooks, component state, or form handling
- Type-safe state narrowing still works

#### Ensemble: Coordinating Multiple Machines with Shared Context

The `Ensemble` coordinates multiple independent state machines that all operate on the same shared context store, like musicians in an orchestra following a shared conductor. Each machine handles its own domain while reading/writing to the same global state.

```typescript
import { createEnsemble } from "@doeixd/machine/multi";

// Shared application state
type AppState = {
  auth: { status: 'loggedIn' | 'loggedOut'; user?: string };
  data: { status: 'idle' | 'loading' | 'success'; items?: any[] };
  ui: { modal: 'open' | 'closed'; theme: 'light' | 'dark' };
};

const globalStore = {
  getContext: () => appState,
  setContext: (newState) => setAppState(newState)
};

// Auth ensemble - manages auth slice
const authEnsemble = createEnsemble(globalStore, {
  loggedOut: (ctx) => createMachine(ctx, {
    login: (user) => ({ ...ctx, auth: { status: 'loggedIn', user } })
  }),
  loggedIn: (ctx) => createMachine(ctx, {
    logout: () => ({ ...ctx, auth: { status: 'loggedOut' } })
  })
}, (ctx) => ctx.auth.status);

// Data ensemble - manages data slice
const dataEnsemble = createEnsemble(globalStore, {
  idle: (ctx) => createMachine(ctx, {
    fetch: async () => {
      const items = await api.fetch();
      return { ...ctx, data: { status: 'success', items } };
    }
  }),
  loading: (ctx) => createMachine(ctx, { /* ... */ }),
  success: (ctx) => createMachine(ctx, { /* ... */ })
}, (ctx) => ctx.data.status);

// UI ensemble - manages UI slice
const uiEnsemble = createEnsemble(globalStore, {
  closed: (ctx) => createMachine(ctx, {
    open: () => ({ ...ctx, ui: { ...ctx.ui, modal: 'open' } })
  }),
  open: (ctx) => createMachine(ctx, {
    close: () => ({ ...ctx, ui: { ...ctx.ui, modal: 'closed' } })
  })
}, (ctx) => ctx.ui.modal);

// They coordinate through shared state
authEnsemble.actions.login('alice');  // Updates global auth status
dataEnsemble.actions.fetch();         // Reads from same global state
uiEnsemble.actions.showModal();       // Also uses same global state
```

**Perfect for:**
- Coordinating multiple state machines that share context
- Complex applications with independent domains (auth, data, UI, etc.)
- Framework-agnostic state logic that works with React, Solid, Vue, etc.
- Global state orchestration across your entire application
- **Syncing to external libraries/stores** - easy integration with Zustand, Redux, databases, APIs, etc.
- Testing (swap the store for a test stub)

**Analogy**: A musical ensemble. Each musician (machine) plays their part following the same conductor (shared store). Together they create coordinated harmony, where one instrument's change can influence the others.

**Great for External Integration:**
The `StateStore` interface makes it trivial to sync with external systems:

```typescript
// Zustand store integration
import { create } from 'zustand';

const useAppStore = create<AppState>((set, get) => ({
  // ... your Zustand store
}));

const zustandStore = {
  getContext: () => useAppStore.getState(),
  setContext: (newState) => useAppStore.setState(newState)
};

const ensemble = createEnsemble(zustandStore, factories, (ctx) => ctx.status);

// Redux integration
import { store } from './reduxStore';

const reduxStore = {
  getContext: () => store.getState(),
  setContext: (newState) => store.dispatch(setAppState(newState))
};

const ensemble = createEnsemble(reduxStore, factories, (ctx) => ctx.status);

// Database/API integration
const apiStore = {
  getContext: async () => await api.getAppState(),
  setContext: async (newState) => {
    await api.saveAppState(newState);
    // Trigger real-time updates to other clients
    socket.emit('state-changed', newState);
  }
};

const ensemble = createEnsemble(apiStore, factories, (ctx) => ctx.status);

// LocalStorage persistence
const persistentStore = {
  getContext: () => {
    const saved = localStorage.getItem('app-state');
    return saved ? JSON.parse(saved) : defaultState;
  },
  setContext: (newState) => {
    localStorage.setItem('app-state', JSON.stringify(newState));
    return newState;
  }
};

const ensemble = createEnsemble(persistentStore, factories, (ctx) => ctx.status);
```

**Your machine logic stays pure** - just swap the store implementation to change how state is persisted, synchronized, or shared.

##### Deep Dive: Mutable Machine (createMutableMachine)

**The Pattern**: A single stable object whose properties mutate in place.

```typescript
// Single object reference that mutates
const player = createMutableMachine(
  { state: 'idle', hp: 100 },
  factories,
  (ctx) => ctx.state  // Accessor function - refactor-safe
);

// Keep the reference - it will always reflect current state
const playerRef = player;

player.takeDamage(10);
console.log(playerRef.hp); // 90 - same object!
console.log(playerRef === player); // true
```

**How it Works:**
- Uses a JavaScript Proxy to merge context properties with machine methods
- Transitions are pure functions that return the next context (not a new machine)
- When a transition is called, the proxy overwrites the context object's properties in place
- The object reference never changes; properties mutate

**When to Use:**
- Backend services (session management, long-running processes)
- Game development (high-performance loops where allocation matters)
- CLI tools and scripts (orchestrating steps)
- Non-UI environments where a stable reference is critical
- Performance-critical code where garbage collection matters

**Never Use For:**
- React, Solid, Vue, or any reactive UI framework
- Anything where you need state history or time-travel debugging
- Systems where multiple parts read stale references

**Analogy**: A go-kart. Stripped down for performance in a specific environment (the backend). No safety features like immutability, not built for daily-driver complexity, but incredibly direct and efficient on the race track.

#### Class-Based Approach: MultiMachine (createMultiMachine)

For developers who prefer object-oriented patterns, `createMultiMachine` provides a class-based wrapper around the Ensemble pattern.

```typescript
import { createMultiMachine, MultiMachineBase } from "@doeixd/machine/multi";

type CounterContext = { count: number };

class CounterMachine extends MultiMachineBase<CounterContext> {
  increment() {
    this.setContext({ count: this.context.count + 1 });
  }

  add(n: number) {
    this.setContext({ count: this.context.count + n });
  }

  reset() {
    this.setContext({ count: 0 });
  }
}

const store = {
  getContext: () => ({ count: 0 }),
  setContext: (ctx) => { /* update your framework's state */ }
};

const machine = createMultiMachine(CounterMachine, store);

// Direct method calls - feels like traditional OOP
machine.increment();
console.log(machine.count); // 1

machine.add(5);
console.log(machine.count); // 6

machine.reset();
console.log(machine.count); // 0
```

**How it Works:**
- Extend `MultiMachineBase<C>` to define your machine class
- Methods in the class are your transitions
- `this.context` gives read-only access to current state
- `this.setContext()` updates the external store
- `createMultiMachine()` returns a Proxy that merges context properties with class methods

**When to Use:**
- You prefer class-based/OOP patterns
- You want familiar `this` binding and method calls
- Complex machines with lots of state logic (easier to organize in a class)
- Integrating with existing OOP codebases

**Benefits vs. Ensemble:**
- More familiar syntax for OOP developers
- Methods are co-located with state they manage
- Can use class constructors for initialization
- Easier to extend or subclass if needed

**Benefits vs. Runner:**
- For global/shared state (like Ensemble)
- Better code organization for complex machines
- Not limited to immutable snapshots

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

`@doeixd/machine` offers a full suite of React hooks for everything from simple component state to complex, performance-optimized applications.

Get started by importing the hooks:
```typescript
import { useMachine, useMachineSelector } from '@doeixd/machine/react';
```

#### `useMachine` - For Local Component State

This is the primary hook for managing self-contained state within a component. It returns the reactive `machine` instance and a stable `actions` object for triggering transitions, providing an ergonomic and type-safe API.

```tsx
import { useMachine } from "@doeixd/machine/react";
import { createCounterMachine } from "./counterMachine";

function Counter() {
  const [machine, actions] = useMachine(() => createCounterMachine({ count: 0 }));

  return (
    <div>
      <p>Count: {machine.context.count}</p>
      {/* Call transitions directly from the stable actions object */}
      <button onClick={() => actions.increment()}>Increment</button>
      <button onClick={() => actions.add(5)}>Add 5</button>
    </div>
  );
}
```

#### `useMachineSelector` - For Performance

To prevent unnecessary re-renders in components that only care about a small part of a large machine's state, use `useMachineSelector`. It subscribes a component to a specific slice of the state, and only triggers a re-render when that slice changes.

```tsx
function UserNameDisplay({ machine }) {
  // This component will NOT re-render if other parts of the machine's
  // context (e.g., user settings) change.
  const userName = useMachineSelector(machine, (m) => m.context.user.name);

  return <p>User: {userName}</p>;
}
```

#### `createMachineContext` - For Sharing State

To avoid passing your machine and actions through many layers of props ("prop-drilling"), `createMachineContext` provides a typed Context `Provider` and consumer hooks to share state across your component tree.

```tsx
import { createMachineContext, useMachine } from "@doeixd/machine/react";

// 1. Create the context
const { Provider, useSelector, useMachineActions } = createMachineContext<AuthMachine>();

// 2. Provide the machine in your root component
function App() {
  const [machine, actions] = useMachine(() => createAuthMachine());
  return (
    <Provider machine={machine} actions={actions}>
      <Header />
    </Provider>
  );
}

// 3. Consume it in any child component
function Header() {
  const status = useSelector(m => m.context.status);
  const actions = useMachineActions();

  return (
    <header>
      {status === 'loggedIn' ? (
        <button onClick={() => actions.logout()}>Logout</button>
      ) : (
        <button onClick={() => actions.login('user', 'pass')}>Login</button>
      )}
    </header>
  );
}
```

#### `useEnsemble` - For Advanced Integration

For maximum testability and portability, `useEnsemble` decouples your pure, framework-agnostic state logic from React's state management. Your machine logic becomes fully portable, and React's `useState` simply acts as the "state store" for the ensemble.

```tsx
import { useEnsemble } from "@doeixd/machine/react";
import { fetchFactories } from "./fetchFactories"; // Pure, framework-agnostic logic

function DataFetcher() {
  const ensemble = useEnsemble(
    { status: 'idle', data: null }, // Initial context
    fetchFactories, // Your pure machine factories
    (ctx) => ctx.status // Discriminant function
  );

  return (
    <div>
      <p>Status: {ensemble.context.status}</p>
      {ensemble.context.status === 'idle' && (
        <button onClick={() => ensemble.actions.fetch('/api/data')}>
          Fetch
        </button>
      )}
    </div>
  );
}
```

#### Which Hook Should I Use?

| Hook | Best For | Key Feature |
| :--- | :--- | :--- |
| **`useMachine`** | **Local component state** | The simplest way to get started. Ergonomic `[machine, actions]` API. |
| **`useMachineSelector`** | **Performance optimization** | Prevents re-renders by subscribing to slices of state. |
| **`createMachineContext`** | **Sharing state / DI** | Avoids prop-drilling a machine through the component tree. |
| **`useEnsemble`** | **Complex or shared state** | Decouples business logic from React for maximum portability and testability. |

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

## 📊 Statechart Extraction & Visualization

**NEW**: Generate formal statechart definitions from your TypeScript machines for visualization and documentation.

### Overview

The statechart extraction system performs build-time static analysis to generate [XState](https://xstate.js.org/)-compatible JSON from your type-safe machines. This enables:

- 🎨 **Visualization** in [Stately Viz](https://stately.ai/viz) and other tools
- 📖 **Documentation** with auto-generated state diagrams
- ✅ **Formal verification** using XState tooling
- 🔄 **Team communication** via visual state charts

### Quick Example

**1. Annotate your machines with metadata:**

```typescript
import { MachineBase } from '@doeixd/machine';
import { transitionTo, describe, action, guarded } from '@doeixd/machine/primitives';

class LoggedOut extends MachineBase<{ status: 'loggedOut' }> {
  login = describe(
    "Start the login process",
    action(
      { name: "logAttempt", description: "Track login attempts" },
      transitionTo(LoggingIn, (username: string) => new LoggingIn({ username }))
    )
  );
}

class LoggingIn extends MachineBase<{ status: 'loggingIn'; username: string }> {
  success = transitionTo(LoggedIn, (token: string) => new LoggedIn({ token }));
  failure = transitionTo(LoggedOut, () => new LoggedOut());
}

class LoggedIn extends MachineBase<{ status: 'loggedIn'; token: string }> {
  logout = describe(
    "Log out and clear session",
    action(
      { name: "clearSession" },
      transitionTo(LoggedOut, () => new LoggedOut())
    )
  );

  deleteAccount = guarded(
    { name: "isAdmin", description: "Only admins can delete accounts" },
    transitionTo(LoggedOut, () => new LoggedOut())
  );
}
```

**2. Create extraction config (`.statechart.config.ts`):**

```typescript
import type { ExtractionConfig } from '@doeixd/machine';

export default {
  machines: [{
    input: 'src/auth.ts',
    classes: ['LoggedOut', 'LoggingIn', 'LoggedIn'],
    output: 'statecharts/auth.json',
    id: 'auth',
    initialState: 'LoggedOut'
  }],
  verbose: true
} satisfies ExtractionConfig;
```

**3. Run extraction:**

```bash
npm run extract
```

**4. Generated output (`statecharts/auth.json`):**

```json
{
  "id": "auth",
  "initial": "LoggedOut",
  "states": {
    "LoggedOut": {
      "on": {
        "login": {
          "target": "LoggingIn",
          "description": "Start the login process",
          "actions": ["logAttempt"]
        }
      }
    },
    "LoggingIn": {
      "on": {
        "success": { "target": "LoggedIn" },
        "failure": { "target": "LoggedOut" }
      }
    },
    "LoggedIn": {
      "on": {
        "logout": {
          "target": "LoggedOut",
          "description": "Log out and clear session",
          "actions": ["clearSession"]
        },
        "deleteAccount": {
          "target": "LoggedOut",
          "cond": "isAdmin"
        }
      }
    }
  }
}
```

**5. Visualize in [Stately Viz](https://stately.ai/viz):**

Paste the JSON into Stately Viz to see your state machine as an interactive diagram!

### Metadata Primitives

The extraction system recognizes these annotation primitives:

| Primitive | Purpose | Extracted As |
|-----------|---------|--------------|
| `transitionTo(Target, impl)` | Declare target state | `"target": "TargetClass"` |
| `describe(text, transition)` | Add description | `"description": "..."` |
| `guarded(guard, transition)` | Add guard condition | `"cond": "guardName"` |
| `action(action, transition)` | Add side effect | `"actions": ["actionName"]` |
| `invoke(service, impl)` | Async service | `"invoke": [...]` |

**All primitives are identity functions** - they have **zero runtime overhead**. They exist purely for:
1. Type-level documentation
2. Build-time extraction
3. IDE autocomplete

### CLI Usage

```bash
# Extract from config
npx tsx scripts/extract-statechart.ts --config .statechart.config.ts

# Extract single machine
npx tsx scripts/extract-statechart.ts \
  --input src/machine.ts \
  --id myMachine \
  --classes State1,State2 \
  --initial State1

# Watch mode
npx tsx scripts/extract-statechart.ts --config .statechart.config.ts --watch

# With validation
npx tsx scripts/extract-statechart.ts --config .statechart.config.ts --validate
```

### npm Scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "extract": "tsx scripts/extract-statechart.ts --config .statechart.config.ts",
    "extract:watch": "tsx scripts/extract-statechart.ts --config .statechart.config.ts --watch"
  }
}
```

### How It Works

The extraction system uses **AST-based static analysis**:

1. **Parse TypeScript source** using ts-morph (TypeScript Compiler API)
2. **Find DSL primitive calls** in class property initializers
3. **Extract literal arguments** from the Abstract Syntax Tree
4. **Resolve class name identifiers** to target states
5. **Generate XState-compatible JSON** with full metadata

**Why AST-based?** TypeScript's type system resolves generic parameters in branded types (`WithMeta<F, M>`) as constraints rather than concrete values. AST parsing reads the actual source code, bypassing type system limitations. This is the same approach used by XState's extraction tooling.

### Static Extraction API (Build-Time)

```typescript
import { extractMachine, extractMachines } from '@doeixd/machine';
import { Project } from 'ts-morph';

// Extract single machine
const project = new Project();
project.addSourceFilesAtPaths('src/**/*.ts');

const chart = extractMachine({
  input: 'src/auth.ts',
  classes: ['LoggedOut', 'LoggedIn'],
  id: 'auth',
  initialState: 'LoggedOut'
}, project);

console.log(JSON.stringify(chart, null, 2));

// Extract multiple machines
const charts = extractMachines({
  machines: [
    { input: 'src/auth.ts', classes: [...], id: 'auth', initialState: 'LoggedOut' },
    { input: 'src/fetch.ts', classes: [...], id: 'fetch', initialState: 'Idle' }
  ],
  verbose: true
});
```

### Advanced Patterns: Hierarchical and Parallel Machines

**NEW**: The extractor now supports advanced state machine patterns for complex systems.

#### Hierarchical (Nested States)

Model parent states containing child states:

```typescript
const config: MachineConfig = {
  input: 'src/dashboard.ts',
  classes: ['Dashboard', 'ErrorState'],
  id: 'dashboard',
  initialState: 'Dashboard',
  children: {
    contextProperty: 'child',
    initialState: 'ViewingMachine',
    classes: ['ViewingMachine', 'EditingMachine']
  }
};
```

Generates:

```json
{
  "id": "dashboard",
  "initial": "Dashboard",
  "states": {
    "Dashboard": {
      "initial": "ViewingMachine",
      "states": {
        "ViewingMachine": { "on": { /* ... */ } },
        "EditingMachine": { "on": { /* ... */ } }
      }
    }
  }
}
```

#### Parallel (Orthogonal Regions)

Model independent regions that evolve simultaneously:

```typescript
const config: MachineConfig = {
  input: 'src/editor.ts',
  id: 'editor',
  parallel: {
    regions: [
      {
        name: 'fontWeight',
        initialState: 'Normal',
        classes: ['Normal', 'Bold']
      },
      {
        name: 'textDecoration',
        initialState: 'None',
        classes: ['None', 'Underline']
      }
    ]
  }
};
```

Generates:

```json
{
  "id": "editor",
  "type": "parallel",
  "states": {
    "fontWeight": {
      "initial": "Normal",
      "states": {
        "Normal": { "on": { /* ... */ } },
        "Bold": { "on": { /* ... */ } }
      }
    },
    "textDecoration": {
      "initial": "None",
      "states": {
        "None": { "on": { /* ... */ } },
        "Underline": { "on": { /* ... */ } }
      }
    }
  }
}
```

**See [docs/ADVANCED_EXTRACTION.md](./docs/ADVANCED_EXTRACTION.md) for complete guide.**

### Runtime Extraction API

Extract statecharts from **running machine instances** without requiring source code access:

```typescript
import { generateStatechart, extractFromInstance } from '@doeixd/machine';

// Create machine instances (annotated with DSL primitives)
const loggedOutMachine = new LoggedOut({ status: 'loggedOut' });
const loggedInMachine = new LoggedIn({ status: 'loggedIn', token: 'abc' });

// Generate complete statechart from multiple states
const chart = generateStatechart({
  LoggedOut: loggedOutMachine,
  LoggedIn: loggedInMachine
}, {
  id: 'auth',
  initial: 'LoggedOut'
});

// Or extract from a single instance
const singleChart = extractFromInstance(loggedOutMachine, {
  id: 'auth',
  stateName: 'LoggedOut'
});
```

**Use cases:**
- 🐛 Debug production machines without source access
- 🌐 Extract statecharts in browser DevTools
- 🧪 Generate diagrams from test instances
- 📦 Work with dynamically created machines

The DSL primitives (`transitionTo`, `describe`, etc.) attach metadata at runtime via non-enumerable Symbols with zero performance overhead.

### Full Documentation

For comprehensive documentation including:
- Type-level metadata DSL reference
- Configuration options
- Limitations and gotchas
- Troubleshooting guide
- Advanced usage patterns

See **[docs/statechart-extraction.md](./docs/statechart-extraction.md)**

### Examples

Complete annotated examples in the `examples/` directory:
- [`examples/authMachine.ts`](./examples/authMachine.ts) - Authentication flow with guards and actions
- [`examples/fetchMachine.ts`](./examples/fetchMachine.ts) - Data fetching with invoke services
- [`examples/formMachine.ts`](./examples/formMachine.ts) - Multi-step wizard
- [`examples/trafficLightMachine.ts`](./examples/trafficLightMachine.ts) - Simple cyclic machine

## Philosophy & Design Principles

### 1. Type-State Programming First

**Type-State Programming is the heart of this library.** The type system itself represents your state machine:

- **States are types**, not strings or enums
- **Invalid transitions are compile errors**, not runtime exceptions
- **TypeScript is your safety net** - bugs are caught during development
- **The compiler guides you** - autocomplete shows only valid transitions

This isn't just a feature—it's the fundamental way you should think about state machines in TypeScript. Make illegal states unrepresentable.

### 2. Minimal Primitives

The core library provides one true primitive: the pure, immutable Machine. Everything else is built on this foundation. To handle real-world complexity, we provide optional factories (createRunner, createEnsemble) that compose this primitive into different operational patterns. This keeps the core minimal while providing powerful, opt-in capabilities for ergonomics and framework integration.

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

// Transition Binding
call<C, F>(fn: F, context: C, ...args): ReturnType<F>
bindTransitions<M extends Machine<any>>(machine: M): M

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

### Multi Module (Stateful Controllers & Framework Integration)

**Import:** `import { ... } from "@doeixd/machine/multi"`

#### Types

```typescript
// Stateful controller for a single machine
type Runner<M extends Machine<any>> = {
  readonly state: M;
  readonly context: Context<M>;
  readonly actions: BoundTransitions<M>;
  setState(newState: M): void;
};

// Mapped type: all transition methods pre-bound to update a Runner
type BoundTransitions<M extends Machine<any>> = {
  [K in TransitionNames<M>]: (...args: TransitionArgs<M, K>) => ReturnType<M[K]>;
};

// External state storage interface for Ensemble
interface StateStore<C extends object> {
  getContext: () => C;
  setContext: (newContext: C) => void;
}

// Orchestration engine for global state
type Ensemble<AllMachines extends Machine<any>, C extends object> = {
  readonly context: C;
  readonly state: AllMachines;
  readonly actions: AllTransitions<AllMachines>;
};
```

#### Functions

```typescript
// Create a stateful wrapper for local state management
createRunner<M extends Machine<any>>(
  initialMachine: M,
  onChange?: (newState: M) => void
): Runner<M>

// Create an ensemble for framework-agnostic global state orchestration
createEnsemble<
  C extends object,
  F extends Record<string, (context: C) => Machine<C>>
>(
  store: StateStore<C>,
  factories: F,
  getDiscriminant: (context: C) => keyof F  // Accessor function - refactor-safe
): Ensemble<ReturnType<F[keyof F]>, C>

// Execute a generator workflow with a Runner
runWithRunner<M extends Machine<any>, T>(
  flow: (runner: Runner<M>) => Generator<any, T, any>,
  initialMachine: M
): T

// Execute a generator workflow with an Ensemble
runWithEnsemble<AllMachines extends Machine<any>, C extends object, T>(
  flow: (ensemble: Ensemble<AllMachines, C>) => Generator<any, T, any>,
  ensemble: Ensemble<AllMachines, C>
): T

// Create a mutable machine (EXPERIMENTAL - use with caution)
createMutableMachine<
  C extends object,
  F extends Record<string, (context: C) => Machine<C>>
>(
  sharedContext: C,
  factories: F,
  getDiscriminant: (context: C) => keyof F  // Accessor function - refactor-safe
): MutableMachine<C, ReturnType<F[keyof F]>>
```

#### Additional Types (Multi Module)

```typescript
// Mutable machine combining context and transitions (EXPERIMENTAL)
type MutableMachine<C extends object, AllMachines extends Machine<any>> = C &
  AllTransitions<AllMachines>;

// Base class for MultiMachine OOP approach
abstract class MultiMachineBase<C extends object> {
  protected store: StateStore<C>;
  protected get context(): C;
  protected setContext(newContext: C): void;
}
```

#### Additional Functions (Multi Module)

```typescript
// Create a class-based MultiMachine instance
createMultiMachine<C extends object, T extends MultiMachineBase<C>>(
  MachineClass: new (store: StateStore<C>) => T,
  store: StateStore<C>,
  getDiscriminant?: (context: C) => string  // Optional accessor function - refactor-safe
): C & T
```

## License

MIT

## Contributing

Contributions welcome! This library aims to stay minimal while providing a solid foundation. When proposing features, consider whether they belong in the core or as a separate extension package.
