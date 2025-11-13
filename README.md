# @doeixd/machine

A tiny, immutable, and type-safe state machine library for TypeScript.

This library provides a simple, function-oriented way to manage state. Instead of a large configuration object or a complex DSL, you model states and transitions using plain functions and TypeScript's type system itself.

## Philosophy & Core Concepts

When I built this, I wanted a state management tool that felt native to TypeScript and embraced a functional, immutable approach. The core ideas are:

1.  **Immutability is King**: Every transition is a pure function that receives a context and returns a *brand new machine* with the updated state. This makes state changes predictable, easy to debug, and prevents a whole class of side-effect bugs.

2.  **Type-Safe by Design**: This library is built from the ground up to leverage TypeScript. The most powerful feature is using the type system to represent *finite states*, ensuring you can't call invalid transitions at compile time. We'll explore this in the "Type-State Programming" example below.

3.  **Simplicity & Minimalism**: The API is tiny. You primarily need `createMachine` and `runMachine`. There are no hidden concepts or complex lifecycles. What you see is what you get.

4.  **Functions as Transitions**: Transitions are just methods on your machine object. This feels natural in JavaScript (`machine.doSomething()`) and provides excellent autocompletion and type-inference out of the box.

## Installation

```bash
npm install @doeixd/machine
# or
yarn add @doeixd/machine
```

## Basic Usage

Let's start with a simple counter. Here, the "state" is just the data in the `context`.

```typescript
import { createMachine, Machine } from "@doeixd/machine";

// Define the shape of our machine's context
interface CounterContext {
  count: number;
}

// Create the machine instance
const counter = createMachine(
  { count: 0 }, // The initial context
  {
    // Transitions are methods. `this` is bound to the context.
    increment: function (): Machine<CounterContext> {
      // Return a *new* machine with the updated context
      return createMachine({ count: this.count + 1 }, this);
    },
    decrement: function (): Machine<CounterContext> {
      return createMachine({ count: this.count - 1 }, this);
    },
    add: function (n: number): Machine<CounterContext> {
      return createMachine({ count: this.count + n }, this);
    },
  }
);

console.log(counter.context.count); // 0

const nextState = counter.increment();
console.log(nextState.context.count); // 1

const finalState = nextState.add(5);
console.log(finalState.context.count); // 6

// The original machine is untouched
console.log(counter.context.count); // 0
```

## Finite States with Type-State Programming

Here's the real power of this library. Instead of just changing the `context`, a transition can return a completely different *type* of machine, with different methods available. This lets you model finite states with compile-time guarantees.

Let's model a user authentication flow.

```typescript
import { createMachine, Machine } from "@doeixd/machine";

// First, define the types for our two distinct states.
// Notice they have different methods.

type LoggedOutMachine = Machine<{ status: "loggedOut" }> & {
  login: (username: string) => LoggedInMachine;
};

type LoggedInMachine = Machine<{ status: "loggedIn"; username: string }> & {
  logout: () => LoggedOutMachine;
};

// Next, create functions to build each state machine.

const createLoggedOutMachine = (): LoggedOutMachine => {
  return createMachine(
    { status: "loggedOut" },
    {
      login: function (username: string): LoggedInMachine {
        // This transition returns a completely different machine type!
        return createLoggedInMachine(username);
      },
    }
  );
};

const createLoggedInMachine = (username: string): LoggedInMachine => {
  return createMachine(
    { status: "loggedIn", username },
    {
      logout: function (): LoggedOutMachine {
        return createLoggedOutMachine();
      },
    }
  );
};

// --- Let's use it! ---

const machine = createLoggedOutMachine();

// machine.logout();
// ^^^^
// COMPILE-TIME ERROR!
// Property 'logout' does not exist on type 'LoggedOutMachine'.

const loggedInState = machine.login("ada");
console.log(loggedInState.context); // { status: 'loggedIn', username: 'ada' }

// loggedInState.login("grace");
// ^^^^
// COMPILE-TIME ERROR!
// Property 'login' does not exist on type 'LoggedInMachine'.

const loggedOutState = loggedInState.logout();
console.log(loggedOutState.context); // { status: 'loggedOut' }
```
This pattern makes invalid state transitions impossible to write, because the TypeScript compiler will catch them.

