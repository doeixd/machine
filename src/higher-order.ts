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

import {
  MachineBase,
  Machine,
  Transitions,
  // AsyncMachine,
  setContext,
  Context,
  // MaybePromise,
} from './index'; // Assuming this is a sibling package or in the same project

// =============================================================================
// SECTION 1: CUSTOM PRIMITIVES FOR COMPOSITION
// =============================================================================

/**
 * A type utility to infer the child machine type from a parent.
 */
type ChildMachine<P> = P extends MachineBase<{ child: infer C }> ? C : never;

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
      const newChildState = child[actionName](...args);
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
  K extends keyof Context<M>
>(
  prop: K
): (this: M) => M {
  return function(this: M): M {
    // Ensure the property is boolean-like for a sensible toggle
    if (typeof this.context[prop] !== 'boolean') {
      console.warn(`[toggle primitive] Property '${String(prop)}' is not a boolean. Toggling may have unexpected results.`);
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

export type Fetcher<T, _E = Error> = (params: any) => Promise<T>;
export type OnSuccess<T> = (data: T) => void;
export type OnError<E> = (error: E) => void;

export interface FetchMachineConfig<T, E = Error> {
  fetcher: Fetcher<T, E>;
  initialParams?: any;
  maxRetries?: number;
  onSuccess?: OnSuccess<T>;
  onError?: OnError<E>;
}

// --- Contexts for Fetch States ---
type IdleContext = { status: 'idle' };
type LoadingContext = { status: 'loading'; abortController: AbortController; attempts: number };
type RetryingContext = { status: 'retrying'; error: any; attempts: number };
type SuccessContext<T> = { status: 'success'; data: T };
type ErrorContext<E> = { status: 'error'; error: E };
type CanceledContext = { status: 'canceled' };

// --- Machine State Classes (internal) ---

class IdleMachine<T, E> extends MachineBase<IdleContext> {
  constructor(private config: FetchMachineConfig<T, E>) { super({ status: 'idle' }); }
  fetch = (params?: any) => new LoadingMachine(this.config, params ?? this.config.initialParams, 1);
}

class LoadingMachine<T, E> extends MachineBase<LoadingContext> {
  constructor(private config: FetchMachineConfig<T, E>, private params: any, attempts: number) {
    super({ status: 'loading', abortController: new AbortController(), attempts });
    this.execute(); // Auto-execute on creation
  }

  private async execute() {
    // This is a "fire-and-forget" call that transitions the machine internally.
    // In a real implementation, this would be managed by an external runner.
    // For this example, we assume an external mechanism calls `succeed`, `fail`, etc.
  }
  
  succeed = (data: T) => {
    this.config.onSuccess?.(data);
    return new SuccessMachine<T, E>(this.config, { status: 'success', data });
  };

  fail = (error: E) => {
    const maxRetries = this.config.maxRetries ?? 3;
    if (this.context.attempts < maxRetries) {
      return new RetryingMachine<T, E>(this.config, this.params, error, this.context.attempts);
    }
    this.config.onError?.(error);
    return new ErrorMachine<T, E>(this.config, { status: 'error', error });
  };
  
  cancel = () => {
    this.context.abortController.abort();
    return new CanceledMachine<T, E>(this.config);
  };
}

class RetryingMachine<T, E> extends MachineBase<RetryingContext> {
  constructor(private config: FetchMachineConfig<T, E>, private params: any, error: E, attempts: number) {
    super({ status: 'retrying', error, attempts });
    // In a real implementation, you'd have a delay here (e.g., exponential backoff)
    // before transitioning to LoadingMachine again.
  }
  
  // This would be called after a delay.
  retry = (params?: any) => new LoadingMachine<T, E>(this.config, params ?? this.params, this.context.attempts + 1);
}

class SuccessMachine<T, E> extends MachineBase<SuccessContext<T>> {
  constructor(private config: FetchMachineConfig<T, E>, context: SuccessContext<T>) { super(context); }
  refetch = (params?: any) => new LoadingMachine(this.config, params ?? this.config.initialParams, 1);
}

class ErrorMachine<T, E> extends MachineBase<ErrorContext<E>> {
  constructor(private config: FetchMachineConfig<T, E>, context: ErrorContext<E>) { super(context); }
  retry = (params?: any) => new LoadingMachine(this.config, params ?? this.config.initialParams, 1);
}

class CanceledMachine<T, E> extends MachineBase<CanceledContext> {
  constructor(private config: FetchMachineConfig<T, E>) { super({ status: 'canceled' }); }
  refetch = (params?: any) => new LoadingMachine(this.config, params ?? this.config.initialParams, 1);
}

export type FetchMachine<T, E = Error> =
  | IdleMachine<T, E>
  | LoadingMachine<T, E>
  | RetryingMachine<T, E>
  | SuccessMachine<T, E>
  | ErrorMachine<T, E>
  | CanceledMachine<T, E>;

/**
 * Creates a pre-built, highly configurable async data-fetching machine.
 *
 * This factory function returns a state machine that handles the entire lifecycle
 * of a data request, including loading, success, error, cancellation, and retries.
 *
 * @template T - The type of the data to be fetched.
 * @template E - The type of the error.
 * @param config - Configuration object.
 * @param config.fetcher - An async function that takes params and returns the data.
 * @param [config.maxRetries=3] - The number of times to retry on failure.
 * @param [config.onSuccess] - Optional callback fired with the data on success.
 * @param [config.onError] - Optional callback fired with the error on final failure.
 * @returns An `IdleMachine` instance, ready to start fetching.
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
 * // let machine = userMachine;
 * // machine = await machine.fetch(123); // Transitions to Loading, then Success/Error
 * ```
 * 
 * @note This is a simplified example. For a real-world implementation, you would
 * typically use this machine with a runner (like `runMachine` or `useMachine`) to
 * manage the async transitions and state updates automatically.
 */
export function createFetchMachine<T, E = Error>(
  config: FetchMachineConfig<T, E>
): FetchMachine<T, E> {
  // A more robust implementation would validate the config here.
  return new IdleMachine<T, E>(config);
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
 * NOTE: This primitive assumes that the transition names between the two
 * machines do not collide. If both machines have a transition named `next`,
 * the behavior is undefined.
 *
 * @param m1 The first machine instance.
 * @param m2 The second machine instance.
 * @returns A new ParallelMachine instance.
 */
export function createParallelMachine<
  M1 extends Machine<any>,
  M2 extends Machine<any>
>(m1: M1, m2: M2): ParallelMachine<M1, M2> {
  // 1. Combine the contexts
  const combinedContext = { ...m1.context, ...m2.context };

  const transitions1 = { ...m1 } as Transitions<M1>;
  const transitions2 = { ...m2 } as Transitions<M2>;
  delete (transitions1 as any).context;
  delete (transitions2 as any).context;

  const combinedTransitions = {} as any;

  // 2. Re-wire transitions from the first machine
  for (const key in transitions1) {
    const transitionFn = (transitions1 as any)[key];
    combinedTransitions[key] = (...args: any[]) => {
      const nextM1 = transitionFn.apply(m1.context, args);
      // Recursively create a new parallel machine with the new M1 state
      return createParallelMachine(nextM1, m2);
    };
  }

  // 3. Re-wire transitions from the second machine
  for (const key in transitions2) {
    const transitionFn = (transitions2 as any)[key];
    combinedTransitions[key] = (...args: any[]) => {
      const nextM2 = transitionFn.apply(m2.context, args);
      // Recursively create a new parallel machine with the new M2 state
      return createParallelMachine(m1, nextM2);
    };
  }

  return {
    context: combinedContext,
    ...combinedTransitions,
  } as ParallelMachine<M1, M2>;
}

// A mapped type that transforms the return types of a machine's transitions.
// For a transition that returns `NewMachineState`, this will transform it to return `T`.
export type RemapTransitions<M extends Machine<any>, T> = {
  [K in keyof Transitions<M>]: Transitions<M>[K] extends (...args: infer A) => any
    ? (...args: A) => T
    : never;
};