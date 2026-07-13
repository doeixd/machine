/**
 * @file Type-level primitives for formal state machine verification.
 * @description
 * This file provides a Domain Specific Language (DSL) of transition decorators.
 * These functions serve two purposes:
 * 1. At runtime, they preserve the transition function and attach non-enumerable metadata.
 * 2. At design/build time, they brand transition functions with rich type metadata.
 *
 * This allows a static analysis tool (like `ts-morph`) to read your source code
 * and generate a formal Statechart (JSON) that perfectly matches your implementation,
 * including resolving Class Constructors to their names.
 */

// =============================================================================
// SECTION: CORE METADATA TYPES
// =============================================================================

/**
 * Options passed to async transition functions, including cancellation support.
 */
export interface TransitionOptions {
  /** AbortSignal for cancelling long-running async operations. */
  signal: AbortSignal;
}

/**
 * A unique symbol used to "brand" a type with metadata.
 * This key allows the static analyzer to find the metadata within a complex type signature.
 */
export const META_KEY = Symbol("MachineMeta");

/**
 * Non-enumerable property key for storing metadata on function objects at runtime.
 * @internal
 */
export const RUNTIME_META = Symbol('__machine_runtime_meta__');

/**
 * Local definition of Machine type to avoid circular imports.
 * @internal
 */
type Machine<C extends object> = {
  readonly context: C;
};

/**
 * Helper type representing a Class Constructor.
 * Used to reference target states by their class definition rather than magic strings.
 */
export type ClassConstructor = new (...args: any[]) => any;

/**
 * Metadata describing a Guard condition.
 */
export interface GuardMeta {
  /** The name of the guard (e.g., "isAdmin"). */
  name: string;
  /** Optional documentation explaining the logic. */
  description?: string;
}

/**
 * Metadata describing an Invoked Service (async operation).
 */
export interface InvokeMeta {
  /** The name of the service source (e.g., "fetchUserData"). */
  src: string;
  /** The state class to transition to on success. */
  onDone: ClassConstructor;
  /** The state class to transition to on error. */
  onError: ClassConstructor;
  /** Optional description. */
  description?: string;
}

/**
 * Metadata describing a generic Action (side effect).
 */
export interface ActionMeta {
  /** The name of the action (e.g., "logAnalytics"). */
  name: string;
  /** Optional description. */
  description?: string;
}

/**
 * The comprehensive shape of metadata that can be encoded into a transition's type.
 */
export interface TransitionMeta {
  /** The target state class this transition leads to. */
  target?: ClassConstructor;
  /** A human-readable description of the transition. */
  description?: string;
  /** An array of guards that must be true for this transition to be enabled. */
  guards?: GuardMeta[];
  /** A service to invoke upon taking this transition (or entering the state). */
  invoke?: InvokeMeta;
  /** Fire-and-forget side effects associated with this transition. */
  actions?: ActionMeta[];
}

/**
 * The Branded Type.
 * It takes a function type `F` and intersects it with a hidden metadata object `M`.
 * This is the mechanism that carries information from your code to the compiler API.
 */
export type WithMeta<
  F extends (...args: any[]) => any,
  M extends TransitionMeta
> = Annotated<F, M>;

/** A value carrying type-level metadata without changing its runtime shape. */
export type Annotated<T, M extends TransitionMeta> = T & { [META_KEY]: M };

type AnyFunction = (...args: any[]) => any;

/** Extracts annotation metadata already carried by a transition function. */
export type MetadataOf<F> = F extends { [META_KEY]: infer M extends TransitionMeta }
  ? M
  : {};

/** A unary function suitable for use with {@link pipe}. */
export type Operator<Input, Output> = (value: Input) => Output;

/** A reusable decorator that adds metadata without changing a transition's call signature. */
export type MetadataOperator<M extends TransitionMeta> = <F extends AnyFunction>(
  transition: F
) => WithMeta<F, MetadataOf<F> & M>;

/**
 * Applies operators from left to right while preserving each intermediate type.
 *
 * This is deliberately a standalone function: machine snapshots stay plain values,
 * and the same composition helper works for transition functions or other values.
 */
