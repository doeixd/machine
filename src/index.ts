/**
 * A utility type that represents either a value of type T or a Promise that resolves to T.
 * @template T - The value type
 */
type MaybePromise<T> = T | Promise<T>

/**
 * A record of synchronous state transition functions.
 * Each function receives the machine context as `this` and returns a new Machine state.
 * @template C - The context object type
 */
type Functions<C extends object> =
  Record<string, (this: C, ...args: any[]) => Machine<any>>

/**
 * A record of asynchronous state transition functions.
 * Each function receives the machine context as `this` and returns either a Machine or Promise<Machine>.
 * @template C - The context object type
 */
type AsyncFunctions<C extends object> =
  Record<string, (this: C, ...args: any[]) => MaybePromise<Machine<C>>>

/**
 * A synchronous state machine with a context object and transition functions.
 * @template C - The context object type
 * @example
 * const machine: Machine<{ count: number }> = {
 *   context: { count: 0 },
 *   increment: function() {
 *     return createMachine({ count: this.count + 1 }, this)
 *   }
 * }
 */
export type Machine<C extends object> = { context: C } & Functions<C>

/**
 * An asynchronous state machine with a context object and async transition functions.
 * @template C - The context object type
 * @example
 * const machine: AsyncMachine<{ loading: boolean }> = {
 *   context: { loading: false },
 *   fetch: async function() {
 *     return createAsyncMachine({ loading: true }, this)
 *   }
 * }
 */
export type AsyncMachine<C extends object> = { context: C } & AsyncFunctions<C>

/**
 * Extracts the context type from a Machine.
 * @template M - The machine type
 * @example
 * type CounterMachine = Machine<{ count: number }> & {
 *   increment: () => any
 * }
 * type CounterContext = Context<CounterMachine> // { count: number }
 */
export type Context<M extends { context: any }> = M["context"]

/**
 * Extracts the transition function signatures from a Machine, excluding the context property.
 * @template M - The machine type
 * @example
 * type CounterMachine = Machine<{ count: number }> & {
 *   increment: () => any
 *   decrement: () => any
 * }
 * type CounterTransitions = Transitions<CounterMachine>
 * // { increment: () => any; decrement: () => any }
 */
export type Transitions<M extends Machine<any>> = Omit<M, "context">

/**
 * Extracts the argument types for a specific transition function in a Machine.
 * @template M - The machine type
 * @template K - The transition function name
 * @example
 * type CounterMachine = Machine<{ count: number }> & {
 *   addValue: (n: number) => any
 * }
 * type AddValueArgs = TransitionArgs<CounterMachine, "addValue"> // [number]
 */
export type TransitionArgs<M extends Machine<any>, K extends keyof M & string> =
  M[K] extends (...args: infer A) => any ? A : never

/**
 * Type-safe transition function helper for robust generics and inference.
 * This function captures generic type information for each transition, allowing TypeScript
 * to properly infer the return type when chaining transitions.
 * @template C - The context object type
 * @template A - The array of argument types
 * @template R - The return type (a Machine with any context)
 * @param {Function} fn - The transition function to wrap
 * @returns {Function} The same function, now with proper type information
 * @example
 * const counter = createMachine(
 *   { count: 0 },
 *   {
 *     increment: transition<{ count: number }, [], Machine<{ count: number }>>(
 *       function() {
 *         return createMachine({ count: this.count + 1 }, this as any)
 *       }
 *     ),
 *     decrement: transition<{ count: number }, [], Machine<{ count: number }>>(
 *       function() {
 *         return createMachine({ count: this.count - 1 }, this as any)
 *       }
 *     )
 *   }
 * )
 * // Now each transition has proper type inference:
 * const result = counter.increment() // Properly typed as Machine<{ count: number }>
 * const final = result.decrement() // Chaining works with full type safety
 */
export const transition = <
  C extends object,
  A extends any[],
  R extends Machine<any>
>(
  fn: (this: C, ...args: A) => R
): ((this: C, ...args: A) => R) => fn

