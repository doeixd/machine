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