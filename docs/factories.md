# A Guide to Machine Factories: Reusable, Configurable State Logic

Factories are one of the most powerful patterns in `@doeixd/machine`. They allow you to elevate your state logic from single-use objects into reusable, configurable, and type-safe building blocks. Mastering them is key to building scalable and maintainable applications.

This guide will walk you through everything you need to know, from the absolute basics to advanced composition.

### Table of Contents
1.  [The Problem: Why Do We Need Factories?](#the-problem-why-do-we-need-factories)
2.  [Your First Custom Factory: The Basics](#your-first-custom-factory-the-basics)
3.  [Factories and the Type-State Paradigm](#factories-and-the-type-state-paradigm)
4.  [The Built-in Toolkit: `createMachineFactory` and `createMachineBuilder`](#the-built-in-toolkit-createmachinefactory-and-createmachinebuilder)
    -   [Declarative Logic with `createMachineFactory`](#declarative-logic-with-createmachinefactory)
    -   [Class-based Logic with `createMachineBuilder`](#class-based-logic-with-createmachinebuilder)
5.  [Advanced Patterns: Building a Library of Machines](#advanced-patterns-building-a-library-of-machines)
    -   [Higher-Order Factories: The "Plug-in" Pattern](#higher-order-factories-the-plug-in-pattern)
    -   [Partial Application: Creating Specialized Factories](#partial-application-creating-specialized-factories)
6.  [Summary: Which Factory to Use?](#summary-which-factory-to-use)

<br />

## The Problem: Why Do We Need Factories?

Imagine you're building a UI with several counter components. Without a factory, you might write this:

```typescript
// Don't do this!
import { createMachine } from '@doeixd/machine';

const counter1 = createMachine({ count: 0 }, (next) => ({
  increment() { return next({ count: this.context.count + 1 }); }
}));

const counter2 = createMachine({ count: 10 }, (next) => ({
  increment() { return next({ count: this.context.count + 1 }); }
}));
```

You've just duplicated the transition logic. This is not maintainable. A **factory** solves this by abstracting the creation logic into a reusable function, just like a cookie cutter lets you make many cookies from the same design.

<br />

## Your First Custom Factory: The Basics

At its heart, a factory is just a function that returns a machine. Let's fix the example above.

#### Step 1: Define the Reusable Transitions
First, define the behavior of your machine. Since this logic will be reused, we can define it once.

```typescript
// With functional builder, transitions are defined inline
// The factory pattern handles the reusable logic
```

#### Step 2: Create the Factory Function
Now, wrap the machine creation in a function. This function can take arguments to configure the initial state.

```typescript
import { createMachine } from '@doeixd/machine';

export function createCounterMachine(initialContext: { count: number } = { count: 0 }) {
  // createMachine combines the initial state with the shared behavior.
  return createMachine(initialContext, (next) => ({
    increment() {
      return createCounterMachine({ count: this.context.count + 1 });
    },
    add(n: number) {
      return createCounterMachine({ count: this.context.count + n });
    }
  }));
}
```

#### Step 3: Use Your Factory!
Now you have a clean, reusable, and configurable way to create counters.

```typescript
const counterA = createCounterMachine();        // Starts with { count: 0 }
const counterB = createCounterMachine({ count: 100 }); // Starts with { count: 100 }

const nextA = counterA.increment();
console.log(nextA.context.count); // 1

const nextB = counterB.add(50);
console.log(nextB.context.count); // 150
```
**The key benefits here are:**
-   **DRY (Don't Repeat Yourself):** The transition logic is defined in only one place.
-   **Configuration:** You can easily create instances with different starting states.
-   **Encapsulation:** The details of how a counter is constructed are hidden behind a simple function call.

<br />

## Factories and the Type-State Paradigm

Factories are **essential** when using the Type-State paradigm. Since each state is a different class or type, you need a factory for each state to handle its creation. The transitions in one state will call the factory for the next state.

Let's look at the classic `LoggedIn` / `LoggedOut` example.

#### Step 1: Define the State Classes
Each class represents a distinct state with its own set of available actions.

```typescript
import { MachineBase } from '@doeixd/machine';

// Forward-declare to handle the circular type dependency.
class LoggedInMachine extends MachineBase<{ status: 'loggedIn'; user: string }> {
  constructor(context: { status: 'loggedIn'; user: string }) { super(context); }
  
  // This transition calls the factory for the `LoggedOut` state.
  logout = () => createLoggedOutMachine(); 
}

class LoggedOutMachine extends MachineBase<{ status: 'loggedOut' }> {
  constructor() { super({ status: 'loggedOut' }); }
  
  // This transition calls the factory for the `LoggedIn` state.
  login = (user: string) => createLoggedInMachine(user);
}
```

#### Step 2: Create a Factory for Each State
Each factory is responsible for correctly instantiating its corresponding state class.

```typescript
// Factory for the LoggedIn state
export function createLoggedInMachine(user: string) {
  return new LoggedInMachine({ status: 'loggedIn', user });
}

// Factory for the LoggedOut state (this is our initial entry point)
export function createLoggedOutMachine() {
  return new LoggedOutMachine();
}
```

#### Step 3: Use the Factories to Drive State
You start with the initial factory and the returned machine's methods will guide you through the flow by calling other factories.

```typescript
// The type is a union of all possible states.
let authMachine: LoggedOutMachine | LoggedInMachine;

// Start with the initial factory.
authMachine = createLoggedOutMachine(); 
console.log(authMachine.context.status); // 'loggedOut'

// The `login` method on `LoggedOutMachine` uses `createLoggedInMachine` internally.
authMachine = authMachine.login('alice');
console.log(authMachine.context.status); // 'loggedIn'

// The compiler now knows `authMachine` is of type `LoggedInMachine`,
// so `logout` is available but `login` is not. This is Type-State safety!
if (authMachine.context.status === 'loggedIn') {
  // authMachine.login('bob'); // COMPILE ERROR!
  authMachine = authMachine.logout();
}

console.log(authMachine.context.status); // 'loggedOut'
```

<br />

## The Built-in Toolkit: `createMachineFactory` and `createMachineBuilder`

The library provides two powerful helpers to reduce boilerplate when creating factories.

### Declarative Logic with `createMachineFactory`

This is your go-to tool for simple, single-state machines where transitions are just pure data transformations.

**The Problem:** Manually writing transitions that call `createMachine` can be repetitive.
```typescript
// Before: Repetitive boilerplate
function createManualCounter(ctx) {
  return createMachine(ctx, {
  increment(this: { count: number }) {
    return createMachine({ count: this.context.count + 1 }, transitions);
  },
  add(this: { count: number }, n: number) {
    return createMachine({ count: this.context.count + n }, transitions);
  }
  });
}
```

**The Solution:** `createMachineFactory` lets you define only the **context transformation**.

```typescript
import { createMachineFactory } from '@doeixd/machine';

// After: Clean and declarative
const createDeclarativeCounter = createMachineFactory<{ count: number }>()({
  // You only write the pure logic of how the context changes.
  // The helper handles the `createMachine` calls for you.
  increment: (ctx) => ({ count: ctx.count + 1 }),
  add: (ctx, n: number) => ({ count: ctx.count + n }),
});

// Usage is the same
const counter = createDeclarativeCounter({ count: 10 });
const next = counter.add.call(counter, 5);
console.log(next.context.count); // 15
```

#### When to use `createMachineFactory`:
-   ✅ For machines that exist as a **single state** (don't transition between different classes/types).
-   ✅ When all transitions can be expressed as **pure functions** that return the next context.
-   ❌ Not suitable for the Type-State paradigm where you transition between different machine types.

<br />

### Class-based Logic with `createMachineBuilder`

This helper is for when you like organizing your logic in a class, but want a simple factory function for creating instances. It separates a class's *behavior* from its *state*.

**How it works:** You create one "template" instance of your class. The builder clones its prototype and instance fields while replacing the context, giving you a factory for snapshots with the same runtime class identity.

```typescript
import { MachineBase, createMachineBuilder } from '@doeixd/machine';

class Counter extends MachineBase<{ count: number }> {
  increment() {
    return createCounter({ count: this.context.count + 1 });
  }

  add(n: number) {
    return createCounter({ count: this.context.count + n });
  }
}

// Create the builder from a template instance. This captures the `increment` and `add` methods.
const createCounter = createMachineBuilder(new Counter({ count: 0 }));

// Use the builder to stamp out new instances with custom initial state.
const counter1 = createCounter({ count: 50 });
const counter2 = createCounter({ count: -20 });

console.log(counter1.context.count); // 50
const next1 = counter1.increment();
console.log(next1.context.count); // 51
```

Use prototype methods for transitions that read `this`. A class-field arrow captures the template instance lexically, so copying that function would keep reading the template's original context.

#### When to use `createMachineBuilder`:
-   ✅ When you are using **classes** to define your machine's behavior.
-   ✅ When you want a simple `create(...)` function instead of `new MyClass(...)`.
-   ✅ It provides a clean separation between the class definition (behavior) and its instantiation (state).

<br />

## Advanced Patterns: Building a Library of Machines

Because factories are just functions, you can compose them to build powerful, abstract, and highly reusable state machine patterns.

### Higher-Order Factories: The "Plug-in" Pattern

A higher-order factory is a factory that takes configuration, or even other functions, as arguments. The library's own `createFetchMachine` is the perfect example.

```typescript
import { createFetchMachine } from '@doeixd/machine/higher-order';

// 1. Your specific logic: a simple async function.
async function fetchUser(id: number): Promise<{ id: number; name: string }> {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) throw new Error('User not found');
  return res.json();
}

// 2. The higher-order factory: `createFetchMachine`.
// It takes your logic as a "plug-in".
const userFetcherFactory = () => createFetchMachine({
  fetcher: fetchUser,
  onSuccess: (user) => console.log(`Fetched: ${user.name}`),
});

// 3. The result is a complete, specialized state machine.
const userMachine = userFetcherFactory();
// userMachine is now a full machine with Idle, Loading, Success, and Error states,
// all pre-wired to work with your `fetchUser` function.
```
This is the ultimate form of reusability. The `createFetchMachine` factory encapsulates a complex state pattern, and you simply provide the specific details.

### Partial Application: Creating Specialized Factories

You can create specialized factories from more generic ones by pre-filling some of their arguments.

#### Example: A Generic Logger, Specialized
Imagine a generic factory that creates a machine with logging capabilities.

```typescript
// A generic factory that needs a logger function.
function createLoggableMachine(logger: (message: string) => void) {
  const transitions = {
    log(this: { lastLog: string }, message: string) {
      logger(message); // Use the provided logger
      return createMachine({ lastLog: message }, this);
    }
  };
  return createMachine({ lastLog: '' }, transitions);
}

// Now, create specialized versions using partial application.

// 1. A factory that is pre-configured to log to the console.
export const createConsoleLogger = () => createLoggableMachine(console.log);

// 2. A factory that is pre-configured to send logs to a remote service.
import { analytics } from './analytics';
export const createAnalyticsLogger = () => createLoggableMachine(analytics.track);

// --- Usage ---
const consoleMachine = createConsoleLogger();
consoleMachine.log.call(consoleMachine, 'Hello, console!'); // Logs to console

const analyticsMachine = createAnalyticsLogger();
analyticsMachine.log.call(analyticsMachine, 'User clicked button'); // Sends to analytics
```

<br />

## Summary: Which Factory to Use?

This table will help you choose the right pattern for your needs.

| Factory Type | When to Use | Key Benefit |
| :--- | :--- | :--- |
| **Simple Custom Function** | The default for **Type-State** machines or any complex, multi-state logic. | Full control, encapsulation, and configuration. |
| **`createMachineFactory`** | For simple, **single-state** machines where transitions only transform data. | Clean, declarative, and removes boilerplate. |
| **`createMachineBuilder`** | For **class-based** machines to create a simple factory API. | Separates class behavior from instance state. |
| **Higher-Order Factory** | For creating abstract, reusable state patterns (like `createFetchMachine`). | Maximum reusability and composition. |

Factories are a fundamental pattern that turns your state machines from simple objects into a powerful, composable, and type-safe system. By understanding and using them, you unlock the full potential of `@doeixd/machine`.

<br />

## Advanced Patterns: Composition, Combinators, and Partial Application

Because factories are just functions, you can apply powerful functional programming patterns to them. This is where you can start building a truly robust and composable "library" of state logic for your application.

### Composition: Building Machines from Smaller Pieces

Composition is the idea of combining smaller, simpler functions to create more complex ones. With factories, this means you can build complex machines by combining the behaviors of smaller machines.

One way to do this is with the library's `extendTransitions` helper.

#### Example: Composing a "Taggable" Feature onto a Counter

Let's say we have a simple counter and we want to add the ability to "tag" it with metadata, but we want to keep that logic separate.

```typescript
import { createMachine, extendTransitions } from '@doeixd/machine';

// --- Factory 1: A simple counter ---
const counterTransitions = {
  increment: (ctx) => ({ ...ctx, count: ctx.count + 1 }),
};
const createCounter = (initialCount = 0) => 
  createMachine({ count: initialCount }, counterTransitions);


// --- Factory 2: A "Taggable" feature ---
// This factory takes an existing machine and adds tagging functionality to it.
function withTaggable<M extends Machine<{ tags: string[] }>>(machine: M) {
  return extendTransitions(machine, {
    addTag(this: Context<M>, tag: string) {
      return setContext(this, { ...this.context, tags: [...this.context.tags, tag] });
    },
    removeTag(this: Context<M>, tagToRemove: string) {
      return setContext(this, { 
        ...this.context, 
        tags: this.context.tags.filter(t => t !== tagToRemove) 
      });
    }
  });
}

// --- Now, compose them! ---
const baseCounter = createCounter(10);
const taggableCounter = withTaggable(
  // We need to add the `tags` property to the initial context
  setContext(baseCounter, { ...baseCounter.context, tags: [] })
);


// The final machine has methods from both!
let machine = taggableCounter;
machine = machine.increment.call(machine);      // From counter
machine = machine.addTag.call(machine, 'important'); // From taggable

console.log(machine.context); // { count: 11, tags: ['important'] }
```
This is a form of composition where you "decorate" a base machine with new capabilities.

<br />

### Combinators: Functions that Combine Factories

A **combinator** is a higher-order function that takes one or more functions as input and returns a new function. In our world, it's a function that takes factories and returns a new, combined factory.

Let's create a `combineFactories` combinator.

#### Example: A `combineFactories` Combinator

```typescript
import { createMachine, extendTransitions, Machine, Context } from '@doeixd/machine';

// This combinator merges the contexts and transitions of two factories.
function combineFactories<
  F1 extends (...args: any[]) => Machine<any>,
  F2 extends (...args: any[]) => Machine<any>
>(factory1: F1, factory2: F2) {
  
  return (
    ...args: Parameters<F1> // Use args of the first factory
  ): Machine<Context<ReturnType<F1>> & Context<ReturnType<F2>>> & 
     Omit<ReturnType<F1>, 'context'> & 
     Omit<ReturnType<F2>, 'context'> => {
    
    const machine1 = factory1(...args);
    const machine2 = factory2(); // Assuming second factory takes no args for simplicity
    
    // 1. Merge contexts
    const combinedContext = { ...machine1.context, ...machine2.context };
    
    // 2. Create a base machine with the combined context
    const baseMachine = createMachine(combinedContext, {});
    
    // 3. Extend with transitions from both
    const machineWithT1 = extendTransitions(baseMachine, machine1);
    const finalMachine = extendTransitions(machineWithT1, machine2);

    return finalMachine;
  };
}

// --- Usage of the combinator ---

// Factory for a timer
const createTimer = () => createMachine({ elapsed: 0 }, {
  tick: (ctx) => ({ ...ctx, elapsed: ctx.elapsed + 1 })
});

// Factory for a counter
const createCounter = (initial = 0) => createMachine({ count: initial }, {
  increment: (ctx) => ({ ...ctx, count: ctx.count + 1 })
});

// Use the combinator to create a new factory
const createTimerCounter = combineFactories(createCounter, createTimer);

// The new factory creates a machine with combined state and behavior
const timerCounter = createTimerCounter(10); // initial count = 10

let state = timerCounter;
state = state.increment.call(state);
state = state.tick.call(state);

console.log(state.context); // { count: 11, elapsed: 1 }
```
Combinators allow you to build new factories from your existing library of factories, promoting incredible code reuse.

<br />

### Partial Application: Creating Specialized Factories

**Partial application** is the process of fixing a number of arguments to a function, producing another function of smaller arity. Think of it as creating a "preset" for a more generic function.

This is extremely useful for creating specialized versions of a configurable factory.

#### Example: A Generic `createFetcher` and its Specialized Versions

Let's create a generic factory for fetching data from an API. It will be configurable with a URL endpoint.

```typescript
import { createFetchMachine } from '@doeixd/machine/higher-order';

// 1. A generic, configurable factory.
// It takes an endpoint and returns a configured fetch machine.
const createApiFetcher = (endpoint: string) => {
  return createFetchMachine({
    fetcher: async (params: any) => {
      const url = `${endpoint}/${params.id}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch from ${url}`);
      return res.json();
    }
  });
};

// 2. Use partial application to create specialized factories.
// We are "fixing" the `endpoint` argument.

export const createUserFetcher = () => createApiFetcher('/api/users');
export const createProductFetcher = () => createApiFetcher('/api/products');
export const createOrderFetcher = () => createApiFetcher('/api/orders');


// --- Usage ---

// Now, in your application, you can use the simple, specialized factories.
const userMachine = createUserFetcher();
const productMachine = createProductFetcher();

// userMachine is now pre-configured to fetch from '/api/users'
// productMachine is pre-configured to fetch from '/api/products'

// Example run (would typically be in a UI with `runMachine`)
// userMachine.fetch.call(userMachine, { id: 123 });
```
This pattern is fantastic for reducing boilerplate and providing a clean, semantic API for other developers on your team. Instead of remembering `createApiFetcher('/api/users')`, they can just import and use `createUserFetcher()`.

Partial application is a simple but profound way to build a design system for your state logic, creating a palette of pre-configured, easy-to-use machines.
