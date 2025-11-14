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


// // Define the two distinct machine shapes (our "states")
// type LoggedOutMachine = Machine<{ status: "loggedOut" }> & {
//   login: (username: string) => LoggedInMachine;
// };

// type LoggedInMachine = Machine<{ status: "loggedIn"; username: string }> & {
//   logout: () => LoggedOutMachine;
//   viewProfile: () => LoggedInMachine;
// };

// // State 1: Logged Out
// const createLoggedOutMachine = (): LoggedOutMachine => {
//   return createMachine(
//     { status: "loggedOut" },
//     {
//       login: function (username: string): LoggedInMachine {
//         // We transition by returning a completely different machine type
//         return createLoggedInMachine(username);
//       },
//     }
//   );
// };

// // State 2: Logged In
// const createLoggedInMachine = (username: string): LoggedInMachine => {
//   return createMachine(
//     { status: "loggedIn", username },
//     {
//       logout: function (): LoggedOutMachine {
//         return createLoggedOutMachine();
//       },
//       viewProfile: function (): LoggedInMachine {
//         console.log(`Viewing profile for ${this.username}`);
//         return this; // Or create a new instance
//       },
//     }
//   );
// };

// // --- Usage ---
// const machine = createLoggedOutMachine();

// // machine.logout(); // -> TypeScript Error! Property 'logout' does not exist on type 'LoggedOutMachine'.

// const loggedInState = machine.login("Alice");
// console.log(loggedInState.context); // { status: "loggedIn", username: "Alice" }

// // loggedInState.login("Bob"); // -> TypeScript Error! Property 'login' does not exist on type 'LoggedInMachine'.

// const loggedOutState = loggedInState.logout();
// console.log(loggedOutState.context); // { status: "loggedOut" }


Advanced Usage: The Machine Factory
While createMachine and MachineBase are great, they involve some repetitive boilerplate: you always have to return a new machine instance (createMachine(...) or new MyClass(...)). For a more functional style that focuses purely on the state transformation, you can use the createMachineFactory utility.
It's a higher-order function that separates the what from the how:
What is the shape of my state? (Define the context type C).
How does my state change? (Provide pure transition logic functions).
Give me an instance with an initial state.
This allows you to write transitions as simple, pure functions: (context, ...args) => newContext.
Example
Let's refactor the counter example using the factory.
Before (with createMachine):
code
TypeScript
const counter = createMachine(
  { count: 0 },
  {
    increment: function () {
      return createMachine({ count: this.count + 1 }, this);
    },
    add: function (n: number) {
      return createMachine({ count: this.count + n }, this);
    },
  }
);
After (with createMachineFactory):
code
TypeScript
import { createMachineFactory } from "@doeixd/machine";

// 1. Specify the context type and define the transition logic.
//    Notice the functions just return the new context object.
const counterFactory = createMachineFactory<{ count: number }>()({
  increment: (ctx) => ({ count: ctx.count + 1 }),
  add: (ctx, n: number) => ({ count: ctx.count + n }),
});

// 2. Use the factory to create a machine instance with an initial context.
const counter = counterFactory({ count: 0 });

// The resulting machine is fully typed and works just like before.
console.log(counter.context.count); // 0

const next = counter.increment();
console.log(next.context.count); // 1

const final = next.add(10);
console.log(final.context.count); // 11
The factory pattern is a powerful way to keep your state transition logic clean, focused, and highly testable, as the logic functions have no dependency on the machine structure itself.

The Machine Factory (createMachineFactory)
... (previous section remains here) ...
Creating Machines from a Template (createMachineBuilder)
Another powerful pattern is creating a "builder" from an existing machine instance. The createMachineBuilder utility is designed for this. It takes a template machine, captures its behavior (its methods), and gives you back a factory function. This factory can then produce new machines of the same type, each with a different initial context.
This is especially useful when working with classes. Instead of calling new MyClass(...) everywhere, you can create a single builder and reuse it.
Use Case: You have a User machine and want to create multiple User instances from an API response.
code
TypeScript
import { MachineBase, createMachineBuilder, Context } from "@doeixd/machine";

// First, define our class-based machine.
// Note: for this to work, the transition methods should use the builder
//       to create the next state, promoting reusability.
class User extends MachineBase<{ id: number; name: string; status: string }> {
  // The constructor is only called once for the template.
  constructor(context: Context<User>) {
    super(context);
  }

  rename(newName: string) {
    // Use the builder to create the next state
    return buildUser({ ...this.context, name: newName });
  }

  activate() {
    return buildUser({ ...this.context, status: 'active' });
  }
}

// 1. Create a single "template" instance. Its context doesn't matter much.
const userTemplate = new User({ id: 0, name: "", status: "inactive" });

// 2. Create a builder from this template.
const buildUser = createMachineBuilder(userTemplate);

