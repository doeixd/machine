/**
 * @file Higher-Level Abstractions for @doeixd/machine
 * @description
 * This module provides a collection of powerful, pre-built patterns and primitives
 * on top of the core `@doeixd/machine` library. These utilities are designed to
 * solve common, recurring problems in state management, such as data fetching,
 * hierarchical state, and toggling boolean context properties.
 *
 * Think of this as the "standard library" of common machine patterns.
 */

import { MachineBase } from './base'; // Import from base to avoid circular dependency
import {
  Machine,
  Transitions,
  // AsyncMachine,
  setContext,
  Context,
  // MaybePromise,
} from './index';

// =============================================================================
// SECTION 1: CUSTOM PRIMITIVES FOR COMPOSITION
// =============================================================================

/**
 * A type utility to infer the child machine type from a parent.
 */
type ChildMachine<P> = P extends MachineBase<{ child: infer C }> ? C : never;

type BooleanKey<T> = {
  [K in keyof T]-?: T[K] extends boolean ? K : never
}[keyof T];

/**
 * Creates a transition method that delegates a call to a child machine.
 *
 * This is a higher-order function that reduces boilerplate when implementing
 * hierarchical state machines. It generates a method for the parent machine that:
 * 1. Checks if the specified action exists on the current child state.
 * 2. If it exists, calls the action on the child.
 * 3. Reconstructs the parent machine with the new child state returned by the action.
 * 4. If the action doesn't exist on the child, it returns the parent machine unchanged.
 *
 * @template P - The parent machine type, which must have a `child` property in its context.
 * @template K - The name of the action on the child machine to delegate to.
 * @param actionName - The string name of the child's transition method.
 * @param ...args - Any arguments to pass to the child's transition method.
 * @returns The parent machine instance, with its `child` state potentially updated.
 *
 * @example
 * ```typescript
 * class Parent extends MachineBase<{ child: ChildMachine }> {
 *   // Instead of writing a manual delegation method...
 *   // save = () => {
 *   //   if ('save' in this.context.child) {
 *   //     const newChild = this.context.child.save();
 *   //     return setContext(this, { child: newChild });
 *   //   }
 *   //   return this;
 *   // }
 *   
 *   // ...you can just use the primitive.
 *   save = delegateToChild('save');
 *   edit = delegateToChild('edit');
 * }
 * ```
 */
export function delegateToChild<
  P extends MachineBase<{ child: MachineBase<any> }>,
  K extends keyof ChildMachine<P> & string
>(
  actionName: K
): (
  ...args: ChildMachine<P>[K] extends (...a: infer A) => any ? A : never
) => P {
  return function(this: P, ...args: any[]): P {
    const child = this.context.child as any;

    if (typeof child[actionName] === 'function') {
      const newChildState = child[actionName].apply(child, args);
      return setContext(this as any, { ...this.context, child: newChildState }) as P;
    }
    
    // If the action is not available on the current child state, do nothing.
    return this;
  };
}

/**
 * Creates a transition method that toggles a boolean property within the machine's context.
 *
 * This is a simple utility to reduce boilerplate for managing boolean flags.
 *
 * @template M - The machine type.
 * @template K - The key of the boolean property in the machine's context.
 * @param prop - The string name of the context property to toggle.
 * @returns A new machine instance with the toggled property.
 *
 * @example
 * ```typescript
 * class SettingsMachine extends MachineBase<{ notifications: boolean; darkMode: boolean }> {
 *   toggleNotifications = toggle('notifications');
 *   toggleDarkMode = toggle('darkMode');
 * }
 * ```
 */
export function toggle<
  M extends MachineBase<any>,
  K extends BooleanKey<Context<M>>
>(
  prop: K
): (this: M) => M {
  return function(this: M): M {
    if (typeof this.context[prop] !== 'boolean') {
      throw new TypeError(`Cannot toggle non-boolean context property '${String(prop)}'.`);
    }
    return setContext(this as any, {
      ...this.context,
      [prop]: !this.context[prop],
    }) as M;
  };
}


// =============================================================================
// SECTION 2: PRE-BUILT, CUSTOMIZABLE MACHINES
// =============================================================================

/**
 * A fully-featured, pre-built state machine for data fetching.
 * It handles loading, success, error states, cancellation, and retry logic out of the box.
 *
 * This machine is highly customizable through its configuration options.
 */

// --- Types for the Fetch Machine ---