/**
 * Creates a synchronous state machine from a context and transition functions.
 * @template C - The context object type
 * @param {C} context - The initial state context
 * @param {Functions<C>} fns - Object containing transition function definitions
 * @returns {Machine<C>} A new machine instance
 * @example
 * const counter = createMachine(
 *   { count: 0 },
 *   {
 *     increment: function() {
 *       return createMachine({ count: this.count + 1 }, this)
 *     },
 *     decrement: function() {
 *       return createMachine({ count: this.count - 1 }, this)
 *     }
 *   }
 * )
 * const next = counter.increment() // { context: { count: 1 }, increment, decrement }
 */
export function createMachine<C extends object>(
  context: C,
  fns: Functions<C>
): Machine<C> {
  return Object.assign({ context }, fns)
}

/**
 * Shorthand alias for createMachine.
 * @template C - The context object type
 * @param {C} context - The initial state context
 * @param {Functions<C>} fns - Object containing transition function definitions
 * @returns {Machine<C>} A new machine instance
 * @example
 * const counter = machine(
 *   { count: 0 },
 *   {
 *     increment: function() { return machine({ count: this.count + 1 }, this) }
 *   }
 * )
 */
export const machine = createMachine

/**
 * Shorthand alias for createMachine, emphasizing the state management aspect.
 * @template C - The context object type
 * @param {C} context - The initial state context
 * @param {Functions<C>} fns - Object containing transition function definitions
 * @returns {Machine<C>} A new machine instance
 * @example
 * const counter = state(
 *   { count: 0 },
 *   {
 *     increment: function() { return state({ count: this.count + 1 }, this) }
 *   }
 * )
 */
export const state = createMachine

/**
 * Creates an asynchronous state machine from a context and async transition functions.
 * @template C - The context object type
 * @param {C} context - The initial state context
 * @param {AsyncFunctions<C>} fns - Object containing async transition function definitions
 * @returns {AsyncMachine<C>} A new async machine instance
 * @example
 * const user = createAsyncMachine(
 *   { id: null, loading: false },
 *   {
 *     fetchUser: async function(userId) {
 *       const data = await fetch(`/api/users/${userId}`)
 *       return createAsyncMachine({ id: data.id, loading: false }, this)
 *     }
 *   }
 * )
 */
export function createAsyncMachine<C extends object>(
  context: C,
  fns: AsyncFunctions<C>
): AsyncMachine<C> {
  return Object.assign({ context }, fns)
}

/**
 * Creates a new machine state by applying an update function to the current machine's context.
 * Preserves all transition functions from the original machine.
 * @template C - The context object type
 * @param {Machine<C>} m - The current machine state
 * @param {Function} update - A function that takes the current read-only context and returns an updated context
 * @returns {Machine<C>} A new machine with updated context but same transition functions
 * @example
 * const counter = createMachine({ count: 0 }, { })
 * const incremented = next(counter, (ctx) => ({ count: ctx.count + 1 }))
 * // incremented.context.count === 1
 */
export function next<C extends object>(
  m: Machine<C>,
  update: (ctx: Readonly<C>) => C
): Machine<C> {
  return createMachine(update(m.context), m)
}

/**
 * A discriminated union type representing an event that can be dispatched to a machine.
 * Each event has a `type` property matching a transition function name and `args` matching that function's parameters.
 * @template M - The machine type
 * @example
 * type CounterEvent = Event<Machine<{ count: number }>& {
 *   increment: () => any
 *   addValue: (n: number) => any
 * }>
 * // CounterEvent = { type: "increment"; args: [] } | { type: "addValue"; args: [number] }
 */
export type Event<M> = {
  [K in keyof M & string]: M[K] extends (...args: infer A) => any
    ? { type: K; args: A }
    : never
}[keyof M & string]

/**
 * Runs an asynchronous state machine with event dispatch capability.
 * Provides a managed interface to dispatch events and track state changes.
 * @template C - The context object type
 * @param {AsyncMachine<C>} initial - The initial machine state
 * @param {Function} onChange - Optional callback invoked whenever the machine state changes
 * @returns {Object} An object with a state getter and dispatch function
 * @returns {C} returns.state - The current machine context
 * @returns {Function} returns.dispatch - Async function to dispatch events to the machine
 * @example
 * const machine = createAsyncMachine(
 *   { count: 0 },
 *   {
 *     increment: async function() {
 *       return createAsyncMachine({ count: this.count + 1 }, this)
 *     }
 *   }
 * )
 * const runner = runMachine(machine, (m) => console.log("State changed:", m.context))
 * await runner.dispatch({ type: "increment", args: [] })
 * console.log(runner.state) // { count: 1 }
 */