export function pipe<A>(value: A): A;
export function pipe<A, B>(value: A, ab: Operator<A, B>): B;
export function pipe<A, B, C>(value: A, ab: Operator<A, B>, bc: Operator<B, C>): C;
export function pipe<A, B, C, D>(value: A, ab: Operator<A, B>, bc: Operator<B, C>, cd: Operator<C, D>): D;
export function pipe<A, B, C, D, E>(value: A, ab: Operator<A, B>, bc: Operator<B, C>, cd: Operator<C, D>, de: Operator<D, E>): E;
export function pipe<A, B, C, D, E, F>(value: A, ab: Operator<A, B>, bc: Operator<B, C>, cd: Operator<C, D>, de: Operator<D, E>, ef: Operator<E, F>): F;
export function pipe<A, B, C, D, E, F, G>(value: A, ab: Operator<A, B>, bc: Operator<B, C>, cd: Operator<C, D>, de: Operator<D, E>, ef: Operator<E, F>, fg: Operator<F, G>): G;
export function pipe(value: unknown, ...operators: Array<Operator<any, any>>): unknown {
  return operators.reduce((current, operator) => operator(current), value);
}

// =============================================================================
// SECTION: RUNTIME METADATA ATTACHMENT
// =============================================================================

/**
 * Runtime metadata interface (resolved class names as strings)
 */
export interface RuntimeTransitionMeta {
  target?: string;
  description?: string;
  guards?: Array<{ name: string; description?: string }>;
  invoke?: {
    src: string;
    onDone: string;
    onError: string;
    description?: string;
  };
  actions?: Array<{ name: string; description?: string }>;
}

/**
 * Attaches runtime metadata to an object or function.
 * Merges with existing metadata if present.
 *
 * @param value - The value to attach metadata to
 * @param metadata - Partial metadata to merge
 * @internal
 */
function attachRuntimeMeta(value: object, metadata: Partial<RuntimeTransitionMeta>): void {
  // Read existing metadata (may be undefined)
  const existing = (value as { [RUNTIME_META]?: RuntimeTransitionMeta })[RUNTIME_META] || {};

  // Shallow merge for simple properties
  const merged: any = { ...existing, ...metadata };

  // Deep merge for array properties
  // Prepend new items to preserve order (outer wraps first in call stack)
  if (metadata.guards && existing.guards) {
    merged.guards = [...metadata.guards, ...existing.guards];
  } else if (metadata.guards) {
    merged.guards = [...metadata.guards];
  }

  if (metadata.actions && existing.actions) {
    merged.actions = [...metadata.actions, ...existing.actions];
  } else if (metadata.actions) {
    merged.actions = [...metadata.actions];
  }

  // Replace invoke entirely (not an array, can't merge)
  // Last invoke wins (this matches XState semantics)

  // Define or redefine the metadata property
  Object.defineProperty(value, RUNTIME_META, {
    value: merged,
    enumerable: false,
    writable: false,
    configurable: true  // CRITICAL: Must be configurable for re-definition
  });
}

function guardedRuntimeMeta(
  transition: object,
  guard: { name: string; description: string },
  description: string | undefined,
  fallbackDescription: string,
): Partial<RuntimeTransitionMeta> {
  const inherited = (transition as { [RUNTIME_META]?: RuntimeTransitionMeta })[RUNTIME_META];
  return {
    ...inherited,
    description: description || inherited?.description || fallbackDescription,
    guards: [guard, ...(inherited?.guards ?? [])],
  };
}

// =============================================================================
// SECTION: ANNOTATION PRIMITIVES (THE DSL)
// =============================================================================

/**
 * Defines a transition to a target state class.
 *
 * @param target - The Class Constructor of the state being transitioned to.
 * @param implementation - The implementation function returning the new state instance.
 * @returns The implementation function, branded with target metadata.
 *
 * @example
 * login = transitionTo(LoggedInMachine, (user) => new LoggedInMachine({ user }));
 */
export function transitionTo<T extends ClassConstructor>(target: T): MetadataOperator<{ target: T }>;
export function transitionTo<T extends ClassConstructor, F extends AnyFunction>(
  target: T,
  implementation: F
): WithMeta<F, MetadataOf<F> & { target: T }>;
export function transitionTo<T extends ClassConstructor, F extends AnyFunction>(
  _target: T,
  implementation?: F
): WithMeta<F, MetadataOf<F> & { target: T }> | MetadataOperator<{ target: T }> {
  if (implementation === undefined) {
    return ((transition: AnyFunction) => transitionTo(_target, transition)) as MetadataOperator<{ target: T }>;
  }

  // Attach runtime metadata with class name
  attachRuntimeMeta(implementation, {
    target: _target.name || _target.toString()
  });

  return implementation as any;
}