## Asynchronous Machines & The Runner

For handling side effects like API calls, you can use `createAsyncMachine`. The transition functions can be `async` and return a `Promise` that resolves to the next machine state. To manage this, we use the `runMachine` helper.

```typescript
import { createAsyncMachine, runMachine, AsyncMachine, Event } from "@doeixd/machine";

// This helper type generates a union of all possible events
type UserMachine = ReturnType<typeof createFetchingMachine>;
type UserEvent = Event<UserMachine>;

const createFetchingMachine = () => {
  return createAsyncMachine(
    { status: "idle", user: null as { name: string } | null },
    {
      async fetchUser(id: number) {
        // Transition to a loading state immediately
        const loadingMachine = createAsyncMachine({ status: "loading", user: null }, this);

        try {
          // Simulate a network request
          const res = await new Promise<{ name: string }>(resolve =>
            setTimeout(() => resolve({ name: `User ${id}` }), 1000)
          );
          // On success, transition to the success state
          return createAsyncMachine({ status: "success", user: res }, this);
        } catch (error) {
          // On failure, transition to the error state
          return createAsyncMachine({ status: "error", user: null }, this);
        }
      },
    }
  );
};

// The runner manages the current state for you
const runner = runMachine(createFetchingMachine(), (machine) => {
  console.log("State changed to:", machine.context);
});

console.log("Initial state:", runner.state);

// Dispatch is type-safe. It knows 'fetchUser' needs a number[].
runner.dispatch({ type: "fetchUser", args: [123] });

// Console output:
// > Initial state: { status: 'idle', user: null }
// > (after 1 second)
// > State changed to: { status: 'success', user: { name: 'User 123' } }
```

## Comparison with Other Libraries

#### vs. XState

XState is a fantastic, powerful library that fully implements the Statecharts formalism. It's the right choice for complex, application-wide logic that benefits from formal concepts like nested states, parallel states, history, and actors.

-   **Paradigm**: XState is **declarative**. You define your entire machine logic in a large configuration object. `@doeixd/machine` is **imperative**. You call methods directly on the machine object to trigger transitions.
-   **State Definition**: In XState, states are defined by string keys in the config (`'loading'`). Here, states can be defined by the entire *type signature* of the machine object, enforced by the compiler.
-   **Complexity**: XState has a steeper learning curve but handles much more complex scenarios. `@doeixd/machine` is minimal and designed for component-level or moderately complex state where you want maximum type safety with less boilerplate.

#### vs. Robot3

Robot3 is closer in spirit, also being a minimal, functional-style library.

-   **API Design**: Robot3's API is centered around `createMachine` with guards and reducers inside the configuration. `@doeixd/machine` places the transition logic in methods directly on the returned object.
-   **Type-State**: While Robot3 has good TypeScript support, the "Type-State Programming" pattern shown above is a more central and ergonomic feature of `@doeixd/machine`, as returning a machine with a completely new shape is the primary way to model finite states.

Choose `@doeixd/machine` if you:
-   Love leveraging the TypeScript type system to enforce correctness.
-   Prefer an imperative, method-calling style (`machine.action()`) over a message-passing one (`send('ACTION')`).
-   Want a minimal, dependency-free tool that doesn't require learning a complex DSL.




import { createAsyncMachine, runMachine, Event } from "@doeixd/machine";

const createFetcher = (id: number) => {
  return createAsyncMachine(
    { status: "idle", user: null as { name: string } | null },
    {
      async fetch() {
        // The effect is just an async function.
        // You can interpret its result to produce the next state.
        try {
          const res = await fetchUserApi(id);
          return createAsyncMachine({ status: "success", user: res }, this);
        } catch (error) {
          return createAsyncMachine({ status: "error", user: null }, this);
        }
      },
    }
  );
};

// The runner manages the current state
const runner = runMachine(createFetcher(123), (machine) => {
  console.log("State changed to:", machine.context);
});

// Dispatch is type-safe. It knows 'fetch' takes no arguments.
runner.dispatch({ type: "fetch", args: [] });