export function runMachine<C extends object>(
  initial: AsyncMachine<C>,
  onChange?: (m: AsyncMachine<C>) => void
) {
  let current = initial

  async function dispatch<E extends Event<typeof current>>(event: E) {
    const fn = current[event.type] as any
    if (!fn) throw new Error(`Unknown event: ${event.type}`)
    const next = await fn.apply(current.context, event.args)
    current = next
    onChange?.(current)
    return current
  }

  return {
    get state() {
      return current.context
    },
    dispatch,
  }
}


/**
 * A function that describes a state transition.
 * It receives the current context and any arguments, and returns the new context.
 * @template C - The context object type.
 * @template A - The array of argument types for the transition.
 */
type TransitionLogic<C extends object, A extends any[]> = (
  ctx: Readonly<C>,
  ...args: A
) => C;

/**
 * A record of transition logic functions for a specific context type.
 */
type TransitionImplementations<C extends object> = Record<
  string,
  TransitionLogic<C, any[]>
>;

// Utility to get all but the first parameter from a function's parameters
type Tail<T extends (...args: any) => any> = T extends (
  first: any,
  ...rest: infer R
) => any
  ? R
  : never;

/**
 * The final, constructed machine type produced by the factory.
 * It infers the method signatures from the transition logic.
 */
type FactoryMachine<
  C extends object,
  T extends TransitionImplementations<C>
> = Machine<C> &
  {
    [K in keyof T]: (...args: Tail<T[K]>) => FactoryMachine<C, T>;
  };

/**
 * Creates a factory for building machines with a specific context type.
 * This utility uses partial application to reduce boilerplate, allowing you to
 * define transitions as pure functions that only return the next context.
 *
 * @template C - The context object type.
 * @returns A function that takes transition implementations and returns a machine constructor.
 * @example
 * const counterFactory = createMachineFactory<{ count: number }>()({
 *   increment: (ctx) => ({ count: ctx.count + 1 }),
 *   add: (ctx, n: number) => ({ count: ctx.count + n }),
 * });
 * const counter = counterFactory({ count: 0 });
 * const next = counter.increment().add(5); // { context: { count: 6 }, ... }
 */
export function createMachineFactory<C extends object>() {
  return function <T extends TransitionImplementations<C>>(implementations: T) {
    const machineMethods: Functions<C> = {};

    for (const key in implementations) {
      if (Object.prototype.hasOwnProperty.call(implementations, key)) {
        const logicFn = implementations[key];
        machineMethods[key] = function (this: C, ...args: any[]) {
          // 'this' is the current context, which is the first argument
          // to our transition logic function.
          const newContext = logicFn(this, ...args);
          // Recursively create the next machine with the same methods
          return createMachine(newContext, machineMethods) as any;
        };
      }
    }

    return function (initialContext: C): FactoryMachine<C, T> {
      return createMachine(initialContext, machineMethods) as FactoryMachine<
        C,
        T
      >;
    };
  };
}


/**
 * Creates a builder function from a "template" machine instance.
 *
 * This utility captures the transition methods of the provided machine and returns
 * a new function. This builder function takes a new context and returns a new
 * machine of the original type, preserving all of its methods.
 *
 * It's particularly useful for creating multiple instances of a class-based
 * machine without repeatedly calling its constructor.
 *
 * @template M - The machine type, which must have a context property.
 * @param {M} templateMachine - An instance of a machine to use as the template.
 * @returns {(context: Context<M>) => M} A function that builds new machines of type M.
 * @example
 * class User extends MachineBase<{ id: number; name: string }> {
 *   rename(newName: string) {
 *     return buildUser({ ...this.context, name: newName });
 *   }
 * }
 *
 * // Create a builder from a template instance.
 * const buildUser = createMachineBuilder(new User({ id: 0, name: "template" }));
 *
 * // Now use the builder to create new, fully-functional instances.
 * const user1 = buildUser({ id: 1, name: "Alice" });
 * const user2 = buildUser({ id: 2, name: "Bob" });
 *
 * const user1Renamed = user1.rename("Alicia");
 *
 * console.log(user2.context.name); // "Bob"
 * console.log(user1Renamed.context.name); // "Alicia"
 */