/**
 * Annotates a transition with a description for documentation generation.
 *
 * @param text - The description text.
 * @param transition - The transition function (or wrapper) to annotate.
 * @example
 * logout = describe("Logs the user out", transitionTo(LoggedOut, ...));
 */
export function describe(text: string): MetadataOperator<{ description: string }>;
export function describe<F extends AnyFunction>(
  text: string,
  transition: F
): WithMeta<F, MetadataOf<F> & { description: string }>;
export function describe<F extends AnyFunction>(
  _text: string,
  transition?: F
): WithMeta<F, MetadataOf<F> & { description: string }> | MetadataOperator<{ description: string }> {
  if (transition === undefined) {
    return ((value: AnyFunction) => describe(_text, value)) as MetadataOperator<{ description: string }>;
  }

  // Attach runtime metadata
  attachRuntimeMeta(transition, {
    description: _text
  });

  return transition as any;
}

/**
 * Annotates a transition with a Guard condition.
 * Note: This only adds metadata. You must still implement the `if` check inside your function.
 *
 * @deprecated Use the runtime `guard()` primitive instead. Its `options.description` is used for static analysis.
 * @param guard - Object containing the name and optional description of the guard.
 * @param transition - The transition function to guard.
 * @example
 * delete = guarded({ name: "isAdmin" }, transitionTo(Deleted, ...));
 */
export function guarded<G extends GuardMeta>(guard: G): MetadataOperator<{ guards: [G] }>;
export function guarded<G extends GuardMeta, F extends AnyFunction>(
  guard: G,
  transition: F
): WithMeta<F, MetadataOf<F> & { guards: [G] }>;
export function guarded<G extends GuardMeta, F extends AnyFunction>(
  guard: G,
  transition?: F
): WithMeta<F, MetadataOf<F> & { guards: [G] }> | MetadataOperator<{ guards: [G] }> {
  if (transition === undefined) {
    return ((value: AnyFunction) => guarded(guard, value)) as MetadataOperator<{ guards: [G] }>;
  }

  // Attach runtime metadata
  // Note: guards is an array, will be merged by attachRuntimeMeta
  attachRuntimeMeta(transition, {
    guards: [guard]
  });

  return transition as any;
}

/**
 * Annotates a transition with an Invoked Service (asynchronous effect).
 *
 * @param service - configuration for the service (source, onDone target, onError target).
 * @param implementation - The async function implementation that receives an AbortSignal.
 * @example
 * load = invoke(
 *   { src: "fetchData", onDone: LoadedMachine, onError: ErrorMachine },
 *   async ({ signal }) => {
 *     const response = await fetch('/api/data', { signal });
 *     return new LoadedMachine({ data: await response.json() });
 *   }
 * );
 */
type InvokeService<D extends ClassConstructor, E extends ClassConstructor> = {
  src: string;
  onDone: D;
  onError: E;
  description?: string;
};

type InvokeOperator<D extends ClassConstructor, E extends ClassConstructor> = <F extends (options: { signal: AbortSignal }) => any>(
  implementation: F
) => WithMeta<F, MetadataOf<F> & { invoke: InvokeService<D, E> }>;

export function invoke<D extends ClassConstructor, E extends ClassConstructor>(
  service: InvokeService<D, E>
): InvokeOperator<D, E>;
export function invoke<D extends ClassConstructor, E extends ClassConstructor, F extends (options: { signal: AbortSignal }) => any>(
  service: InvokeService<D, E>,
  implementation: F
): WithMeta<F, MetadataOf<F> & { invoke: InvokeService<D, E> }>;
export function invoke<D extends ClassConstructor, E extends ClassConstructor, F extends (options: { signal: AbortSignal }) => any>(
  service: InvokeService<D, E>,
  implementation?: F
): WithMeta<F, MetadataOf<F> & { invoke: InvokeService<D, E> }> | InvokeOperator<D, E> {
  if (implementation === undefined) {
    return ((value: F) => invoke(service, value)) as InvokeOperator<D, E>;
  }

  // Attach runtime metadata with class names resolved
  attachRuntimeMeta(implementation, {
    invoke: {
      src: service.src,
      onDone: service.onDone.name || service.onDone.toString(),
      onError: service.onError.name || service.onError.toString(),
      description: service.description
    }
  });

  return implementation as any;
}

