"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUNTIME_META = exports.META_KEY = void 0;
exports.transitionTo = transitionTo;
exports.describe = describe;
exports.guarded = guarded;
exports.invoke = invoke;
exports.action = action;
exports.guard = guard;
exports.guardAsync = guardAsync;
exports.guardSync = guardSync;
exports.whenGuard = whenGuard;
exports.whenGuardAsync = whenGuardAsync;
exports.metadata = metadata;
/**
 * A unique symbol used to "brand" a type with metadata.
 * This key allows the static analyzer to find the metadata within a complex type signature.
 */
exports.META_KEY = Symbol("MachineMeta");
/**
 * Runtime metadata symbol.
/**
 * Non-enumerable property key for storing metadata on function objects at runtime.
 * @internal
 */
exports.RUNTIME_META = Symbol('__machine_runtime_meta__');
/**
 * Attaches runtime metadata to a function object.
 * Merges with existing metadata if present.
 *
 * @param fn - The function to attach metadata to
 * @param metadata - Partial metadata to merge
 * @internal
 */
function attachRuntimeMeta(fn, metadata) {
    // Read existing metadata (may be undefined)
    const existing = fn[exports.RUNTIME_META] || {};
    // Shallow merge for simple properties
    const merged = { ...existing, ...metadata };
    // Deep merge for array properties
    // Prepend new items to preserve order (outer wraps first in call stack)
    if (metadata.guards && existing.guards) {
        merged.guards = [...metadata.guards, ...existing.guards];
    }
    else if (metadata.guards) {
        merged.guards = [...metadata.guards];
    }
    if (metadata.actions && existing.actions) {
        merged.actions = [...metadata.actions, ...existing.actions];
    }
    else if (metadata.actions) {
        merged.actions = [...metadata.actions];
    }
    // Replace invoke entirely (not an array, can't merge)
    // Last invoke wins (this matches XState semantics)
    // Define or redefine the metadata property
    Object.defineProperty(fn, exports.RUNTIME_META, {
        value: merged,
        enumerable: false,
        writable: false,
        configurable: true // CRITICAL: Must be configurable for re-definition
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
function transitionTo(_target, implementation) {
    // Attach runtime metadata with class name
    attachRuntimeMeta(implementation, {
        target: _target.name || _target.toString()
    });
    return implementation;
}
/**
 * Annotates a transition with a description for documentation generation.
 *
 * @param text - The description text.
 * @param transition - The transition function (or wrapper) to annotate.
 * @example
 * logout = describe("Logs the user out", transitionTo(LoggedOut, ...));
 */
function describe(_text, transition) {
    // Attach runtime metadata
    attachRuntimeMeta(transition, {
        description: _text
    });
    return transition;
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
function guarded(guard, transition) {
    // Attach runtime metadata
    // Note: guards is an array, will be merged by attachRuntimeMeta
    attachRuntimeMeta(transition, {
        guards: [guard]
    });
    return transition;
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
function invoke(service, implementation) {
    // Attach runtime metadata with class names resolved
    attachRuntimeMeta(implementation, {
        invoke: {
            src: service.src,
            onDone: service.onDone.name || service.onDone.toString(),
            onError: service.onError.name || service.onError.toString(),
            description: service.description
        }
    });
    return implementation;
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
function action(action, transition) {
    // Attach runtime metadata
    // Note: actions is an array, will be merged by attachRuntimeMeta
    attachRuntimeMeta(transition, {
        actions: [action]
    });
    return transition;
}
/**
 * Creates a synchronous runtime guard that checks conditions before executing transitions.
 * This provides actual runtime protection with synchronous execution - use this for the majority of cases.
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
 *     function(amount: number) {
 *       return createMachine({ balance: this.balance - amount }, this);
 *     },
 *     { onFail: 'throw', errorMessage: 'Insufficient funds' }
 *   )
 * });
 *
 * machine.withdraw(50); // ✅ Works synchronously
 * machine.withdraw(200); // ❌ Throws "Insufficient funds"
 * ```
 */
function guard(condition, transition, options = {}) {
    const { onFail = 'throw', errorMessage, description } = options;
    // Merge defaults into options for the metadata
    const fullOptions = { ...options, onFail, errorMessage, description };
    // Create the guarded transition function (synchronous)
    const guardedTransition = function (...args) {
        // Detect if 'this' is a machine or just context
        const isMachine = typeof this === 'object' && 'context' in this;
        const ctx = isMachine ? this.context : this;
        // Evaluate the condition (synchronously)
        const conditionResult = condition(ctx, ...args);
        if (conditionResult) {
            // Condition passed, execute the transition
            // Transition functions expect 'this' to be the context
            const contextForTransition = isMachine ? this.context : this;
            return transition.apply(contextForTransition, args);
        }
        else {
            // Condition failed, handle according to options
            if (onFail === 'throw') {
                const message = errorMessage || 'Guard condition failed';
                throw new Error(message);
            }
            else if (onFail === 'ignore') {
                if (isMachine) {
                    // Return the current machine unchanged
                    return this;
                }
                else {
                    // Cannot ignore when called with context binding
                    throw new Error('Cannot use "ignore" mode with context-only binding. Use full machine binding or provide fallback.');
                }
            }
            else if (typeof onFail === 'function') {
                // Custom fallback function - call with machine as 'this'
                if (isMachine) {
                    return onFail.apply(this, args);
                }
                else {
                    throw new Error('Cannot use function fallback with context-only binding. Use full machine binding.');
                }
            }
            else {
                // Static fallback machine
                return onFail;
            }
        }
    };
    // Attach metadata for type branding and statechart extraction
    Object.defineProperty(guardedTransition, '__guard', { value: true, enumerable: false });
    Object.defineProperty(guardedTransition, 'condition', { value: condition, enumerable: false });
    Object.defineProperty(guardedTransition, 'transition', { value: transition, enumerable: false });
    Object.defineProperty(guardedTransition, 'options', { value: fullOptions, enumerable: false });
    // Attach runtime metadata for statechart extraction
    attachRuntimeMeta(guardedTransition, {
        description: description || 'Synchronous guarded transition',
        guards: [{ name: 'runtime_guard', description: description || 'Synchronous condition check' }]
    });
    return guardedTransition;
}
/**
 * Creates a runtime guard that checks conditions before executing transitions.
 * This provides actual runtime protection, unlike the `guarded` primitive which only adds metadata.
 * Use this when your condition or transition logic is asynchronous.
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
 *     async function(amount: number) {
 *       // Simulate API call to process withdrawal
 *       await new Promise(resolve => setTimeout(resolve, 100));
 *       return createMachine({ balance: this.balance - amount }, this);
 *     },
 *     { onFail: 'throw', errorMessage: 'Insufficient funds' }
 *   )
 * });
 *
 * await machine.withdraw(50); // ✅ Works
 * await machine.withdraw(200); // ❌ Throws "Insufficient funds"
 * ```
 */
function guardAsync(condition, transition, options = {}) {
    const { onFail = 'throw', errorMessage, description } = options;
    // Merge defaults into options for the metadata
    const fullOptions = { ...options, onFail, errorMessage, description };
    // Create the guarded transition function
    const guardedTransition = async function (...args) {
        // Detect if 'this' is a machine or just context
        const isMachine = typeof this === 'object' && 'context' in this;
        const ctx = isMachine ? this.context : this;
        // Evaluate the condition
        const conditionResult = await Promise.resolve(condition(ctx, ...args));
        if (conditionResult) {
            // Condition passed, execute the transition
            // Transition functions expect 'this' to be the context
            const contextForTransition = isMachine ? this.context : this;
            return transition.apply(contextForTransition, args);
        }
        else {
            // Condition failed, handle according to options
            if (onFail === 'throw') {
                const message = errorMessage || 'Guard condition failed';
                throw new Error(message);
            }
            else if (onFail === 'ignore') {
                if (isMachine) {
                    // Return the current machine unchanged
                    return this;
                }
                else {
                    // Cannot ignore when called with context binding
                    throw new Error('Cannot use "ignore" mode with context-only binding. Use full machine binding or provide fallback.');
                }
            }
            else if (typeof onFail === 'function') {
                // Custom fallback function - call with machine as 'this'
                if (isMachine) {
                    return onFail.apply(this, args);
                }
                else {
                    throw new Error('Cannot use function fallback with context-only binding. Use full machine binding.');
                }
            }
            else {
                // Static fallback machine
                return onFail;
            }
        }
    };
    // Attach metadata for type branding and statechart extraction
    Object.defineProperty(guardedTransition, '__guard', { value: true, enumerable: false });
    Object.defineProperty(guardedTransition, 'condition', { value: condition, enumerable: false });
    Object.defineProperty(guardedTransition, 'transition', { value: transition, enumerable: false });
    Object.defineProperty(guardedTransition, 'options', { value: fullOptions, enumerable: false });
    // Attach runtime metadata for statechart extraction
    attachRuntimeMeta(guardedTransition, {
        description: description || 'Runtime guarded transition',
        guards: [{ name: 'runtime_guard', description: description || 'Runtime condition check' }]
    });
    return guardedTransition;
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
 *       return createMachine({ balance: this.balance - amount }, this);
 *     },
 *     { onFail: 'throw', errorMessage: 'Insufficient funds' }
 *   )
 * });
 *
 * machine.withdraw(50); // ✅ Works synchronously
 * machine.withdraw(200); // ❌ Throws "Insufficient funds"
 * ```
 */
function guardSync(condition, transition, options = {}) {
    const { onFail = 'throw', errorMessage, description } = options;
    // Merge defaults into options for the metadata
    const fullOptions = { ...options, onFail, errorMessage, description };
    // Create the guarded transition function (synchronous)
    const guardedTransition = function (...args) {
        // Detect if 'this' is a machine or just context
        const isMachine = typeof this === 'object' && 'context' in this;
        const ctx = isMachine ? this.context : this;
        // Evaluate the condition (synchronously)
        const conditionResult = condition(ctx, ...args);
        if (conditionResult) {
            // Condition passed, execute the transition
            // Transition functions expect 'this' to be the context
            const contextForTransition = isMachine ? this.context : this;
            return transition.apply(contextForTransition, args);
        }
        else {
            // Condition failed, handle according to options
            if (onFail === 'throw') {
                const message = errorMessage || 'Guard condition failed';
                throw new Error(message);
            }
            else if (onFail === 'ignore') {
                if (isMachine) {
                    // Return the current machine unchanged
                    return this;
                }
                else {
                    // Cannot ignore when called with context binding
                    throw new Error('Cannot use "ignore" mode with context-only binding. Use full machine binding or provide fallback.');
                }
            }
            else if (typeof onFail === 'function') {
                // Custom fallback function - call with machine as 'this'
                if (isMachine) {
                    return onFail.apply(this, args);
                }
                else {
                    throw new Error('Cannot use function fallback with context-only binding. Use full machine binding.');
                }
            }
            else {
                // Static fallback machine
                return onFail;
            }
        }
    };
    // Attach metadata for type branding and statechart extraction
    Object.defineProperty(guardedTransition, '__guard', { value: true, enumerable: false });
    Object.defineProperty(guardedTransition, 'condition', { value: condition, enumerable: false });
    Object.defineProperty(guardedTransition, 'transition', { value: transition, enumerable: false });
    Object.defineProperty(guardedTransition, 'options', { value: fullOptions, enumerable: false });
    // Attach runtime metadata for statechart extraction
    attachRuntimeMeta(guardedTransition, {
        description: description || 'Synchronous guarded transition',
        guards: [{ name: 'runtime_guard_sync', description: description || 'Synchronous condition check' }]
    });
    return guardedTransition;
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
function whenGuard(condition) {
    return {
        /**
         * Define the transition to execute when the condition passes.
         * Returns a guarded transition that can optionally have an else clause.
         */
        do(transition) {
            const guarded = guard(condition, transition);
            // Add fluent else method to the guarded transition
            guarded.else = function (fallback) {
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
function whenGuardAsync(condition) {
    return {
        /**
         * Define the transition to execute when the condition passes.
         * Returns a guarded transition that can optionally have an else clause.
         */
        do(transition) {
            const guarded = guardAsync(condition, transition);
            // Add fluent else method to the guarded transition
            guarded.else = function (fallback) {
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
function metadata(_meta, value) {
    // At runtime, this is a no-op identity function
    // At compile-time/static-analysis, the metadata can be extracted from the type signature
    return value;
}
