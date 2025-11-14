/**
 * @file A collection of high-level, type-safe utility functions for @doeixd/machine.
 * @description These helpers provide ergonomic improvements for common patterns like
 * state checking, event creation, debugging, and composing transitions.
 */

import {
  Machine,
  AsyncMachine,
  MaybePromise,
  Context,
  Event,
  Transitions,
  TransitionArgs,
  setContext,
} from './index'; // Assuming index.ts is in the same directory

// =============================================================================
// SECTION: STATE & TYPE GUARDS
// =============================================================================

/**
 * A type representing a Class Constructor, used for type guards.
 */
type ClassConstructor = new (...args: any[]) => any;

/**
 * A type-safe way to check if a machine is in a specific state, acting as a Type Guard.
 * This is the preferred way to do state checking when using class-based machines.
 *
 * @template T - The class constructor type to check against.
 * @param machine - The machine instance to check.
 * @param machineClass - The class constructor representing the state.
 * @returns {boolean} `true` if the machine is an instance of the class, narrowing its type.
 *
 * @example
 * declare const machine: LoggedInMachine | LoggedOutMachine;
 *
 * if (isState(machine, LoggedInMachine)) {
 *   // `machine` is now correctly typed as LoggedInMachine
 *   machine.logout();
 * }
 */
export function isState<T extends ClassConstructor>(
  machine: any,
  machineClass: T
): machine is InstanceType<T> {
  return machine instanceof machineClass;
}


// =============================================================================
// SECTION: EVENT & DISPATCH HELPERS
// =============================================================================

/**
 * A type-safe factory function for creating event objects for `runMachine`.
 * This provides full autocompletion and type checking for event names and their arguments.
 *
 * @template M - The machine type the event belongs to.
 * @template K - The specific event name (transition method name).
 * @param type - The name of the event (e.g., "increment").
 * @param args - The arguments for that event, correctly typed.
 * @returns A type-safe event object ready to be passed to `dispatch`.
 *
 * @example
 * // Given: type MyMachine = Machine<{...}> & { add: (n: number) => any }
 * const event = createEvent<MyMachine, 'add'>('add', 5);
 * // `event` is correctly typed as { type: "add"; args: [number] }
 *
 * await runner.dispatch(event);
 */
export function createEvent<
  M extends Machine<any>,
  K extends keyof Transitions<M> & string
>(type: K, ...args: TransitionArgs<M, K>): Event<M> {
  return { type, args } as unknown as Event<M>;
}


// =============================================================================
// SECTION: CONTEXT & STATE MANIPULATION
// =============================================================================

/**
 * Creates a new machine instance by shallowly merging a partial context into the
 * current context, preserving all original transitions.
 *
 * @template M - The machine type.
 * @param machine - The original machine instance.
 * @param partialContext - An object with a subset of context properties to update.
 * @returns A new machine instance of the same type with the merged context.
 *
 * @example
 * const user = new User({ name: 'Alex', age: 30, status: 'active' });
 * const updatedUser = mergeContext(user, { status: 'inactive' });
 * // updatedUser.context is { name: 'Alex', age: 30, status: 'inactive' }
 */
export function mergeContext<M extends Machine<any>>(
  machine: M,
  partialContext: Partial<Context<M>>
): M {
  return setContext(machine, (ctx) => ({ ...ctx, ...partialContext }));
}


// =============================================================================
// SECTION: COMPOSITION & DEBUGGING
// =============================================================================

/**
 * Sequentially applies a series of transitions to a machine.
 * This function correctly handles both synchronous and asynchronous transitions,
 * always returning a Promise with the final machine state.
 *
 * @template M - The machine type, must be compatible with AsyncMachine.
 * @param initialMachine - The starting machine state.
 * @param transitions - An array of functions, each taking a machine and returning the next.
 * @returns A `Promise` that resolves to the final machine state after all transitions complete.
 *
 * @example
 * const finalState = await pipeTransitions(
 *   new Counter({ count: 0 }),
 *   (m) => m.increment(),        // sync
 *   (m) => m.addAsync(5),        // async
 *   (m) => m.increment()         // sync
 * );
 * // finalState.context.count will be 6
 */
export async function pipeTransitions<M extends AsyncMachine<any>>(
  initialMachine: M,
  ...transitions: ((m: M) => MaybePromise<M>)[]
): Promise<M> {
  let current: M = initialMachine;
  for (const transitionFn of transitions) {
    current = await transitionFn(current);
  }
  return current;
}

/**
 * A "tap" utility for logging a machine's context without interrupting a chain of operations.
 * It prints the context to the console and returns the machine instance unchanged.
 *
 * @template M - The machine type.
 * @param machine - The machine instance to log.
 * @param label - An optional label to print before the context object.
 * @returns The original, unmodified machine instance.
 *
 * @example
 * import { logState as tap } from './utils';
 *
 * await pipeTransitions(
 *   new Counter({ count: 0 }),
 *   tap, // Logs: { count: 0 }
 *   (m) => m.increment(),
 *   (m) => tap(m, 'After increment:') // Logs: After increment: { count: 1 }
 * );
 */
export function logState<M extends Machine<any>>(machine: M, label?: string): M {
   if (label) {
     console.log(label, machine.context);
   } else {
     console.log(machine.context);
   }
   return machine;
}

