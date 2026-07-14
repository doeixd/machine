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
  createMachine,
} from './index'; // Assuming index.ts is in the same directory

// =============================================================================
// SECTION: STATE & TYPE GUARDS
// =============================================================================

/**
 * A type representing a Class Constructor, used for type guards.
 */
type ClassConstructor = new (...args: any[]) => any;

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return value !== null
    && (typeof value === 'object' || typeof value === 'function')
    && typeof (value as PromiseLike<T>).then === 'function';
}

function isMachineLike(value: unknown): value is { context: any } {
  return value !== null && typeof value === 'object' && 'context' in value;
}

function collectTransitionNames(machine: object): string[] {
  const names = new Set<string>();
  let current: object | null = machine;

  while (current && current !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name === 'constructor' || name === 'context' || names.has(name)) continue;
      if (typeof (machine as Record<string, unknown>)[name] === 'function') names.add(name);
    }
    current = Object.getPrototypeOf(current);
  }

  return [...names];
}

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

/**
 * A generic combinator that creates transition functions from pure context transformers.
 * This enables writing transitions as simple, testable functions that only transform context,
 * while automatically handling the machine creation boilerplate.
 *
 * @template C - The context object type.
 * @template TArgs - The argument types for the transition function.
 * @param getTransitions - A function that returns the transition functions object to use for the new machine.
 * @param transformer - A pure function that transforms the context based on the current state and arguments.
 * @returns A transition function that can be used as a machine method.
 *
 * @example
 * ```typescript
 * // Define transitions object with self-reference
 * const counterTransitions = {
 *   increment: createTransition(
 *     () => counterTransitions,
 *     (ctx) => ({ count: ctx.count + 1 })
 *   ),
 *   add: createTransition(
 *     () => counterTransitions,
 *     (ctx, n: number) => ({ count: ctx.count + n })
 *   )
 * };
 *
 * // Create machine
 * const counter = createMachine({ count: 0 }, counterTransitions);
 *
 * // Use transitions
 * const incremented = counter.increment(); // { count: 1 }
 * const added = incremented.add(5);       // { count: 6 }
 * ```
 *
 * @example
 * ```typescript
 * // With class-based machines
 * class Counter extends MachineBase<{ count: number }> {
 *   constructor(count = 0) {
 *     super({ count });
 *   }
 *
 *   increment = createTransition(
 *     () => ({ increment: this.increment, add: this.add }),
 *     (ctx) => ({ count: ctx.count + 1 })
 *   );
 *
 *   add = createTransition(
 *     () => ({ increment: this.increment, add: this.add }),
 *     (ctx, n: number) => ({ count: ctx.count + n })
 *   );
 * }
 * ```
 *
 * @remarks
 * This function promotes the library's philosophy of pure, immutable transitions.
 * The transformer function should be pure and only depend on its parameters.
 * The returned transition function automatically creates a new machine instance,
 * preserving all transitions while updating only the context.
 * The getTransitions function is called lazily to avoid circular reference issues.
 */
export function createTransition<
  C extends object,
  TArgs extends any[]
>(
  getTransitions: () => Record<string, (this: Machine<C, any>, ...args: any[]) => any>,
  transformer: (ctx: C, ...args: TArgs) => C
): (this: { context: C }, ...args: TArgs) => Machine<C> {
  return function (this: { context: C }, ...args: TArgs): Machine<C> {
    const nextContext = transformer(this.context, ...args);
    return createMachine(nextContext, getTransitions());
  };
}

// =============================================================================
// SECTION: TRANSITION BINDING HELPERS
// =============================================================================

/**
 * Calls a transition function with an explicit `this` binding.
 * Useful for invoking transition methods with proper machine binding.
 *
 * @template M - The machine type that the function expects as `this`.
 * @template F - The function type with a `this` parameter.
 * @template A - The argument types for the function.
 * @param fn - The transition function to call.
 * @param machine - The machine object to bind as `this`.
 * @param args - Arguments to pass to the function.
 * @returns The result of calling the function with the given machine and arguments.
 *
 * @example
 * type MyMachine = Machine<{ count: number }>;
 * const increment = function(this: MyMachine) { return createMachine({ count: this.context.count + 1 }, this); };
 * const result = call(increment, machine); // Returns new machine
 *
 * // Particularly useful with machine transitions:
 * import { call } from '@doeixd/machine/utils';
 * const nextMachine = yield* step(call(m.increment, m));
 */
export function call<M extends Machine<any>, F extends (this: M, ...args: any[]) => any>(
  fn: F,
  machine: M,
  ...args: Parameters<F> extends [any, ...infer Rest] ? Rest : never
): ReturnType<F> {
  return fn.apply(machine, args);
}