/**
 * Abort-aware request function consumed by {@link createFetchMachine}.
 *
 * @typeParam T - Successful data type.
 * @typeParam P - Request parameter type.
 */
export type Fetcher<T, P = unknown> = (
  params: P,
  options: { signal: AbortSignal }
) => Promise<T>;

/**
 * Success callback invoked once when a fetch attempt resolves.
 * @typeParam T - Successful data type.
 */
export type OnSuccess<T> = (data: T) => void;

/**
 * Final-failure callback invoked after the retry budget is exhausted.
 * @typeParam E - Normalized error type.
 */
export type OnError<E> = (error: E) => void;

/**
 * Configuration for {@link createFetchMachine}.
 *
 * @typeParam T - Successful data type.
 * @typeParam E - Normalized error type exposed by error typestates.
 * @typeParam P - Parameters accepted by `fetch`, `retry`, and `refetch`.
 */
export interface FetchMachineConfig<T, E = Error, P = unknown> {
  /** Performs one request and should honor the supplied abort signal. */
  fetcher: Fetcher<T, P>;
  /** Used when a transition does not supply explicit parameters. */
  initialParams?: P;
  /** Retries available after the first failed attempt. Defaults to `3`. */
  maxRetries?: number;
  /** Observes successful data before the success snapshot is returned. */
  onSuccess?: OnSuccess<T>;
  /** Observes the normalized error after no retries remain. */
  onError?: OnError<E>;
  /** Converts unknown thrown values into the declared error type. */
  mapError?: (error: unknown) => E;
}

// --- Contexts for Fetch States ---
type IdleContext = { status: 'idle' };
type LoadingContext = { status: 'loading'; abortController: AbortController; attempts: number };
type RetryingContext<E> = { status: 'retrying'; error: E; attempts: number };
type SuccessContext<T> = { status: 'success'; data: T };
type ErrorContext<E> = { status: 'error'; error: E };
type CanceledContext = { status: 'canceled' };

// --- Machine State Classes (internal) ---

class IdleMachine<T, E, P> extends MachineBase<IdleContext> {
  constructor(private config: FetchMachineConfig<T, E, P>) { super({ status: 'idle' }); }
  fetch = (params?: P) => new LoadingMachine(this.config, selectParams(params, this.config.initialParams), 1);
}

type LoadingResult<T, E, P> = SuccessMachine<T, E, P> | RetryingMachine<T, E, P> | ErrorMachine<T, E, P> | CanceledMachine<T, E, P>;

class LoadingMachine<T, E, P> extends MachineBase<LoadingContext> {
  private readonly completion: Promise<LoadingResult<T, E, P>>;

  constructor(private config: FetchMachineConfig<T, E, P>, private params: P, attempts: number) {
    super({ status: 'loading', abortController: new AbortController(), attempts });
    this.completion = this.execute();
  }

  /** Resolves to the typestate produced by the configured fetch operation. */
  done = (): Promise<LoadingResult<T, E, P>> => this.completion;

  private async execute(): Promise<LoadingResult<T, E, P>> {
    try {
      const data = await this.config.fetcher(this.params, {
        signal: this.context.abortController.signal,
      });
      if (this.context.abortController.signal.aborted) {
        return new CanceledMachine(this.config);
      }
      return this.succeed(data);
    } catch (cause) {
      if (this.context.abortController.signal.aborted) {
        return new CanceledMachine(this.config);
      }
      const error = this.config.mapError ? this.config.mapError(cause) : cause as E;
      return this.fail(error);
    }
  }
  
  succeed = (data: T) => {
    this.config.onSuccess?.(data);
    return new SuccessMachine<T, E, P>(this.config, { status: 'success', data });
  };

  fail = (error: E) => {
    const maxRetries = this.config.maxRetries ?? 3;
    if (this.context.attempts <= maxRetries) {
      return new RetryingMachine<T, E, P>(this.config, this.params, error, this.context.attempts);
    }
    this.config.onError?.(error);
    return new ErrorMachine<T, E, P>(this.config, { status: 'error', error });
  };
  
  cancel = () => {
    this.context.abortController.abort();
    return new CanceledMachine<T, E, P>(this.config);
  };
}

class RetryingMachine<T, E, P> extends MachineBase<RetryingContext<E>> {
  constructor(private config: FetchMachineConfig<T, E, P>, private params: P, error: E, attempts: number) {
    super({ status: 'retrying', error, attempts });
  }
  
