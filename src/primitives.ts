/**
 * @file Type-level primitives for formal state machine verification.
 * @description
 * This file provides a Domain Specific Language (DSL) of wrapper functions.
 * These functions serve two purposes:
 * 1. At Runtime: They are identity functions (no-ops). They return your code exactly as is.
 * 2. At Design/Build Time: They "brand" your transition functions with rich type metadata.
 *
 * This allows a static analysis tool (like `ts-morph`) to read your source code
 * and generate a formal Statechart (JSON) that perfectly matches your implementation,
 * including resolving Class Constructors to their names.
 */

// =============================================================================
// SECTION: CORE METADATA TYPES
// =============================================================================

/**
 * A unique symbol used to "brand" a type with metadata.
 * This key allows the static analyzer to find the metadata within a complex type signature.
 */
export const META_KEY = Symbol("MachineMeta");

/**
 * Runtime metadata symbol.
 * Non-enumerable property key for storing metadata on function objects at runtime.
 * @internal
 */
export const RUNTIME_META = Symbol('__machine_runtime_meta__');

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
> = F & { [META_KEY]: M };

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
 * Attaches runtime metadata to a function object.
 * Merges with existing metadata if present.
 *
 * @param fn - The function to attach metadata to
 * @param metadata - Partial metadata to merge
 * @internal
 */
function attachRuntimeMeta(fn: any, metadata: Partial<RuntimeTransitionMeta>): void {
  // Read existing metadata (may be undefined)
  const existing = fn[RUNTIME_META] || {};

  // Shallow merge for simple properties
  const merged: any = { ...existing, ...metadata };

  // Deep merge for array properties
  if (metadata.guards && existing.guards) {
    merged.guards = [...existing.guards, ...metadata.guards];
  } else if (metadata.guards) {
    merged.guards = [...metadata.guards];
  }

  if (metadata.actions && existing.actions) {
    merged.actions = [...existing.actions, ...metadata.actions];
  } else if (metadata.actions) {
    merged.actions = [...metadata.actions];
  }

  // Replace invoke entirely (not an array, can't merge)
  // Last invoke wins (this matches XState semantics)

  // Define or redefine the metadata property
  Object.defineProperty(fn, RUNTIME_META, {
    value: merged,
    enumerable: false,
    writable: false,
    configurable: true  // CRITICAL: Must be configurable for re-definition
  });
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
export function transitionTo<
  T extends ClassConstructor,
  F extends (...args: any[]) => any
>(
  _target: T,
  implementation: F
): WithMeta<F, { target: T }> {
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
export function describe<
  F extends (...args: any[]) => any,
  M extends TransitionMeta
>(
  _text: string,
  transition: WithMeta<F, M>
): WithMeta<F, M & { description: string }> {
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
 * @param guard - Object containing the name and optional description of the guard.
 * @param transition - The transition function to guard.
 * @example
 * delete = guarded({ name: "isAdmin" }, transitionTo(Deleted, ...));
 */
export function guarded<
  F extends (...args: any[]) => any,
  M extends TransitionMeta
>(
  guard: GuardMeta,
  transition: WithMeta<F, M>
): WithMeta<F, M & { guards: [typeof guard] }> {
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
 * @param implementation - The async function implementation.
 * @example
 * load = invoke(
 *   { src: "fetchData", onDone: LoadedMachine, onError: ErrorMachine },
 *   async () => { ... }
 * );
 */
export function invoke<
  D extends ClassConstructor,
  E extends ClassConstructor,
  F extends (...args: any[]) => any
>(
  service: { src: string; onDone: D; onError: E; description?: string },
  implementation: F
): WithMeta<F, { invoke: typeof service }> {
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
export function action<
  F extends (...args: any[]) => any,
  M extends TransitionMeta
>(
  action: ActionMeta,
  transition: WithMeta<F, M>
): WithMeta<F, M & { actions: [typeof action] }> {
  // Attach runtime metadata
  // Note: actions is an array, will be merged by attachRuntimeMeta
  attachRuntimeMeta(transition, {
    actions: [action]
  });

  return transition as any;
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
 * @returns The value unchanged (identity function at runtime)
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
export function metadata<T>(_meta: Partial<TransitionMeta>, value: T): T {
  // At runtime, this is a no-op identity function
  // At compile-time/static-analysis, the metadata can be extracted from the type signature
  return value;
}