/**
 * Annotates a transition with a side-effect Action.
 * Useful for logging, analytics, or external event firing that doesn't change state structure.
 *
 * @param action - Object containing the name and optional description.
 * @param transition - The transition function to annotate.
 * @example
 * click = action({ name: "trackClick" }, (ctx) => ...);
 */
export function action<A extends ActionMeta>(action: A): MetadataOperator<{ actions: [A] }>;
export function action<A extends ActionMeta, F extends AnyFunction>(
  actionMeta: A,
  transition: F
): WithMeta<F, MetadataOf<F> & { actions: [A] }>;
export function action<A extends ActionMeta, F extends AnyFunction>(
  actionMeta: A,
  transition?: F
): WithMeta<F, MetadataOf<F> & { actions: [A] }> | MetadataOperator<{ actions: [A] }> {
  if (transition === undefined) {
    return ((value: AnyFunction) => action(actionMeta, value)) as MetadataOperator<{ actions: [A] }>;
  }

  // Attach runtime metadata
  // Note: actions is an array, will be merged by attachRuntimeMeta
  attachRuntimeMeta(transition, {
    actions: [actionMeta]
  });

  return transition as any;
}

// =============================================================================
// SECTION: RUNTIME GUARDS
// =============================================================================

/**
 * Configuration options for guard behavior when conditions fail.
 */
export interface GuardOptions<C extends object = any, TFailure extends Machine<any> = Machine<C>> {
  /** What to do when guard fails */
  onFail?: 'throw' | 'ignore' | GuardFallback<C, TFailure>;

  /** Custom error message for 'throw' mode */
  errorMessage?: string;

  /** Additional metadata for statechart extraction */
  description?: string;
}

/**
 * A fallback machine or function that returns a machine when guard fails.
 */
export type GuardFallback<C extends object, TFailure extends Machine<any> = Machine<C>> =
  | ((this: Machine<C>, ...args: any[]) => TFailure)
  | TFailure;

/**
 * A guarded transition that checks conditions at runtime before executing.
 * Can be called with either machine or context as 'this' binding.
 */
export type GuardedTransition<
  C extends object,
  TSuccess extends Machine<any>,
  TFailure extends Machine<any> = Machine<C>
> = {
  (...args: any[]): TSuccess | TFailure | Promise<TSuccess | TFailure>;
  readonly __guard: true;
  readonly condition: (ctx: C, ...args: any[]) => boolean | Promise<boolean>;
  readonly transition: (...args: any[]) => TSuccess;
};

/**
 * Creates a synchronous runtime guard that checks conditions before executing transitions.
 * This provides actual runtime protection with synchronous execution - use this for the majority of cases.
 *
 * **IMPORTANT - Context-Bound Limitation:**
 * Guards accept calls with either `this === machine` or `this === context`, but when called
 * with context-only binding, the guard normalizes to `{ context }` before passing to the transition.
 * This means:
 * - ✅ Transitions can access `this.context`
 * - ❌ Transitions CANNOT call `this.otherTransition()` (no transitions property)
 * - Recommended: Use guards only with machine-bound transitions for full composition support
 *
 * @template C - The context type
 * @template TSuccess - The transition return type when condition passes
 * @template TFailure - The fallback return type when condition fails (defaults to Machine<C>)
 * @param condition - Synchronous function that returns true if transition should proceed
 * @param transition - The transition function to execute if condition passes
 * @param options - Configuration for guard failure behavior
 * @returns A synchronous guarded transition function
 *
 * @example
 * ```typescript
 * const machine = createMachine({ balance: 100 }, {
 *   withdraw: guard(
 *     (ctx, amount) => ctx.balance >= amount,
 *     function(this: Machine<{balance: number}>, amount: number) {
 *       // ✅ Can access this.context
 *       return createMachine({ balance: this.context.balance - amount }, this);
 *       // ❌ Cannot call this.otherTransition() if guard was called with context-only binding
 *     },
 *     { onFail: 'throw', errorMessage: 'Insufficient funds' }
 *   )
 * });
 *
 * machine.withdraw(50); // ✅ Works synchronously
 * machine.withdraw(200); // ❌ Throws "Insufficient funds"
 * ```
 */