// =============================================================================
// SECTION: TRANSITION BINDING HELPERS
// =============================================================================

/**
 * Calls a transition function with an explicit `this` context.
 * Useful for invoking transition methods with proper context binding.
 *
 * @template C - The context type that the function expects as `this`.
 * @template F - The function type with a `this` parameter.
 * @template A - The argument types for the function.
 * @param fn - The transition function to call.
 * @param context - The context object to bind as `this`.
 * @param args - Arguments to pass to the function.
 * @returns The result of calling the function with the given context and arguments.
 *
 * @example
 * type MyContext = { count: number };
 * const increment = function(this: MyContext) { return this.count + 1; };
 * const result = call(increment, { count: 5 }); // Returns 6
 *
 * // Particularly useful with machine transitions:
 * import { call } from '@doeixd/machine/utils';
 * const nextMachine = yield* step(call(m.increment, m.context));
 */
export function call<C, F extends (this: C, ...args: any[]) => any>(
  fn: F,
  context: C,
  ...args: Parameters<F> extends [any, ...infer Rest] ? Rest : never
): ReturnType<F> {
  return fn.apply(context, args);
}

/**
 * Binds all transition methods of a machine to its context automatically.
 * Returns a Proxy that intercepts method calls and binds them to `machine.context`.
 * This eliminates the need to use `.call(m.context, ...)` for every transition.
 *
 * Automatically recursively wraps returned machines, enabling seamless chaining
 * in generator-based flows.
 *
 * @template M - The machine type with a `context` property and transition methods.
 * @param machine - The machine instance to wrap.
 * @returns A Proxy of the machine where all callable properties (transitions) are automatically bound to the machine's context.
 *
 * @example
 * type CounterContext = { count: number };
 * const counter = bindTransitions(createMachine({ count: 0 }, {
 *   increment(this: CounterContext) { return createCounter(this.count + 1); }
 * }));
 *
 * // Now you can call transitions directly without .call():
 * const next = counter.increment(); // Works! This is automatically bound.
 *
 * // Particularly useful with generators:
 * const result = run(function* (m) {
 *   m = yield* step(m.increment());     // Clean syntax
 *   m = yield* step(m.add(5));          // No .call() needed
 *   return m;
 * }, bindTransitions(counter));
 *
 * @remarks
 * The Proxy preserves all original properties and methods. Non-callable properties
 * are accessed directly from the machine. Callable properties are wrapped to bind
 * them to `machine.context` before invocation. Returned machines are automatically
 * re-wrapped to maintain binding across transition chains.
 */
export function bindTransitions<M extends { context: any }>(machine: M): M {
  return new Proxy(machine, {
    get(target, prop) {
      const value = target[prop as keyof M];
      
      // If it's a callable property (transition method), bind it to context
      if (typeof value === 'function') {
        return function(...args: any[]) {
          const result = value.apply(target.context, args);
          // Recursively wrap returned machines to maintain binding
          if (result && typeof result === 'object' && 'context' in result) {
            return bindTransitions(result);
          }
          return result;
        };
      }
      
      // Otherwise, return the value as-is
      return value;
    },
  }) as M;
}

/**
 * A strongly-typed wrapper class for binding transitions to machine context.
 * Unlike the Proxy-based `bindTransitions`, this class preserves full type safety
 * and provides better IDE support through explicit property forwarding.
 *
 * @template M - The machine type with a `context` property and transition methods.
 *
 * @example
 * type CounterContext = { count: number };
 * const counter = createMachine({ count: 0 }, {
 *   increment(this: CounterContext) { return createCounter(this.count + 1); }
 * });
 *
 * const bound = new BoundMachine(counter);
 *
 * // All transitions are automatically bound to context
 * const result = run(function* (m) {
 *   m = yield* step(m.increment());
 *   m = yield* step(m.add(5));
 *   return m.context.count;
 * }, bound);
 *
 * @remarks
 * Advantages over Proxy-based `bindTransitions`:
 * - Full type safety with TypeScript's type system
 * - Returned machines are automatically re-wrapped
 * - Better IDE autocompletion and hover information
 * - No type casting needed
 *
 * Disadvantages:
 * - Requires explicit instance creation: `new BoundMachine(m)` vs `bindTransitions(m)`
 * - Not a transparent drop-in replacement for the original machine
 */
export class BoundMachine<M extends { context: any }> {
  private readonly wrappedMachine: M;
  [key: string | symbol]: any;

  constructor(machine: M) {
    this.wrappedMachine = machine;

    // Create a proxy to intercept property access
    return new Proxy(this, {
      get: (target, prop) => {
        // Handle direct property access to wrapped machine
        if (prop === 'wrappedMachine' || prop === 'context') {
          return Reflect.get(target, prop);
        }

        const value = this.wrappedMachine[prop as keyof M];

        // Bind transition methods to context
        if (typeof value === 'function') {
          return (...args: any[]) => {
            const result = value.apply(this.wrappedMachine.context, args);
            // Recursively wrap returned machines
            if (result && typeof result === 'object' && 'context' in result) {
              return new BoundMachine(result);
            }
            return result;
          };
        }

        // Return non-function properties directly
        return value;
      },
    }) as any;
  }

  /**
   * Access the underlying machine's context directly.
   */
  get context(): M extends { context: infer C } ? C : never {
    return this.wrappedMachine.context;
  }
}