export function createMachineBuilder<M extends Machine<any>>(
  templateMachine: M
): (context: Context<M>) => M {
  // Omit the 'context' to capture only the transition functions.
  // This is done once when the builder is created.
  const { context, ...transitions } = templateMachine;

  // Return the builder function.
  return (newContext: Context<M>): M => {
    // Use the captured transitions to create a new machine with the new context.
    // The cast is safe because we are reconstructing the machine from its own parts.
    return createMachine(newContext, transitions) as M;
  };
}



/**
 * Creates a new machine by overriding or adding transition functions to an existing machine.
 *
 * This utility is perfect for:
 * - Mocking transitions during testing.
 * - Decorating existing transitions with additional logic (e.g., logging).
 * - Dynamically extending a machine's capabilities at runtime.
 *
 * The original machine remains unchanged. The return type is precisely calculated
 * to reflect the new set of available transitions.
 *
 * @template M - The original machine type.
 * @template T - An object of new or overriding transition functions.
 * @param {M} machine - The base machine instance.
 * @param {T} overrides - An object containing the transition functions to add or overwrite.
 * @returns {Machine<Context<M>> & Omit<M, "context" | keyof T> & T} A new machine instance with the merged transitions.
 * @example
 * const counter = createMachine({ count: 0 }, {
 *   increment: function() { return createMachine({ count: this.count + 1 }, this) }
 * });
 *
 * // Example 1: Overriding 'increment' and adding 'reset'
 * const newCounter = overrideTransitions(counter, {
 *   increment: function() { // Overwrites original
 *     return createMachine({ count: this.count + 10 }, this);
 *   },
 *   reset: function() { // Adds a new transition
 *     return createMachine({ count: 0 }, this);
 *   }
 * });
 *
 * const s1 = newCounter.increment(); // s1.context.count === 10
 * const s2 = s1.reset();           // s2.context.count === 0
 *
 * // Example 2: Decorating a transition with logging
 * const decoratedCounter = overrideTransitions(counter, {
 *   increment: function(...args) {
 *     console.log(`Incrementing from ${this.count}...`);
 *     // Call the original machine's implementation
 *     return counter.increment.apply(this, args);
 *   }
 * });
 *
 * decoratedCounter.increment(); // Logs "Incrementing from 0..."
 */
export function overrideTransitions<
  M extends Machine<any>,
  T extends Functions<Context<M>>
>(
  machine: M,
  overrides: T
): Machine<Context<M>> & Omit<M, "context" | keyof T> & T {
  // 1. Separate the original machine's context from its transitions.
  const { context, ...originalTransitions } = machine;

  // 2. Merge the original transitions with the new/overriding ones.
  //    The properties in 'overrides' will take precedence.
  const newTransitions = { ...originalTransitions, ...overrides };

  // 3. Create a new machine with the original context and the merged transitions.
  //    The cast is safe because we have programmatically constructed the object
  //    to match the complex return type.
  return createMachine(context, newTransitions) as any;
}

/**
 * Creates a new machine instance with an updated context, preserving all original transitions.
 * This is a fundamental utility for applying state changes immutably.
 *
 * @template M - The machine type.
 * @param {M} machine - The original machine instance.
 * @param {Context<M> | ((ctx: Readonly<Context<M>>) => Context<M>)} newContextOrFn -
 *   Either the new context object directly, or a function that receives the old
 *   context and returns the new one.
 * @returns {M} A new machine instance of the same type with the updated context.
 * @example
 * const counter = createMachine({ count: 0 }, {
 *   increment: function() { return setContext(this, { count: this.count + 1 }) }
 * });
 *
 * // Using a direct object
 * const resetCounter = setContext(counter, { count: 0 });
 *
 * // Using an updater function
 * const nextCounter = setContext(counter, (ctx) => ({ count: ctx.count + 1 }));
 *
 * console.log(resetCounter.context.count); // 0
 * console.log(nextCounter.context.count); // 1
 */