  retry = (params?: P) => new LoadingMachine<T, E, P>(this.config, selectParams(params, this.params), this.context.attempts + 1);
}

class SuccessMachine<T, E, P> extends MachineBase<SuccessContext<T>> {
  constructor(private config: FetchMachineConfig<T, E, P>, context: SuccessContext<T>) { super(context); }
  refetch = (params?: P) => new LoadingMachine(this.config, selectParams(params, this.config.initialParams), 1);
}

class ErrorMachine<T, E, P> extends MachineBase<ErrorContext<E>> {
  constructor(private config: FetchMachineConfig<T, E, P>, context: ErrorContext<E>) { super(context); }
  retry = (params?: P) => new LoadingMachine(this.config, selectParams(params, this.config.initialParams), 1);
}

class CanceledMachine<T, E, P> extends MachineBase<CanceledContext> {
  constructor(private config: FetchMachineConfig<T, E, P>) { super({ status: 'canceled' }); }
  refetch = (params?: P) => new LoadingMachine(this.config, selectParams(params, this.config.initialParams), 1);
}

function selectParams<P>(provided: P | undefined, fallback: P | undefined): P {
  return (provided === undefined ? fallback : provided) as P;
}

/**
 * Complete typestate union returned by {@link createFetchMachine} transitions.
 *
 * Narrow `context.status` before calling state-specific operations such as
 * `done`, `retry`, `cancel`, or `refetch`.
 *
 * @typeParam T - Successful data type.
 * @typeParam E - Normalized error type.
 * @typeParam P - Request parameter type.
 */
export type FetchMachine<T, E = Error, P = unknown> =
  | IdleMachine<T, E, P>
  | LoadingMachine<T, E, P>
  | RetryingMachine<T, E, P>
  | SuccessMachine<T, E, P>
  | ErrorMachine<T, E, P>
  | CanceledMachine<T, E, P>;

/**
 * Creates a pre-built, highly configurable async data-fetching machine.
 *
 * This factory function returns a state machine that handles the entire lifecycle
 * of a data request, including loading, success, error, cancellation, and retries.
 *
 * @template T - The type of the data to be fetched.
 * @template E - The type of the error.
 * @template P - The type of parameters accepted by fetch operations.
 * @param config - Configuration object.
 * @param config.fetcher - An async function that takes params and returns the data.
 * @param [config.maxRetries=3] - The number of times to retry on failure.
 * @param [config.onSuccess] - Optional callback fired with the data on success.
 * @param [config.onError] - Optional callback fired with the error on final failure.
 * @param [config.mapError] - Converts an unknown thrown value to `E`.
 * @returns An `IdleMachine` instance, ready to start fetching.
 * @throws {TypeError} If `config.fetcher` is not a function.
 * @throws {RangeError} If `maxRetries` is negative or not an integer.
 *
 * @example
 * ```typescript
 * // 1. Define your data fetching logic
 * async function fetchUser(id: number): Promise<{ id: number; name: string }> {
 *   const res = await fetch(`/api/users/${id}`);
 *   if (!res.ok) throw new Error('User not found');
 *   return res.json();
 * }
 *
 * // 2. Create the machine
 * const userMachine = createFetchMachine({
 *   fetcher: fetchUser,
 *   onSuccess: (user) => console.log(`Fetched: ${user.name}`),
 * });
 *
 * // 3. Use it (e.g., in a React hook)
 * if (userMachine.context.status === 'idle') {
 *   const loading = userMachine.fetch(123);
 *   const result = await loading.done();
 * }
 * ```
 * 
 * @note This is a simplified example. For a real-world implementation, you would
 * typically use this machine with a runner (like `runMachine` or `useMachine`) to
 * manage the async transitions and state updates automatically.
 */
export function createFetchMachine<T, E = Error, P = unknown>(
  config: FetchMachineConfig<T, E, P>
): FetchMachine<T, E, P> {
  if (typeof config.fetcher !== 'function') {
    throw new TypeError('createFetchMachine requires a fetcher function.');
  }
  if (config.maxRetries !== undefined && (!Number.isInteger(config.maxRetries) || config.maxRetries < 0)) {
    throw new RangeError('maxRetries must be a non-negative integer.');
  }
  return new IdleMachine<T, E, P>(config);
}

/**
 * The core type for a Parallel Machine.
 * It combines two machines, M1 and M2, into a single, unified type.
 * @template M1 - The first machine in the parallel composition.
 * @template M2 - The second machine in the parallel composition.
 */