export function guard<
  C extends object,
  TSuccess extends Machine<any>,
  TFailure extends Machine<any> = Machine<C>
>(
  condition: (ctx: C, ...args: any[]) => boolean,
  transition: (...args: any[]) => TSuccess,
  options: GuardOptions<C, TFailure> = {}
): (...args: any[]) => TSuccess | TFailure {
  const { onFail = 'throw', errorMessage, description } = options;

  // Merge defaults into options for the metadata
  const fullOptions = { ...options, onFail, errorMessage, description };

  // Create the guarded transition function (synchronous)
  const guardedTransition = function(this: C | Machine<C>, ...args: any[]): TSuccess | TFailure {
    // Detect if 'this' is a machine or just context
    const isMachine = typeof this === 'object' && 'context' in this;
    const ctx = isMachine ? (this as Machine<C>).context : (this as C);

    // Evaluate the condition (synchronously)
    const conditionResult = condition(ctx, ...args);

    if (conditionResult) {
      // Condition passed, execute the transition
      // Transition functions expect 'this' to be the machine
      const machineForTransition = isMachine ? (this as Machine<C>) : { context: this as C };
      return transition.apply(machineForTransition, args);
    } else {
      // Condition failed, handle according to options
      if (onFail === 'throw') {
        const message = errorMessage || 'Guard condition failed';
        throw new Error(message);
      } else if (onFail === 'ignore') {
        if (isMachine) {
          // Return the current machine unchanged
          return this as TSuccess | TFailure;
        } else {
          // Cannot ignore when called with context binding
          throw new Error('Cannot use "ignore" mode with context-only binding. Use full machine binding or provide fallback.');
        }
      } else if (typeof onFail === 'function') {
        // Custom fallback function - call with machine as 'this'
        if (isMachine) {
          return onFail.apply(this as Machine<C>, args) as TSuccess | TFailure;
        } else {
          throw new Error('Cannot use function fallback with context-only binding. Use full machine binding.');
        }
      } else {
        // Static fallback machine
        return onFail as TSuccess | TFailure;
      }
    }
  };

  // Attach metadata for type branding and statechart extraction
  Object.defineProperty(guardedTransition, '__guard', { value: true, enumerable: false });
  Object.defineProperty(guardedTransition, 'condition', { value: condition, enumerable: false });
  Object.defineProperty(guardedTransition, 'transition', { value: transition, enumerable: false });
  Object.defineProperty(guardedTransition, 'options', { value: fullOptions, enumerable: false });

  // Attach runtime metadata for statechart extraction
  attachRuntimeMeta(guardedTransition, guardedRuntimeMeta(
    transition,
    { name: 'runtime_guard', description: description || 'Synchronous condition check' },
    description,
    'Synchronous guarded transition',
  ));

  return guardedTransition;
}

/**
 * Creates a runtime guard that checks conditions before executing transitions.
 * This provides actual runtime protection, unlike the `guarded` primitive which only adds metadata.
 * Use this when your condition or transition logic is asynchronous.
 *
 * **IMPORTANT - Context-Bound Limitation:**
 * Guards accept calls with either `this === machine` or `this === context`, but when called
 * with context-only binding, the guard normalizes to `{ context }` before passing to the transition.
 * This means:
 * - ✅ Transitions can access `this.context`
 * - ❌ Transitions CANNOT call `this.otherTransition()` (no transitions property)
 * - Recommended: Use guards only with machine-bound transitions for full composition support
 *
 * @template C - The context type
 * @template TSuccess - The transition return type when condition passes
 * @template TFailure - The fallback return type when condition fails (defaults to Machine<C>)
 * @param condition - Function that returns true if transition should proceed (can be async)
 * @param transition - The transition function to execute if condition passes
 * @param options - Configuration for guard failure behavior
 * @returns A guarded transition function that returns a Promise
 *
 * @example
 * ```typescript
 * const machine = createMachine({ balance: 100 }, {
 *   withdraw: guardAsync(
 *     async (ctx, amount) => {
 *       // Simulate API call to check balance
 *       await new Promise(resolve => setTimeout(resolve, 100));
 *       return ctx.balance >= amount;
 *     },
 *     async function(this: Machine<{balance: number}>, amount: number) {
 *       // Simulate API call to process withdrawal
 *       await new Promise(resolve => setTimeout(resolve, 100));
 *       // ✅ Can access this.context
 *       return createMachine({ balance: this.context.balance - amount }, this);
 *       // ❌ Cannot call this.otherTransition() if guard was called with context-only binding
 *     },
 *     { onFail: 'throw', errorMessage: 'Insufficient funds' }
 *   )
 * });
 *
 * await machine.withdraw(50); // ✅ Works
 * await machine.withdraw(200); // ❌ Throws "Insufficient funds"
 * ```
 */
