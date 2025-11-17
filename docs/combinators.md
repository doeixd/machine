# Guide to Functional Combinators: Composing State Logic

While `@doeixd/machine` provides a simple and direct API for creating machines, its true power is unlocked when you start building your own abstractions. **Functional combinators** are higher-order functions that take simple pieces of logic and "combine" them into full, type-safe machine transitions or even entire machines.

They allow you to abstract away boilerplate, enforce consistency, and write your state logic in a highly declarative and reusable style. This guide will walk you through building your own combinators and showcase the ones already built into the library.

### Table of Contents
1.  [What is a Combinator?](#what-is-a-combinator)
2.  [**Pattern 1: The Transition Factory (`createTransitionFactory`)**](#pattern-1-the-transition-factory-createtransitionfactory)
3.  [**Pattern 2: The Machine Extender (`createTransitionExtender`)**](#pattern-2-the-machine-extender-createtransitionextender)
4.  [**Pattern 3: The Functional Machine Creator (`createFunctionalMachine`)**](#pattern-3-the-functional-machine-creator-createfunctionalmachine)
5.  [**Pattern 4: The Curried Ensemble Factory (`createEnsembleFactory`)**](#pattern-4-the-curried-ensemble-factory-createensemblefactory)
6.  [A Catalog of Built-in Library Combinators](#a-catalog-of-built-in-library-combinators)
    -   [Machine Creation & Factories](#machine-creation--factories)
    -   [Transition Creation](#transition-creation)
    -   [Composition & Flow Control](#composition--flow-control)
    -   [Middleware Composition](#middleware-composition)
6.  [Conclusion: Building Your Own Language](#conclusion-building-your-own-language)

---

## What is a Combinator?

In the context of this library, a combinator is a function that helps you create or compose parts of a state machine. It typically:
-   Is a **higher-order function** (it takes a function as an argument and/or returns a function).
-   **Abstracts away boilerplate** (like calling `createMachine` or recalculating derived state).
-   **Enforces type safety** through the clever use of TypeScript generics.
-   Allows you to focus on **pure data transformation logic**.

---

## Pattern 1: The Transition Factory (`createTransitionFactory`)

This is the most common and powerful pattern for building machines in a functional style. The goal is to create a helper function *inside* your machine factory that handles the boilerplate of creating the next state.

### The Problem: Repetitive Boilerplate

Without a combinator, your transitions can get repetitive:

```typescript
// The old way: Repetition in every transition
const transitions = {
  increment(this: { context: Ctx }) {
    const nextContext = { ...this.context, count: this.context.count + 1 };
    return createMachine(nextContext, transitions); // <-- Repetitive
  },
  add(this: { context: Ctx }, n: number) {
    const nextContext = { ...this.context, count: this.context.count + n };
    return createMachine(nextContext, transitions); // <-- Repetitive
  },
};
```

### The Solution: A Reusable Combinator

We can write a combinator that creates these transition functions for us.

```typescript
// functional-combinators.ts
import { createMachine, Machine } from '@doeixd/machine';

/**
 * Creates a factory for building type-safe transitions for a specific machine.
 * This higher-order function enables a clean, functional pattern for defining
 * state changes without directly manipulating the machine's context.
 *
 * @template C The context type of the machine.
 * @returns A `createTransition` function that can create transitions for machines with context type C.
 */
export function createTransitionFactory<C extends object>() {
  /**
   * Takes a pure context transformer and returns a full machine transition method.
   *
   * @param transformer A pure function: `(context, ...args) => nextContext`.
   */
  return function createTransition<TArgs extends any[]>(
    transformer: (ctx: C, ...args: TArgs) => C
  ) {
    return function (this: Machine<C>, ...args: TArgs): Machine<C> {
      const nextContext = transformer(this.context, ...args);
      return createMachine(nextContext, this);
    };
  };
}
```

### Usage: Building a Declarative Machine

Now, you can use this combinator inside your machine factory to define transitions with beautiful clarity.

```typescript
// counterMachine.ts
import { createMachine, Machine } from '@doeixd/machine';
import { createTransitionFactory } from './functional-combinators';

type CounterContext = { count: number };
type CounterMachine = Machine<CounterContext>;

export function createCounterMachine(initialCount = 0): CounterMachine {
  const transitions: any = {};

  // Create our specialized helper for this machine
  const createTransition = createTransitionFactory<CounterContext>();

  // Define transitions by providing only the pure data logic
  Object.assign(transitions, {
    increment: createTransition(ctx => ({ ...ctx, count: ctx.count + 1 })),
    add: createTransition((ctx, amount: number) => ({ ...ctx, count: ctx.count + amount })),
    reset: createTransition(() => ({ count: 0 })),
  });

  return createMachine({ count: initialCount }, transitions);
}
```

### Benefits of this Pattern

-   **Declarative:** Your transition definitions read like a list of pure data transformations.
-   **DRY:** The boilerplate of calling `createMachine` is handled in one place.
-   **Type-Safe:** The combinator uses generics to ensure your arguments are correctly typed from the transformer all the way to the final method.
-   **Encapsulated:** The entire mechanism is hidden within your machine factory, providing a clean public API.

---

## Pattern 2: The Machine Extender (`createTransitionExtender`)

This pattern is for functional composition. Instead of defining all transitions at once, you start with a base machine and progressively "decorate" it with new capabilities.

### The Goal: Functional Composition

Imagine wanting to build a machine from smaller, reusable pieces of functionality. This combinator allows you to do just that, immutably.

### The Combinator Implementation

```typescript
// functional-combinators.ts
import { extendTransitions, createMachine, Machine } from '@doeixd/machine';

/**
 * Creates a factory for adding new, type-safe transitions to an existing machine instance.
 * This enables a functional, compositional approach to building up a machine's capabilities
 * incrementally, without modifying the original machine.
 *
 * @template M The type of the machine being extended.
 * @param machine The machine instance to extend.
 * @returns An object with an `addTransition` method for chaining.
 */
export function createTransitionExtender<M extends Machine<any>>(machine: M) {
  type C = M['context'];

  return {
    machine,

    /**
     * Adds a new transition and returns a new extender for chaining.
     *
     * @param name The name of the new transition.
     * @param transformer A pure function defining the context transformation.
     */
    addTransition: function<TName extends string, TArgs extends any[]>(
      name: TName,
      transformer: (ctx: C, ...args: TArgs) => C
    ) {
      const transitionFn = function (this: Machine<C>, ...args: TArgs) {
        const nextContext = transformer(this.context, ...args);
        return createMachine(nextContext, this);
      };

      const newMachine = extendTransitions(machine, { [name]: transitionFn } as any);

      return createTransitionExtender(newMachine);
    }
  };
}
```

### Usage: Building a Machine with Composition

You can start with a simple machine and layer on functionality. Each step is immutable.

```typescript
import { createMachine } from '@doeixd/machine';
import { createTransitionExtender } from './functional-combinators';

// 1. Start with a machine that only has data.
const baseMachine = createMachine({ value: 10, name: 'base' }, {});

// 2. Add a 'double' capability.
const withDouble = createTransitionExtender(baseMachine)('double', ctx => ({
  ...ctx,
  value: ctx.value * 2,
}));

// 3. Add a 'rename' capability to the *new* machine.
const withRename = createTransitionExtender(withDouble)('rename', (ctx, newName: string) => ({
  ...ctx,
  name: newName,
}));

let finalMachine = withRename;

// `finalMachine` now has `double` and `rename` methods.
finalMachine = finalMachine.double.call(finalMachine.context);    // { value: 20, name: 'base' }
finalMachine = finalMachine.rename.call(finalMachine.context, 'composed'); // { value: 20, name: 'composed' }

// The original machine is untouched and has no methods.
// baseMachine.double(); // => COMPILE ERROR!
```

---

## Pattern 3: The Functional Machine Creator (`createFunctionalMachine`)

This pattern takes functional composition to its logical extreme: a fully curried, two-step approach that completely separates data from behavior, resulting in the most declarative machine construction possible.

### The Vision: Pure Data Transformations

The ultimate goal is to define your entire machine as a collection of pure, composable data transformations. No boilerplate, no machine construction details—just pure functions that describe how your data changes.

### The Combinator Implementation

```typescript
// functional-combinators.ts
import { createMachine, Machine } from '@doeixd/machine';

/**
 * A mapped type that creates the final transition method signatures based on
 * an object of pure context transformers. It infers argument types and sets
 * the correct return type.
 */
type MachineTransitions<
  T extends Record<string, (ctx: C, ...args: any[]) => C>,
  C extends object
> = {
  [K in keyof T]: T[K] extends (ctx: C, ...args: infer A) => C
    ? (this: { context: C } & T, ...args: A) => Machine<C>
    : never;
};

/**
 * Creates a complete, type-safe, functional state machine using a curried, two-step
 * approach that separates the initial data from the transition logic.
 *
 * This is a highly declarative and functional pattern for building single-state machines.
 *
 * @template C The context type of the machine.
 * @param initialContext The starting context (data) for the machine.
 * @returns A new function that takes an object of pure context-transformer
 *   functions and returns a fully-formed machine instance.
 */
export function createFunctionalMachine<C extends object>(initialContext: C) {
  return function withTransitions<
    T extends Record<string, (ctx: C, ...args: any[]) => C>
  >(
    transformers: T
  ): Machine<C> & MachineTransitions<T, C> {
    const transitions: any = {};

    const machineTransitions = Object.fromEntries(
      Object.entries(transformers).map(([key, transformer]) => [
        key,
        function (this: { context: C }, ...args: any[]) {
          const nextContext = transformer(this.context, ...args);
          return createMachine(nextContext, transitions);
        },
      ])
    );

    Object.assign(transitions, machineTransitions);
    return createMachine(initialContext, transitions) as any;
  };
}
```

### Usage: The Most Declarative Approach

This pattern is the pinnacle of declarative machine construction. You define everything as pure data transformations:

```typescript
import { createFunctionalMachine } from './functional-combinators';

type TodoContext = {
  todos: Array<{ id: number; text: string; completed: boolean }>;
  filter: 'all' | 'active' | 'completed';
};

// Step 1: Create the machine factory with initial data
const createTodoMachine = createFunctionalMachine<TodoContext>({
  todos: [],
  filter: 'all'
});

// Step 2: Define all transitions as pure data transformations
const todoMachine = createTodoMachine({
  addTodo: (ctx, text: string) => ({
    ...ctx,
    todos: [...ctx.todos, {
      id: Date.now(),
      text,
      completed: false
    }]
  }),

  toggleTodo: (ctx, id: number) => ({
    ...ctx,
    todos: ctx.todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    )
  }),

  deleteTodo: (ctx, id: number) => ({
    ...ctx,
    todos: ctx.todos.filter(todo => todo.id !== id)
  }),

  setFilter: (ctx, filter: TodoContext['filter']) => ({
    ...ctx,
    filter
  }),

  clearCompleted: (ctx) => ({
    ...ctx,
    todos: ctx.todos.filter(todo => !todo.completed)
  })
});

// Usage is identical to any other machine
const updated = todoMachine
  .addTodo('Learn TypeScript')
  .addTodo('Build state machines')
  .toggleTodo(1)
  .setFilter('active');
```

This approach offers the ultimate separation of concerns:
- **Data**: Defined once in the initial context
- **Behavior**: Defined as pure, testable transformations
- **Composition**: Everything is built declaratively from simple pieces

---

## Pattern 4: The Curried Ensemble Factory (`createEnsembleFactory`)

This is an advanced architectural pattern for building large, maintainable applications. It applies the same curried, functional approach to the `createEnsemble` primitive, allowing you to define your application's state "environment" once and then use it to create multiple, consistent state machines.

### The Goal: Architectural Consistency and Decoupling

In a large application, you might have a single global state store (using React Context, Zustand, etc.) that multiple state machines need to interact with. This combinator lets you create a pre-configured factory that "knows" about your store, so your feature developers only need to provide the business logic.

### The Combinator Implementation

```typescript
// multi.ts
import { createEnsemble, StateStore, Ensemble, Machine } from '@doeixd/machine';

/**
 * Creates a factory for building type-safe, framework-agnostic Ensembles.
 * This is a higher-order function that captures the application's state store
 * and state-discriminant logic in a closure.
 *
 * This allows you to define your application's state "environment" once and then
 * easily create multiple, consistent ensembles by only providing the behavioral logic.
 *
 * @template C The shared context type for the application.
 * @param store The application's state store (e.g., from React, Zustand, etc.).
 * @param getDiscriminant An accessor function that determines the current state from the context.
 * @returns A `withFactories` function that is pre-configured for your app's environment.
 */
export function createEnsembleFactory<C extends object>(
  store: StateStore<C>,
  getDiscriminant: (context: C) => keyof any
) {
  /**
   * This returned function is pre-configured with the `store` and `getDiscriminant` logic.
   * It takes the machine factories (the behavioral logic) and returns a complete Ensemble.
   *
   * @template F The type of the factories object.
   * @param factories An object where each key is a state name and each value is a
   *   function that creates a machine instance for that state.
   * @returns A fully-formed, reactive, and type-safe Ensemble instance.
   */
  return function withFactories<
    F extends Record<string, (context: C) => Machine<C>>
  >(
    factories: F
  ): Ensemble<ReturnType<F[keyof F]>, C> {
    // We simply call the original createEnsemble with the captured arguments.
    return createEnsemble(store, factories, getDiscriminant as (context: C) => keyof F);
  };
}
```

### Usage: Building Large Applications with Consistency

This pattern is perfect for large applications where you want to establish architectural consistency across multiple features.

```typescript
// app/store.ts - Define your app's state environment once
import { createEnsembleFactory } from '@doeixd/machine';

type AppContext = {
  auth: { status: 'loggedOut' | 'loggedIn'; user?: User };
  cart: { items: CartItem[]; total: number };
  ui: { theme: 'light' | 'dark'; modal?: ModalState };
};

const globalStore: StateStore<AppContext> = {
  getContext: () => appContext,
  setContext: (newCtx) => { appContext = newCtx; }
};

// Create the factory once for your entire app
export const createAppEnsemble = createEnsembleFactory(globalStore, (ctx) => ctx.auth.status);

// features/auth.ts - Feature developers only provide business logic
import { createAppEnsemble } from '../store';

const authEnsemble = createAppEnsemble({
  loggedOut: (ctx) => createMachine(ctx, {
    login: (user: User) => globalStore.setContext({
      ...ctx,
      auth: { status: 'loggedIn', user }
    })
  }),
  loggedIn: (ctx) => createMachine(ctx, {
    logout: () => globalStore.setContext({
      ...ctx,
      auth: { status: 'loggedOut' }
    })
  })
});

// features/cart.ts - Same pattern, different feature
import { createAppEnsemble } from '../store';

const cartEnsemble = createAppEnsemble({
  loggedOut: (ctx) => createMachine(ctx, {
    addItem: (item: CartItem) => globalStore.setContext({
      ...ctx,
      cart: { ...ctx.cart, items: [...ctx.cart.items, item] }
    })
  }),
  loggedIn: (ctx) => createMachine(ctx, {
    addItem: (item: CartItem) => globalStore.setContext({
      ...ctx,
      cart: { ...ctx.cart, items: [...ctx.cart.items, item] }
    }),
    checkout: () => globalStore.setContext({
      ...ctx,
      cart: { items: [], total: 0 }
    })
  })
});

// App.tsx - Use the ensembles
function App() {
  // Both ensembles share the same global state
  authEnsemble.actions.login(user);     // Updates auth status
  cartEnsemble.actions.addItem(item);   // Reads auth status, updates cart
  cartEnsemble.actions.checkout();      // Only available when logged in
}
```

### Coordinating Multiple Machines: The Ensemble Advantage

One of the most powerful aspects of `createEnsembleFactory` is how it enables sophisticated coordination between multiple state machines while maintaining clean separation of concerns.

**Shared Context Coordination:**
```typescript
// All machines share the same global context
type AppContext = {
  auth: { status: 'loggedOut' | 'loggedIn'; user?: User };
  cart: { items: CartItem[]; total: number };
  notifications: { messages: Notification[]; unread: number };
};

// Each ensemble can read from and write to the entire shared context
const authEnsemble = createAppEnsemble({
  loggedOut: (ctx) => createMachine(ctx, {
    login: (user: User) => store.setContext({
      ...ctx,
      auth: { status: 'loggedIn', user },
      notifications: { ...ctx.notifications, unread: ctx.notifications.unread + 1 }
    })
  })
});

const cartEnsemble = createAppEnsemble({
  loggedOut: (ctx) => createMachine(ctx, {
    addItem: (item: CartItem) => store.setContext({
      ...ctx,
      cart: { ...ctx.cart, items: [...ctx.cart.items, item] }
    })
  }),
  loggedIn: (ctx) => createMachine(ctx, {
    addItem: (item: CartItem) => store.setContext({
      ...ctx,
      cart: { ...ctx.cart, items: [...ctx.cart.items, item] },
      notifications: { ...ctx.notifications, unread: ctx.notifications.unread + 1 }
    }),
    checkout: () => store.setContext({
      ...ctx,
      cart: { items: [], total: 0 },
      notifications: {
        messages: [...ctx.notifications.messages, { type: 'success', text: 'Order placed!' }],
        unread: ctx.notifications.unread + 1
      }
    })
  })
});
```

**State-Dependent Behavior:**
The discriminant function (`getDiscriminant`) creates powerful coordination possibilities:

```typescript
// Different behavior based on authentication status
const createAppEnsemble = createEnsembleFactory(store, (ctx) => ctx.auth.status);

// Auth ensemble: changes status that affects other ensembles
authEnsemble.actions.login(user); // Now cart has different available actions

// Cart ensemble: behavior changes based on auth status
if (userIsLoggedIn) {
  cartEnsemble.actions.checkout(); // Only available when logged in
} else {
  cartEnsemble.actions.addItem(item); // Available in both states
}
```

**Cross-Machine Communication:**
Ensembles can communicate through the shared context without direct coupling:

```typescript
// Notification ensemble reacts to changes from other ensembles
const notificationEnsemble = createAppEnsemble({
  loggedOut: (ctx) => createMachine(ctx, {
    dismiss: (id: string) => store.setContext({
      ...ctx,
      notifications: {
        messages: ctx.notifications.messages.filter(m => m.id !== id),
        unread: Math.max(0, ctx.notifications.unread - 1)
      }
    })
  }),
  loggedIn: (ctx) => createMachine(ctx, {
    dismiss: (id: string) => store.setContext({
      ...ctx,
      notifications: {
        messages: ctx.notifications.messages.filter(m => m.id !== id),
        unread: Math.max(0, ctx.notifications.unread - 1)
      }
    }),
    markAllRead: () => store.setContext({
      ...ctx,
      notifications: { ...ctx.notifications, unread: 0 }
    })
  })
});
```

### Benefits of this Pattern

- **Architectural Consistency**: All features use the same state management approach
- **Separation of Concerns**: Infrastructure setup vs. feature business logic
- **Framework Agnostic**: Same factories work with React, Solid, Vue, etc.
- **Type Safety**: Full compile-time guarantees across the entire application
- **Testability**: Each feature's logic can be tested in isolation
- **Scalability**: Easy to add new features without changing existing code
- **Coordination**: Multiple machines can communicate through shared context without tight coupling
- **State-Dependent Behavior**: Machines can have different capabilities based on global application state

This pattern enables large teams to build complex applications with confidence, knowing that all state interactions are type-safe and consistent.

---

## A Catalog of Built-in Library Combinators

`@doeixd/machine` is built on these same functional principles and includes several pre-made combinators and higher-order functions.

### Machine Creation & Factories

-   **`createMachineFactory`**: The library's own version of our Pattern 1 combinator, perfect for single-state machines.
    ```typescript
    const createCounter = createMachineFactory<{ count: number }>()({
      increment: ctx => ({ count: ctx.count + 1 }),
    });
    ```
    _See: [A Guide to Machine Factories](./factories.md)_

-   **`createMachineBuilder`**: A combinator that takes a "template" class instance and returns a factory function for creating new instances with different contexts.
    ```typescript
    const createCounter = createMachineBuilder(new Counter({ count: 0 }));
    const myCounter = createCounter({ count: 100 });
    ```

-   **`combineFactories`**: A combinator that takes two machine factories and merges them into a single, new factory that creates machines with combined context and transitions.
    ```typescript
    const createCounterWithLogging = combineFactories(createCounter, createLogger);
    ```

-   **`createEnsembleFactory`**: A higher-order function that creates pre-configured ensemble factories for large applications. Captures your app's state store and discriminant logic, allowing feature developers to focus only on business logic.
    ```typescript
    const createAppEnsemble = createEnsembleFactory(store, ctx => ctx.status);
    const authEnsemble = createAppEnsemble({
      loggedOut: ctx => createMachine(ctx, { login: () => store.setContext({...}) }),
      loggedIn: ctx => createMachine(ctx, { logout: () => store.setContext({...}) })
    });
    ```
    _See: [Pattern 4: The Curried Ensemble Factory](#pattern-4-the-curried-ensemble-factory-createensemblefactory)_

### Transition Creation

These are combinators that take simple configuration and return a full transition method.

-   **`delegateToChild`**: For hierarchical machines. Takes a child's action name and returns a parent transition that automatically delegates the call.
    ```typescript
    class Parent extends MachineBase<{ child: Child }> {
      // Creates a `save` method on the parent that calls `save` on the child.
      save = delegateToChild('save');
    }
    ```

-   **`toggle`**: Takes a boolean property name from the context and returns a transition method that toggles it.
    ```typescript
    class Settings extends MachineBase<{ darkMode: boolean }> {
      toggleDarkMode = toggle('darkMode');
    }
    ```

### Composition & Flow Control

-   **`pipeTransitions`**: A utility that composes an array of sync or async transitions, applying them sequentially to a machine.
    ```typescript
    const finalState = await pipeTransitions(
      machine,
      m => m.increment(),
      m => m.addAsync(5)
    );
    ```
-   **`sequence`**: A powerful combinator that takes an array of machines and a predicate. It creates a new "sequence machine" that automatically advances to the next machine in the array whenever the predicate returns true.
    ```typescript
    const wizard = sequence(
      [new Step1(), new Step2(), new Step3()],
      (machine) => machine.context.isValid
    );
    ```

### Middleware Composition

The entire middleware system is built on functional combinators.

-   **`compose`**: The classic functional composition utility. Takes a machine and a series of middleware functions and applies them in order.
    ```typescript
    const instrumented = compose(
      machine,
      withLogging,
      withAnalytics(tracker)
    );
    ```
-   **`branch`**: A conditional combinator. Takes an array of `[predicate, middleware]` tuples and applies the first middleware whose predicate returns true.
    ```typescript
    const smartMiddleware = branch([
      [m => m.context.env === 'dev', withTimeTravel()],
      [m => m.context.env === 'prod', withErrorReporting(sentry)],
    ]);
    ```
-   **`when`**: A simpler version of `branch` for applying a single middleware conditionally.
    ```typescript
    const devOnlyLogging = when(withLogging, m => m.context.env === 'dev');
    ```
    _See: [State Machine Middleware System](./middleware.md)_

---

## Conclusion: Building Your Own Language

Functional combinators are more than just a pattern; they are a way to build a domain-specific language (DSL) for your application's state logic. By creating your own combinators like `createTransitionFactory`, you can establish a consistent, safe, and highly readable way for your entire team to define and compose state machines.

This approach elevates your code from a series of imperative steps to a declarative specification of your system's behavior, all while being 100% type-safe.