// 3. Now, use the builder to stamp out new instances with real data.
const apiResponses = [
  { id: 101, name: "Alice" },
  { id: 102, name: "Bob" },
];

const users = apiResponses.map(data =>
  buildUser({ ...data, status: "inactive" })
);

// Each instance is a full, independent 'User' machine.
const activeAlice = users[0].activate();

console.log(users[1].context.name);      // "Bob"
console.log(activeAlice.context.status); // "active"
console.log(activeAlice.context.name);   // "Alice"
The createMachineBuilder utility helps you adhere to the DRY (Don't Repeat Yourself) principle by separating the definition of a machine's behavior from the instantiation of its state.

Advanced Usage
... (previous sections on factories and builders remain here) ...
Overriding and Decorating Transitions (overrideTransitions)
Sometimes you need to alter the behavior of an existing machine without modifying its original definition. This is common in testing (mocking) or when you want to wrap a transition with extra logic like logging (decoration). The overrideTransitions utility is designed for this.
It takes a machine and an object of new transitions, returning a new machine with those transitions merged in. The original machine is not mutated.
Example 1: Mocking for a Test
Imagine you want to test a UI component that uses a counter machine, but you want to force the increment transition to always return a specific state.
code
TypeScript
const counter = createMachine({ count: 0 }, {
  increment: function() { return createMachine({ count: this.count + 1 }, this) }
});

// Create a mocked version for our test
const mockedCounter = overrideTransitions(counter, {
  increment: function() {
    // This mocked version always returns a count of 99
    console.log("Mocked increment was called!");
    return createMachine({ count: 99 }, this);
  }
});

const nextState = mockedCounter.increment();
// Logs: "Mocked increment was called!"
console.log(nextState.context.count); // 99
Example 2: Adding and Decorating Transitions
You can also add new functionality or wrap existing methods. The return type will be perfectly inferred by TypeScript.
code
TypeScript
const counter = createMachine({ count: 0 }, {
  increment: function() { return createMachine({ count: this.count + 1 }, this) }
});

const decoratedCounter = overrideTransitions(counter, {
  // Decorate the existing 'increment' method
  increment: function(...args) {
    console.log(`Before increment: ${this.count}`);
    // IMPORTANT: Call the method on the original 'counter' to get original behavior
    const nextMachine = counter.increment.apply(this, args);
    console.log(`After increment: ${nextMachine.context.count}`);
    return nextMachine;
  },
  // Add a brand new 'reset' method
  reset: function() {
    return createMachine({ count: 0 }, this);
  }
});

// The new machine has both the decorated 'increment' and the new 'reset'
const s1 = decoratedCounter.increment(); // Logs before and after messages
const s2 = s1.reset();

// decoratedCounter.decrement(); // -> TypeScript Error! 'decrement' does not exist.

console.log(s2.context.count); // 0

Advanced Usage: A Suite of Immutable Helpers
This library includes a set of powerful, type-safe utility functions for immutably manipulating machines. These helpers allow you to treat machines as data that you can transform, combine, and extend.
... (previous sections on factories, builders, and overrides remain here) ...
Updating Context (setContext)
The most common operation is changing a machine's state. The setContext helper provides a clean and predictable way to do this. It returns a new machine of the exact same type, but with an updated context.
It can be used inside a transition or as an external "setter" function.
code
TypeScript
import { createMachine, setContext } from "@doeixd/machine";

const counter = createMachine({ count: 0 }, {
  increment: function() {
    // Use setContext with an updater function for the transition
    return setContext(this, (ctx) => ({ count: ctx.count + 1 }));
  }
});

const s1 = counter.increment(); // s1.context is { count: 1 }

// Use setContext with a direct value to reset the machine from the outside
const s2 = setContext(s1, { count: 0 }); // s2.context is { count: 0 }
Extending with New Transitions (extendTransitions)
If you want to add new capabilities to a machine without changing its existing ones, use extendTransitions. This is different from overrideTransitions because it will give you a compile-time error if you try to add a transition that already exists, preventing accidental overrides.
This is perfect for composing functionality or adding features in a safe, non-destructive way.
code
TypeScript
const baseMachine = createMachine({ text: "" }, {
  clear: function() {
    return setContext(this, { text: "" });
  }
});

const withLogging = extendTransitions(baseMachine, {
  // Add a new 'log' method
  log: function() {
    console.log("Current text:", this.text);
    return this; // Return the same machine instance
  }
});

const withAppend = extendTransitions(withLogging, {
  // Add an 'append' method
  append: function(str: string) {
    return setContext(this, (ctx) => ({ text: ctx.text + str }));
  }
});

// The final machine has all three transitions
const finalMachine = withAppend
  .append("hello")
  .append(" world")
  .log(); // Logs "Current text: hello world"

// This would fail to compile:
// extendTransitions(baseMachine, {
//   clear: function() { ... } // TypeScript Error! Property 'clear' already exists.
// });