export function guardAsync<
  C extends object,
  TSuccess extends Machine<any>,
  TFailure extends Machine<any> = Machine<C>
>(
  condition: (ctx: C, ...args: any[]) => boolean | Promise<boolean>,
  transition: (...args: any[]) => TSuccess,
  options: GuardOptions<C, TFailure> = {}
): GuardedTransition<C, TSuccess, TFailure> {
  const { onFail = 'throw', errorMessage, description } = options;

  // Merge defaults into options for the metadata
  const fullOptions = { ...options, onFail, errorMessage, description };

  // Create the guarded transition function
  const guardedTransition = async function(this: C | Machine<C>, ...args: any[]): Promise<TSuccess | TFailure> {
    // Detect if 'this' is a machine or just context
    const isMachine = typeof this === 'object' && 'context' in this;
    const ctx = isMachine ? (this as Machine<C>).context : (this as C);

    // Evaluate the condition
    const conditionResult = await Promise.resolve(condition(ctx, ...args));

    if (conditionResult) {
      // Condition passed, execute the transition
      // Transition functions expect 'this' to be the machine
      const machineForTransition = isMachine ? (this as Machine<C>) : { context: this as C };
      return transition.apply(machineForTransition, args);
    } else {
      // Condition failed, handle according to options
      if (onFail === 'throw') {
        const message = errorMessage || 'Guard condition failed';
        throw new Error(message);
      } else if (onFail === 'ignore') {
        if (isMachine) {
          // Return the current machine unchanged
          return this as TSuccess | TFailure;
        } else {
          // Cannot ignore when called with context binding
          throw new Error('Cannot use "ignore" mode with context-only binding. Use full machine binding or provide fallback.');
        }
      } else if (typeof onFail === 'function') {
        // Custom fallback function - call with machine as 'this'
        if (isMachine) {
          return onFail.apply(this as Machine<C>, args) as TSuccess | TFailure;
        } else {
          throw new Error('Cannot use function fallback with context-only binding. Use full machine binding.');
        }
      } else {
        // Static fallback machine
        return onFail as TSuccess | TFailure;
      }
    }
  };

  // Attach metadata for type branding and statechart extraction
  Object.defineProperty(guardedTransition, '__guard', { value: true, enumerable: false });
  Object.defineProperty(guardedTransition, 'condition', { value: condition, enumerable: false });
  Object.defineProperty(guardedTransition, 'transition', { value: transition, enumerable: false });
  Object.defineProperty(guardedTransition, 'options', { value: fullOptions, enumerable: false });

  // Attach runtime metadata for statechart extraction
  attachRuntimeMeta(guardedTransition, guardedRuntimeMeta(
    transition,
    { name: 'runtime_guard', description: description || 'Runtime condition check' },
    description,
    'Runtime guarded transition',
  ));

  return guardedTransition as GuardedTransition<C, TSuccess, TFailure>;
}

/**
 * Creates a synchronous guard that checks conditions before executing transitions.
 * This is the synchronous counterpart to `guard()` - use this when your machine
 * doesn't need async transitions to avoid unnecessary Promise overhead.
 *
 * @template C - The context type
 * @template T - The transition return type
 * @param condition - Function that returns true if transition should proceed (must be synchronous)
 * @param transition - The transition function to execute if condition passes (must be synchronous)
 * @param options - Configuration for guard failure behavior
 * @returns A synchronous guarded transition function
 *
 * @example
 * ```typescript
 * const machine = createMachine({ balance: 100 }, {
 *   withdraw: guardSync(
 *     (ctx, amount) => ctx.balance >= amount,
 *     function(amount: number) {
 *       return createMachine({ balance: this.context.balance - amount }, this);
 *     },
 *     { onFail: 'throw', errorMessage: 'Insufficient funds' }
 *   )
 * });
 *
 * machine.withdraw(50); // ✅ Works synchronously
 * machine.withdraw(200); // ❌ Throws "Insufficient funds"
 * ```
 */