export type ParallelMachine<
  M1 extends Machine<any>,
  M2 extends Machine<any>
> = Machine<Context<M1> & Context<M2>> & {
  // Map transitions from M1. When called, they return a new ParallelMachine
  // where M1 has transitioned but M2 remains the same.
  [K in keyof Transitions<M1>]: Transitions<M1>[K] extends (...args: infer A) => infer R
    ? R extends Machine<any>
      ? (...args: A) => ParallelMachine<R, M2>
      : never
    : never;
} & {
  // Map transitions from M2. When called, they return a new ParallelMachine
  // where M2 has transitioned but M1 remains the same.
  [K in keyof Transitions<M2>]: Transitions<M2>[K] extends (...args: infer A) => infer R
    ? R extends Machine<any>
      ? (...args: A) => ParallelMachine<M1, R>
      : never
    : never;
};


/**
 * Creates a parallel machine by composing two independent machines.
 *
 * This function takes two machines and merges them into a single machine entity.
 * Transitions from either machine can be called, and they will only affect
 * their respective part of the combined state.
 *
 * Transition names must be unique across the two machines. A collision throws
 * instead of silently choosing one implementation.
 *
 * @param m1 The first machine instance.
 * @param m2 The second machine instance.
 * @returns A new ParallelMachine instance.
 * @throws {Error} If the inputs share a context key or transition name.
 * @typeParam M1 - First machine type.
 * @typeParam M2 - Second machine type.
 *
 * @example
 * ```ts
 * const combined = createParallelMachine(counter, panel);
 * const updated = combined.increment().toggle();
 * ```
 */
export function createParallelMachine<
  M1 extends Machine<any>,
  M2 extends Machine<any>
>(m1: M1, m2: M2): ParallelMachine<M1, M2> {
  // 1. Combine the contexts
  const contextCollision = Object.keys(m1.context).find(key => key in m2.context);
  if (contextCollision) {
    throw new Error(`Cannot compose parallel machines: context key '${contextCollision}' exists on both machines.`);
  }
  const combinedContext = { ...m1.context, ...m2.context };

  const transitions1 = collectTransitions(m1) as unknown as Transitions<M1>;
  const transitions2 = collectTransitions(m2) as unknown as Transitions<M2>;

  const collision = Object.keys(transitions1).find(key => key in transitions2);
  if (collision) {
    throw new Error(`Cannot compose parallel machines: transition '${collision}' exists on both machines.`);
  }

  const combinedTransitions = {} as any;

  // 2. Re-wire transitions from the first machine
  for (const key in transitions1) {
    const transitionFn = (transitions1 as any)[key];
    combinedTransitions[key] = (...args: any[]) => {
      const nextM1 = transitionFn.apply(m1, args);
      // Recursively create a new parallel machine with the new M1 state
      return createParallelMachine(nextM1, m2);
    };
  }

  // 3. Re-wire transitions from the second machine
  for (const key in transitions2) {
    const transitionFn = (transitions2 as any)[key];
    combinedTransitions[key] = (...args: any[]) => {
      const nextM2 = transitionFn.apply(m2, args);
      // Recursively create a new parallel machine with the new M2 state
      return createParallelMachine(m1, nextM2);
    };
  }

  return {
    context: combinedContext,
    ...combinedTransitions,
  } as ParallelMachine<M1, M2>;
}

function collectTransitions(machine: Machine<any>): Record<string, (...args: any[]) => any> {
  const transitions: Record<string, (...args: any[]) => any> = {};
  let current: object | null = machine;

  while (current && current !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (key === 'constructor' || key === 'context' || key in transitions) continue;
      const value = (machine as Record<string, unknown>)[key];
      if (typeof value === 'function') transitions[key] = value as (...args: any[]) => any;
    }
    current = Object.getPrototypeOf(current);
  }

  return transitions;
}

/**
 * Rewrites every transition return type while retaining its name and parameters.
 *
 * @typeParam M - Machine whose transitions are inspected.
 * @typeParam T - Replacement return type for every transition.
 * @example
 * ```ts
 * type Chained = RemapTransitions<typeof counter, Controller>;
 * ```
 */
export type RemapTransitions<M extends Machine<any>, T> = {
  [K in keyof Transitions<M>]: Transitions<M>[K] extends (...args: infer A) => any
    ? (...args: A) => T
    : never;
};
