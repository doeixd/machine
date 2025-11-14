/**
 * A utility type that represents either a value of type T or a Promise that resolves to T.
 * @template T - The value type
 */
type MaybePromise<T> = T | Promise<T>

// /**
//  * A record of synchronous state transition functions.
//  * Each function receives the machine context as `this` and returns a new Machine state.
//  * @template C - The context object type
//  */
// type Functions<C extends object> =
//   Record<string, (this: C, ...args: any[]) => Machine<C>>

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




type Functions<C extends object> =
  Record<string, (this: C, ...args: any[]) => Machine<any>>

// Simple counter example using the functional API
// Note: In the real library, transition functions receive context as `this`
const counterFns = {
  increment: function() {
    // `this` is bound to the context by the library
    return createMachine({ count: (this as any).count + 1 }, counterFns);
  },
  decrement: function() {
    // `this` is bound to the context by the library
    return createMachine({ count: (this as any).count - 1 }, counterFns);
  }
};

const counter = createMachine(
  { count: 0 },
  counterFns
);

// Test by calling with proper context binding
const result = counterFns.increment.call(counter.context);
console.log('Result:', result.context.count);