export function guardSync<
  C extends object,
  TSuccess extends Machine<any>,
  TFailure extends Machine<any> = Machine<C>
>(
  condition: (ctx: C, ...args: any[]) => boolean,
  transition: (...args: any[]) => TSuccess,
  options: GuardOptions<C, TFailure> = {}
): GuardedTransition<C, TSuccess, TFailure> {
  const { onFail = 'throw', errorMessage, description } = options;

  // Merge defaults into options for the metadata
  const fullOptions = { ...options, onFail, errorMessage, description };

  // Create the guarded transition function (synchronous)
  const guardedTransition = function(this: C | Machine<C>, ...args: any[]): TSuccess | TFailure {
    // Detect if 'this' is a machine or just context
    const isMachine = typeof this === 'object' && 'context' in this;
    const ctx = isMachine ? (this as Machine<C>).context : (this as C);

    // Evaluate the condition (synchronously)
    const conditionResult = condition(ctx, ...args);

    if (conditionResult) {
      // Condition passed, execute the transition
      // Transition functions expect 'this' to be the machine
      const machineForTransition = isMachine ? (this as Machine<C>) : { context: this as C };
      return transition.apply(machineForTransition, args);
    } else {
      // Condition failed, handle according to options
      if (onFail === 'throw') {
        const message = errorMessage || 'Guard condition failed';
        throw new Error(message);
      } else if (onFail === 'ignore') {
        if (isMachine) {
          // Return the current machine unchanged
          return this as TSuccess | TFailure;
        } else {
          // Cannot ignore when called with context binding
          throw new Error('Cannot use "ignore" mode with context-only binding. Use full machine binding or provide fallback.');
        }
      } else if (typeof onFail === 'function') {
        // Custom fallback function - call with machine as 'this'
        if (isMachine) {
          return onFail.apply(this as Machine<C>, args) as TSuccess | TFailure;
        } else {
          throw new Error('Cannot use function fallback with context-only binding. Use full machine binding.');
        }
      } else {
        // Static fallback machine
        return onFail as TSuccess | TFailure;
      }
    }
  };

  // Attach metadata for type branding and statechart extraction
  Object.defineProperty(guardedTransition, '__guard', { value: true, enumerable: false });
  Object.defineProperty(guardedTransition, 'condition', { value: condition, enumerable: false });
  Object.defineProperty(guardedTransition, 'transition', { value: transition, enumerable: false });
  Object.defineProperty(guardedTransition, 'options', { value: fullOptions, enumerable: false });

  // Attach runtime metadata for statechart extraction
  attachRuntimeMeta(guardedTransition, guardedRuntimeMeta(
    transition,
    { name: 'runtime_guard_sync', description: description || 'Synchronous condition check' },
    description,
    'Synchronous guarded transition',
  ));

  return guardedTransition as GuardedTransition<C, TSuccess, TFailure>;
}

/**
 * Fluent API for creating synchronous guarded transitions.
 * Provides a more readable way to define conditional transitions with synchronous execution.
 *
 * @template C - The context type
 * @param condition - Synchronous function that returns true if transition should proceed
 * @returns A fluent interface for defining the guarded transition
 *
 * @example
 * ```typescript
 * const machine = createMachine({ isAdmin: false }, {
 *   deleteUser: whenGuard((ctx) => ctx.isAdmin)
 *     .do(function(userId: string) {
 *       return createMachine({ ...this.context, deleted: userId }, this);
 *     })
 *     .else(function() {
 *       return createMachine({ ...this.context, error: 'Unauthorized' }, this);
 *     })
 * });
 * ```
 */