/**
 * Binds all transition methods of a machine to the machine itself automatically.
 * Returns a Proxy that intercepts method calls and binds them to the full machine.
 * This eliminates the need to use `.call(m, ...)` for every transition.
 *
 * Automatically recursively wraps returned machines, enabling seamless chaining
 * in generator-based flows.
 *
 * @template M - The machine type with a `context` property and transition methods.
 * @param machine - The machine instance to wrap.
 * @returns A Proxy of the machine where all callable properties (transitions) are automatically bound to the machine.
 *
 * @example
 * type CounterMachine = Machine<{ count: number }>;
 * const counter = bindTransitions(createMachine({ count: 0 }, {
 *   increment(this: CounterMachine) { return createMachine({ count: this.context.count + 1 }, this); }
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
 * them to the machine before invocation. Returned machines are automatically
 * re-wrapped to maintain binding across transition chains.
 */
export function bindTransitions<M extends { context: any }>(machine: M): M {
  return new Proxy(machine, {
    get(target, prop) {
      const value = target[prop as keyof M];

      // If it's a callable property (transition method), bind it to machine
      if (typeof value === 'function') {
        return function(...args: any[]) {
          const result = value.apply(target, args);
          if (isPromiseLike(result)) {
            return Promise.resolve(result).then(resolved =>
              isMachineLike(resolved) ? bindTransitions(resolved) : resolved
            );
          }
          // Recursively wrap returned machines to maintain binding
          if (isMachineLike(result)) {
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
 * A strongly-typed wrapper class for binding transitions to the machine.
 * Unlike the Proxy-based `bindTransitions`, this class preserves full type safety
 * and provides better IDE support through explicit property forwarding.
 *
 * @template M - The machine type with a `context` property and transition methods.
 *
 * @example
 * type CounterMachine = Machine<{ count: number }>;
 * const counter = createMachine({ count: 0 }, {
 *   increment(this: CounterMachine) { return createMachine({ count: this.context.count + 1 }, this); }
 * });
 *
 * const bound = new BoundMachine(counter);
 *
 * // All transitions are automatically bound to machine
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
        if (prop === 'wrappedMachine') {
          return Reflect.get(target, prop);
        }
        if (prop === 'context') {
          return this.wrappedMachine.context;
        }

        const value = this.wrappedMachine[prop as keyof M];

        // Bind transition methods to machine
        if (typeof value === 'function') {
          return (...args: any[]) => {
            const result = value.apply(this.wrappedMachine, args);
            if (isPromiseLike(result)) {
              return Promise.resolve(result).then(resolved =>
                isMachineLike(resolved) ? new BoundMachine(resolved) : resolved
              );
            }
            // Recursively wrap returned machines
            if (isMachineLike(result)) {
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
}

/**
 * Creates a sequence machine that orchestrates multi-step flows by automatically
 * advancing through a series of machines. When the current machine reaches a "final"
 * state (determined by the isFinal predicate), the sequence automatically transitions
 * to the next machine in the sequence.
 *
 * This implementation uses a functional approach with object delegation rather than Proxy.
 */
function createSequenceMachine<
  M extends readonly [Machine<any>, ...Machine<any>[]]
>(
  machines: M,
  isFinal: (machine: M[number]) => boolean
): M[number] {
  if (machines.length === 0) {
    throw new Error('Sequence must contain at least one machine');
  }

  let currentIndex = 0;
  let currentMachine = machines[0];

  const createDelegationObject = (machine: M[number]) => {
    const delegationObject = Object.create(machine);

    // The context getter returns the machine's own context
    // (machine is the specific machine instance this delegation object represents)
    Object.defineProperty(delegationObject, 'context', {
      get: () => machine.context,
      enumerable: true,
      configurable: true
    });

    // Override all methods to add advancement logic
    const methodNames = collectTransitionNames(machine);

    for (const methodName of methodNames) {
      const methodKey = methodName as keyof any;

      (delegationObject as any)[methodKey] = (...args: unknown[]) => {
        const result = (currentMachine as any)[methodKey](...args);

        // Handle both sync and async results
        const handleResult = (resultMachine: unknown) => {
          return advanceIfNeeded(resultMachine as M[number]);
        };

        // If the result is a Promise, handle it asynchronously
        if (isPromiseLike(result)) {
          return Promise.resolve(result).then(handleResult);
        }

        // Otherwise, handle synchronously
        return handleResult(result);
      };
    }

    return delegationObject;
  };

  const advanceIfNeeded = (machine: M[number]): M[number] => {
    currentMachine = machine;

    // Check if we should advance to the next machine
    if (isFinal(currentMachine) && currentIndex < machines.length - 1) {
      currentIndex++;
      currentMachine = machines[currentIndex];
      // Create a new delegation object for the new currentMachine
      return createDelegationObject(currentMachine);
    }

    return machine;
  };

  return createDelegationObject(currentMachine);
}
/**
 * Creates a sequence machine that orchestrates multi-step flows by automatically
 * advancing through a series of machines. When the current machine reaches a "final"
 * state (determined by the isFinal predicate), the sequence automatically transitions
 * to the next machine in the sequence.
 *
 * This is perfect for wizard-style flows, multi-step processes, or any scenario where
 * you need to chain machines together with automatic progression.
 *
 * @template M - The tuple of machine types in the sequence.
 * @param machines - The machines to sequence, in order.
 * @param isFinal - A predicate function that determines when a machine is in a final state.
 *                  Called after each transition to check if the sequence should advance.
 * @returns A new machine that wraps the sequence, delegating to the current machine
 *          and automatically advancing when each machine reaches its final state.
 *
 * @example
 * ```typescript
 * // Define form machines with final states
 * class NameForm extends MachineBase<{ name: string; valid: boolean }> {
 *   submit = (name: string) => new NameForm({ name, valid: name.length > 0 });
 * }
 *
 * class EmailForm extends MachineBase<{ email: string; valid: boolean }> {
 *   submit = (email: string) => new EmailForm({ email, valid: email.includes('@') });
 * }
 *
 * class PasswordForm extends MachineBase<{ password: string; valid: boolean }> {
 *   submit = (password: string) => new PasswordForm({ password, valid: password.length >= 8 });
 * }
 *
 * // Create sequence that advances when each form becomes valid
 * const wizard = sequence(
 *   [new NameForm({ name: '', valid: false }),
 *    new EmailForm({ email: '', valid: false }),
 *    new PasswordForm({ password: '', valid: false })],
 *   (machine) => machine.context.valid // Advance when valid becomes true
 * );
 *
 * // Usage - automatically advances through forms
 * let current = wizard;
 * current = current.submit('John');     // Still on NameForm (not valid yet)
 * current = current.submit('John Doe'); // Advances to EmailForm (name is valid)
 * current = current.submit('john@');    // Still on EmailForm (not valid yet)
 * current = current.submit('john@example.com'); // Advances to PasswordForm
 * current = current.submit('12345678'); // Advances to end of sequence
 * ```
 *
 * @example
 * ```typescript
 * // Async sequence with API calls
 * const authSequence = sequence(
 *   [new LoginForm(), new TwoFactorForm(), new Dashboard()],
 *   (machine) => machine.context.authenticated === true
 * );
 *
 * // The sequence handles async transitions automatically
 * const finalState = await authSequence.login('user@example.com', 'password');
 * ```
 *
 * @example
 * ```typescript
 * // Complex predicate - advance based on multiple conditions
 * const complexSequence = sequence(
 *   [step1Machine, step2Machine, step3Machine],
 *   (machine) => {
 *     // Advance when all required fields are filled AND validated
 *     return machine.context.requiredFields.every(f => f.filled) &&
 *            machine.context.validationErrors.length === 0;
 *   }
 * );
 * ```
 *
 * @remarks
 * - The sequence maintains the union type of all machines in the sequence
 * - Transitions are delegated to the current machine in the sequence
 * - When a machine reaches a final state, the sequence automatically advances
 * - If the sequence reaches the end, further transitions return the final machine
 * - The isFinal predicate is called after every transition to check advancement
 * - Works with both sync and async machines (returns MaybePromise)
 */
export function sequence<
  M extends readonly [Machine<any>, ...Machine<any>[]]
>(
  machines: M,
  isFinal: (machine: M[number]) => boolean
): M[number] {
  return createSequenceMachine(machines, isFinal);
}

/**
 * Convenience overload for sequencing exactly 2 machines.
 * Provides better type inference and IntelliSense for common 2-step flows.
 *
 * @typeParam M1 - First machine type.
 * @typeParam M2 - Second machine type.
 * @param machine1 - Initial machine in the sequence.
 * @param machine2 - Machine selected after the first satisfies `isFinal`.
 * @param isFinal - Predicate evaluated after transitions to advance the sequence.
 * @returns A proxy exposing the union of both machine APIs.
 *
 * @example
 * ```typescript
 * const flow = sequence2(
 *   new LoginForm(),
 *   new Dashboard(),
 *   (machine) => machine.context.authenticated
 * );
 * ```
 */
export function sequence2<
  M1 extends Machine<any>,
  M2 extends Machine<any>
>(
  machine1: M1,
  machine2: M2,
  isFinal: (machine: M1 | M2) => boolean
): M1 | M2 {
  return sequence([machine1, machine2], isFinal);
}

/**
 * Convenience overload for sequencing exactly 3 machines.
 * Provides better type inference and IntelliSense for common 3-step flows.
 *
 * @typeParam M1 - First machine type.
 * @typeParam M2 - Second machine type.
 * @typeParam M3 - Third machine type.
 * @param machine1 - Initial machine in the sequence.
 * @param machine2 - Second machine in the sequence.
 * @param machine3 - Final machine in the sequence.
 * @param isFinal - Predicate evaluated after transitions to advance the sequence.
 * @returns A proxy exposing the union of all three machine APIs.
 *
 * @example
 * ```typescript
 * const wizard = sequence3(
 *   new NameForm({ name: '', valid: false }),
 *   new EmailForm({ email: '', valid: false }),
 *   new PasswordForm({ password: '', valid: false }),
 *   (machine) => machine.context.valid
 * );
 * ```
 */
export function sequence3<
  M1 extends Machine<any>,
  M2 extends Machine<any>,
  M3 extends Machine<any>
>(
  machine1: M1,
  machine2: M2,
  machine3: M3,
  isFinal: (machine: M1 | M2 | M3) => boolean
): M1 | M2 | M3 {
  return sequence([machine1, machine2, machine3], isFinal);
}
