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