export function whenGuard<C extends object>(
  condition: (ctx: C, ...args: any[]) => boolean
) {
  return {
    /**
     * Define the transition to execute when the condition passes.
     * Returns a guarded transition that can optionally have an else clause.
     */
    do<T extends Machine<any>>(transition: (...args: any[]) => T) {
      const guarded = guard(condition, transition);

      // Add fluent else method to the guarded transition
      (guarded as any).else = function<F extends Machine<any>>(fallback: (...args: any[]) => F) {
        return guard(condition, transition, { onFail: fallback });
      };

      return guarded;
    }
  };
}

/**
 * Fluent API for creating asynchronous guarded transitions.
 * Provides a more readable way to define conditional transitions with async execution.
 *
 * @template C - The context type
 * @param condition - Function that returns true if transition should proceed (can be async)
 * @returns A fluent interface for defining the guarded transition
 *
 * @example
 * ```typescript
 * const machine = createMachine({ isAdmin: false }, {
 *   deleteUser: whenGuardAsync(async (ctx) => {
 *     // Simulate API call
 *     await checkPermissions(ctx.userId);
 *     return ctx.isAdmin;
 *   })
 *     .do(async function(userId: string) {
 *       await deleteUserFromDB(userId);
 *       return createMachine({ ...this.context, deleted: userId }, this);
 *     })
 *     .else(function() {
 *       return createMachine({ ...this.context, error: 'Unauthorized' }, this);
 *     })
 * });
 * ```
 */
export function whenGuardAsync<C extends object>(
  condition: (ctx: C, ...args: any[]) => boolean | Promise<boolean>
) {
  return {
    /**
     * Define the transition to execute when the condition passes.
     * Returns a guarded transition that can optionally have an else clause.
     */
    do<T extends Machine<any>>(transition: (...args: any[]) => T) {
      const guarded = guardAsync(condition, transition);

      // Add fluent else method to the guarded transition
      (guarded as any).else = function<F extends Machine<any>>(fallback: (...args: any[]) => F) {
        return guardAsync(condition, transition, { onFail: fallback });
      };

      return guarded;
    }
  };
}

/**
 * Flexible metadata wrapper for functional and type-state patterns.
 *
 * This function allows attaching metadata to values that don't use the class-based
 * MachineBase pattern. It's particularly useful for:
 * - Functional machines created with createMachine()
 * - Type-state discriminated unions
 * - Generic machine configurations
 *
 * @param meta - Partial metadata object describing states, transitions, etc.
 * @param value - The value to annotate (machine, config, factory function, etc.)
 * @returns The value unchanged, or a reusable unary annotation when value is omitted
 *
 * @example
 * // Annotate a functional machine
 * const machine = metadata(
 *   {
 *     target: IdleState,
 *     description: "Counter machine with increment/decrement"
 *   },
 *   createMachine({ count: 0 }, { ... })
 * );
 *
 * @example
 * // Annotate a factory function
 * export const createCounter = metadata(
 *   { description: "Creates a counter starting at 0" },
 *   () => createMachine({ count: 0 }, { ... })
 * );
 */
export function metadata<M extends Partial<TransitionMeta>>(meta: M): <T extends object>(value: T) => Annotated<T, M>;
export function metadata<M extends Partial<TransitionMeta>, T extends object>(meta: M, value: T): Annotated<T, M>;
export function metadata<M extends Partial<TransitionMeta>, T extends object>(
  meta: M,
  value?: T,
): Annotated<T, M> | (<V extends object>(value: V) => Annotated<V, M>) {
  if (arguments.length === 1) {
    return <V extends object>(annotated: V): Annotated<V, M> => metadata(meta, annotated);
  }

  if (value === undefined) {
    throw new TypeError('metadata requires an object or function to annotate.');
  }

  const runtimeMeta: Partial<RuntimeTransitionMeta> = {};
  if (meta.target) runtimeMeta.target = meta.target.name;
  if (meta.description !== undefined) runtimeMeta.description = meta.description;
  if (meta.guards) runtimeMeta.guards = meta.guards;
  if (meta.actions) runtimeMeta.actions = meta.actions;
  if (meta.invoke) {
    runtimeMeta.invoke = {
      ...meta.invoke,
      onDone: meta.invoke.onDone.name,
      onError: meta.invoke.onError.name,
    };
  }

  attachRuntimeMeta(value, runtimeMeta);
  return value as Annotated<T, M>;
}