export function setContext<M extends Machine<any>>(
  machine: M,
  newContextOrFn: Context<M> | ((ctx: Readonly<Context<M>>) => Context<M>)
): M {
  const { context, ...transitions } = machine;
  const newContext =
    typeof newContextOrFn === "function"
      ? (newContextOrFn as (ctx: Readonly<Context<M>>) => Context<M>)(context)
      : newContextOrFn;

  return createMachine(newContext, transitions) as M;
}

/**
 * Creates a new machine by adding new transition functions to an existing machine.
 *
 * This utility safely extends a machine's capabilities without altering its existing
 * transitions. It will produce a compile-time error if you attempt to add a
 * transition that already exists.
 *
 * For overwriting existing transitions, see `overrideTransitions`.
 *
 * @template M - The original machine type.
 * @template T - An object of new transition functions. The keys must not exist in M.
 * @param {M} machine - The base machine instance.
 * @param {T} newTransitions - An object containing the new transition functions to add.
 * @returns {M & T} A new machine instance with the combined original and new transitions.
 * @example
 * const counter = createMachine({ count: 0 }, {
 *   increment: function() { return setContext(this, c => ({ count: c.count + 1 })) },
 * });
 *
 * const extendedCounter = extendTransitions(counter, {
 *   decrement: function() { return setContext(this, c => ({ count: c.count - 1 })) },
 *   reset: function() { return setContext(this, { count: 0 }) },
 * });
 *
 * const s1 = extendedCounter.increment();   // Original method works
 * const s2 = s1.decrement();              // New method works
 * console.log(s2.context.count); // 0
 *
 * // This would be a TypeScript error:
 * // extendTransitions(counter, {
 * //   increment: function() { ... } // Error: 'increment' already exists on counter
 * // });
 */
export function extendTransitions<
  M extends Machine<any>,
  T extends Functions<Context<M>> & {
    // This constraint ensures that no key in T can also be a key in M's transitions.
    [K in keyof T]: K extends keyof M ? never : T[K];
  }
>(machine: M, newTransitions: T): M & T {
  const { context, ...originalTransitions } = machine;

  // Merge the transitions. Since the types guarantee no overlap, this is safe.
  const combinedTransitions = { ...originalTransitions, ...newTransitions };

  return createMachine(context, combinedTransitions) as M & T;
}

/ src/primitives.ts

export const META_KEY = Symbol("MachineMeta");

// We now store the target as a class constructor type.
export interface TransitionMeta {
  target?: new (...args: any) => any;
  guards?: { name: string; description?: string }[];
  invoke?: {
    src: string;
    onDone: new (...args: any) => any;
    onError: new (...args: any) => any;
  };
}

export type WithMeta<
  F extends (...args: any[]) => any,
  M extends TransitionMeta
> = F & { [META_KEY]: M };

// --- Primitives ---

/**
 * Defines a transition to a target state, using the target's class constructor.
 */
export function transitionTo<T extends new (...args: any) => any, F extends (...args: any[]) => any>(
  target: T,
  implementation: F
): WithMeta<F, { target: T }> {
  return implementation as any;
}

/**
 * Adds a guard condition to a transition.
 */
export function guarded<F extends (...args: any[]) => any, M extends TransitionMeta>(
  guard: { name: string; description?: string },
  transition: WithMeta<F, M>
): WithMeta<F, M & { guards: [typeof guard] }> {
  return transition as any;
}

/**
 * Defines an invoked service using class constructors for onDone/onError.
 */
export function invoke<
  D extends new (...args: any) => any,
  E extends new (...args: any) => any,
  F extends (...args: any[]) => any
>(
  service: { src: string; onDone: D; onError: E },
  implementation: F
): WithMeta<F, { invoke: typeof service }> {
  return implementation as any;
}