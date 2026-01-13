"use strict";
/**
 * @file A tiny, immutable, and type-safe state machine library for TypeScript.
 * @author doeixd
 * @version 1.0.0
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.state = exports.createFunctionalMachine = exports.createTransitionExtender = exports.createTransitionFactory = exports.BoundMachine = exports.bindTransitions = exports.call = exports.logState = exports.pipeTransitions = exports.mergeContext = exports.createTransition = exports.createEvent = exports.isState = exports.META_KEY = exports.metadata = exports.action = exports.invoke = exports.whenGuardAsync = exports.whenGuard = exports.guardAsync = exports.guard = exports.guarded = exports.describe = exports.transitionTo = exports.stepAsync = exports.runAsync = exports.runWithDebug = exports.createFlow = exports.runSequence = exports.yieldMachine = exports.step = exports.run = exports.MachineBase = void 0;
exports.createMachine = createMachine;
exports.createAsyncMachine = createAsyncMachine;
exports.createMachineFactory = createMachineFactory;
exports.setContext = setContext;
exports.overrideTransitions = overrideTransitions;
exports.extendTransitions = extendTransitions;
exports.combineFactories = combineFactories;
exports.createMachineBuilder = createMachineBuilder;
exports.matchMachine = matchMachine;
exports.hasState = hasState;
exports.runMachine = runMachine;
exports.next = next;
function createMachine(context, fnsOrFactory) {
    if (typeof fnsOrFactory === 'function') {
        let transitions;
        const transition = (newContext) => {
            const machine = createMachine(newContext, transitions);
            // Re-bind transitions to the new context
            const boundTransitions = Object.fromEntries(Object.entries(transitions).map(([key, fn]) => [
                key,
                fn.bind(newContext)
            ]));
            return Object.assign(machine, boundTransitions);
        };
        transitions = fnsOrFactory(transition);
        // Bind transitions to initial context
        const boundTransitions = Object.fromEntries(Object.entries(transitions).map(([key, fn]) => [
            key,
            fn.bind(context)
        ]));
        return Object.assign({ context }, boundTransitions);
    }
    // If fns is a machine (has context property), extract just the transition functions
    const transitions = 'context' in fnsOrFactory ? Object.fromEntries(Object.entries(fnsOrFactory).filter(([key]) => key !== 'context')) : fnsOrFactory;
    // For normal object transitions, we might also need binding if they use `this`
    // But existing code expects `this` to be the machine (context + transitions).
    // The new API expects `this` to be just context.
    const machine = Object.assign({ context }, transitions);
    return machine;
}
/**
 * Creates an asynchronous state machine from a context and async transition functions.
 *
 * @template C - The context object type.
 * @param context - The initial state context.
 * @param fns - An object containing async transition function definitions.
 * @returns A new async machine instance.
 */
function createAsyncMachine(context, fns) {
    return Object.assign({ context }, fns);
}
/**
 * Creates a machine factory - a higher-order function that simplifies machine creation.
 * Instead of writing transition logic that creates new machines, you just write
 * pure context transformation functions.
 *
 * @template C - The context object type.
 * @returns A factory configurator function.
 *
 * @example
 * const counterFactory = createMachineFactory<{ count: number }>()({
 *   increment: (ctx) => ({ count: ctx.count + 1 }),
 *   add: (ctx, n: number) => ({ count: ctx.count + n })
 * });
 *
 * const counter = counterFactory({ count: 0 });
 * const next = counter.increment(); // Returns new machine with count: 1
 */
function createMachineFactory() {
    return (transformers) => {
        const fns = Object.fromEntries(Object.entries(transformers).map(([key, transform]) => [
            key,
            function (...args) {
                const newContext = transform(this.context, ...args);
                return createMachine(newContext, fns);
            },
        ]));
        return (initialContext) => {
            return createMachine(initialContext, fns);
        };
    };
}
// =============================================================================
// SECTION: ADVANCED CREATION & IMMUTABLE HELPERS
// =============================================================================
/**
 * Creates a new machine instance with an updated context, preserving all original transitions.
 * This is the primary, type-safe utility for applying state changes.
 *
 * @template M - The machine type.
 * @param machine - The original machine instance.
 * @param newContextOrFn - The new context object or an updater function.
 * @returns A new machine instance of the same type with the updated context.
 */
function setContext(machine, newContextOrFn) {
    const { context, ...transitions } = machine;
    const newContext = typeof newContextOrFn === "function"
        ? newContextOrFn(context)
        : newContextOrFn;
    return createMachine(newContext, transitions);
}
/**
 * Creates a new machine by overriding or adding transition functions to an existing machine.
 * Ideal for mocking in tests or decorating functionality. The original machine is unchanged.
 *
 * @template M - The original machine type.
 * @template T - An object of new or overriding transition functions.
 * @param machine - The base machine instance.
 * @param overrides - An object containing the transitions to add or overwrite.
 * @returns A new machine instance with the merged transitions.
 */
function overrideTransitions(machine, overrides) {
    const { context, ...originalTransitions } = machine;
    const newTransitions = { ...originalTransitions, ...overrides };
    return createMachine(context, newTransitions);
}
/**
 * Creates a new machine by adding new transition functions.
 * This utility will produce a compile-time error if you attempt to add a
 * transition that already exists, preventing accidental overrides.
 *
 * @template M - The original machine type.
 * @template T - An object of new transition functions, whose keys must not exist in M.
 * @param machine - The base machine instance.
 * @param newTransitions - An object containing the new transitions to add.
 * @returns A new machine instance with the combined original and new transitions.
 */
function extendTransitions(machine, newTransitions) {
    const { context, ...originalTransitions } = machine;
    const combinedTransitions = { ...originalTransitions, ...newTransitions };
    return createMachine(context, combinedTransitions);
}
/**
 * Combines two machine factories into a single factory that creates machines with merged context and transitions.
 * This allows you to compose independent state machines that operate on different parts of the same context.
 *
 * The resulting factory takes the parameters of the first factory, while the second factory is called with no arguments.
 * Context properties are merged (second factory's context takes precedence on conflicts).
 * Transition names must not conflict between the two machines.
 *
 * @template F1 - The first factory function type.
 * @template F2 - The second factory function type.
 * @param factory1 - The first machine factory (provides parameters and primary context).
 * @param factory2 - The second machine factory (provides additional context and transitions).
 * @returns A new factory function that creates combined machines.
 *
 * @example
 * ```typescript
 * // Define two independent machines
 * const createCounter = (initial: number) =>
 *   createMachine({ count: initial }, {
 *     increment: function() { return createMachine({ count: this.context.count + 1 }, this); },
 *     decrement: function() { return createMachine({ count: this.context.count - 1 }, this); }
 *   });
 *
 * const createLogger = () =>
 *   createMachine({ logs: [] as string[] }, {
 *     log: function(message: string) {
 *       return createMachine({ logs: [...this.context.logs, message] }, this);
 *     },
 *     clear: function() {
 *       return createMachine({ logs: [] }, this);
 *     }
 *   });
 *
 * // Combine them
 * const createCounterWithLogging = combineFactories(createCounter, createLogger);
 *
 * // Use the combined factory
 * const machine = createCounterWithLogging(5); // { count: 5, logs: [] }
 * const incremented = machine.increment(); // { count: 6, logs: [] }
 * const logged = incremented.log("Count incremented"); // { count: 6, logs: ["Count incremented"] }
 * ```
 */
function combineFactories(factory1, factory2) {
    return (...args) => {
        // Create instances from both factories
        const machine1 = factory1(...args);
        const machine2 = factory2();
        // Merge contexts (machine2 takes precedence on conflicts)
        const combinedContext = { ...machine1.context, ...machine2.context };
        // Extract transitions from both machines
        const { context: _, ...transitions1 } = machine1;
        const { context: __, ...transitions2 } = machine2;
        // Combine transitions (TypeScript will catch conflicts at compile time)
        const combinedTransitions = { ...transitions1, ...transitions2 };
        // Create the combined machine
        return createMachine(combinedContext, combinedTransitions);
    };
}
/**
 * Creates a builder function from a "template" machine instance.
 * This captures the behavior of a machine and returns a factory that can stamp out
 * new instances with different initial contexts. Excellent for class-based machines.
 *
 * @template M - The machine type.
 * @param templateMachine - An instance of a machine to use as the template.
 * @returns A function that builds new machines of type M.
 */
function createMachineBuilder(templateMachine) {
    const { context, ...transitions } = templateMachine;
    return (newContext) => {
        return createMachine(newContext, transitions);
    };
}
/**
 * Pattern match on a machine's state based on a discriminant property in the context.
 * This provides type-safe exhaustive matching for state machines.
 *
 * @template M - The machine type.
 * @template K - The discriminant key in the context.
 * @template R - The return type.
 * @param machine - The machine to match against.
 * @param discriminantKey - The key in the context to use for matching (e.g., "status").
 * @param handlers - An object mapping each possible value to a handler function.
 * @returns The result of the matched handler.
 *
 * @example
 * const result = matchMachine(
 *   machine,
 *   'status',
 *   {
 *     idle: (ctx) => "Machine is idle",
 *     loading: (ctx) => "Loading...",
 *     success: (ctx) => `Success: ${ctx.data}`,
 *     error: (ctx) => `Error: ${ctx.error}`
 *   }
 * );
 */
function matchMachine(machine, discriminantKey, handlers) {
    const discriminant = machine.context[discriminantKey];
    const handler = handlers[discriminant];
    if (!handler) {
        throw new Error(`No handler found for state: ${String(discriminant)}`);
    }
    return handler(machine.context);
}
/**
 * Type-safe helper to assert that a machine's context has a specific discriminant value.
 * This narrows the type of the context based on the discriminant.
 *
 * @template M - The machine type.
 * @template K - The discriminant key.
 * @template V - The discriminant value.
 * @param machine - The machine to check.
 * @param key - The discriminant key to check.
 * @param value - The expected value.
 * @returns True if the discriminant matches, with type narrowing.
 *
 * @example
 * if (hasState(machine, 'status', 'loading')) {
 *   // machine.context.status is narrowed to 'loading'
 * }
 */
function hasState(machine, key, value) {
    return machine.context[key] === value;
}
// =============================================================================
// SECTION: RUNTIME & EVENT DISPATCHER
// =============================================================================
/**
 * Runs an asynchronous state machine with a managed lifecycle and event dispatch capability.
 * This is the "interpreter" for async machines, handling state updates and side effects.
 * Provides automatic AbortController management to prevent async race conditions.
 *
 * @template M - The initial machine type.
 * @param initial - The initial machine state.
 * @param onChange - Optional callback invoked with the new machine state after every transition.
 * @returns An object with a `state` getter for the current context, an async `dispatch` function, and a `stop` method.
 */
function runMachine(initial, onChange) {
    let current = initial;
    // Keep track of the controller for the currently-running async transition.
    let activeController = null;
    async function dispatch(event) {
        // 1. If an async transition is already in progress, cancel it.
        if (activeController) {
            activeController.abort();
            activeController = null;
        }
        const fn = current[event.type];
        if (typeof fn !== 'function') {
            throw new Error(`[Machine] Unknown event type '${String(event.type)}' on current state.`);
        }
        // 2. Create a new AbortController for this new transition.
        const controller = new AbortController();
        activeController = controller;
        try {
            // 3. Pass the signal to the transition function.
            const nextStatePromise = fn.apply(current.context, [...event.args, { signal: controller.signal }]);
            const nextState = await nextStatePromise;
            // 4. If this promise resolved but has since been aborted, do not update state.
            // This prevents the race condition.
            if (controller.signal.aborted) {
                // Return the *current* state, as if the transition never completed.
                return current;
            }
            current = nextState;
            onChange === null || onChange === void 0 ? void 0 : onChange(current);
            return current;
        }
        finally {
            // 5. Clean up the controller once the transition is complete (resolved or rejected).
            // Only clear it if it's still the active one.
            if (activeController === controller) {
                activeController = null;
            }
        }
    }
    return {
        /** Gets the context of the current state of the machine. */
        get state() {
            return current.context;
        },
        /** Dispatches a type-safe event to the machine, triggering a transition. */
        dispatch,
        /** Stops any pending async operation and cleans up resources. */
        stop: () => {
            if (activeController) {
                activeController.abort();
                activeController = null;
            }
        },
    };
}
/**
 * An optional base class for creating machines using an Object-Oriented style.
 *
 * This class provides the fundamental structure required by the library: a `context`
 * property to hold the state. By extending `MachineBase`, you get a clear and
 * type-safe starting point for defining states and transitions as classes and methods.
 *
 * Transitions should be implemented as methods that return a new instance of a
 * state machine class (often `new MyClass(...)` or by using a `createMachineBuilder`).
 * The `context` is marked `readonly` to enforce the immutable update pattern.
 *
 * @template C - The context object type that defines the state for this machine.
 *
 * @example
 * // Define a simple counter state
 * class Counter extends MachineBase<{ readonly count: number }> {
 *   constructor(count = 0) {
 *     super({ count });
 *   }
 *
 *   increment(): Counter {
 *     // Return a new instance for the next state
 *     return new Counter(this.context.count + 1);
 *   }
 *
 *   add(n: number): Counter {
 *     return new Counter(this.context.count + n);
 *   }
 * }
 *
 * const machine = new Counter(5);
 * const nextState = machine.increment(); // Returns a new Counter instance
 *
 * console.log(machine.context.count);    // 5 (original is unchanged)
 * console.log(nextState.context.count);  // 6 (new state)
 */
class MachineBase {
    /**
     * Initializes a new machine instance with its starting context.
     * @param context - The initial state of the machine.
     */
    constructor(context) {
        this.context = context;
        // Object.freeze can provide additional runtime safety against accidental mutation,
        // though it comes with a minor performance cost. It's a good practice for ensuring purity.
        // Object.freeze(this.context);
    }
}
exports.MachineBase = MachineBase;
/**
 * Applies an update function to a machine's context, returning a new machine.
 * This is a simpler alternative to `setContext` when you always use an updater function.
 *
 * @template C - The context object type.
 * @param m - The machine to update.
 * @param update - A function that takes the current context and returns the new context.
 * @returns A new machine with the updated context.
 *
 * @example
 * const updated = next(counter, (ctx) => ({ count: ctx.count + 1 }));
 */
function next(m, update) {
    const { context, ...transitions } = m;
    return createMachine(update(context), transitions);
}
// =============================================================================
// SECTION: GENERATOR-BASED COMPOSITION
// =============================================================================
var generators_1 = require("./generators");
Object.defineProperty(exports, "run", { enumerable: true, get: function () { return generators_1.run; } });
Object.defineProperty(exports, "step", { enumerable: true, get: function () { return generators_1.step; } });
Object.defineProperty(exports, "yieldMachine", { enumerable: true, get: function () { return generators_1.yieldMachine; } });
Object.defineProperty(exports, "runSequence", { enumerable: true, get: function () { return generators_1.runSequence; } });
Object.defineProperty(exports, "createFlow", { enumerable: true, get: function () { return generators_1.createFlow; } });
Object.defineProperty(exports, "runWithDebug", { enumerable: true, get: function () { return generators_1.runWithDebug; } });
Object.defineProperty(exports, "runAsync", { enumerable: true, get: function () { return generators_1.runAsync; } });
Object.defineProperty(exports, "stepAsync", { enumerable: true, get: function () { return generators_1.stepAsync; } });
// =============================================================================
// SECTION: TYPE-LEVEL METADATA PRIMITIVES
// =============================================================================
var primitives_1 = require("./primitives");
Object.defineProperty(exports, "transitionTo", { enumerable: true, get: function () { return primitives_1.transitionTo; } });
Object.defineProperty(exports, "describe", { enumerable: true, get: function () { return primitives_1.describe; } });
Object.defineProperty(exports, "guarded", { enumerable: true, get: function () { return primitives_1.guarded; } });
Object.defineProperty(exports, "guard", { enumerable: true, get: function () { return primitives_1.guard; } });
Object.defineProperty(exports, "guardAsync", { enumerable: true, get: function () { return primitives_1.guardAsync; } });
Object.defineProperty(exports, "whenGuard", { enumerable: true, get: function () { return primitives_1.whenGuard; } });
Object.defineProperty(exports, "whenGuardAsync", { enumerable: true, get: function () { return primitives_1.whenGuardAsync; } });
Object.defineProperty(exports, "invoke", { enumerable: true, get: function () { return primitives_1.invoke; } });
Object.defineProperty(exports, "action", { enumerable: true, get: function () { return primitives_1.action; } });
Object.defineProperty(exports, "metadata", { enumerable: true, get: function () { return primitives_1.metadata; } });
Object.defineProperty(exports, "META_KEY", { enumerable: true, get: function () { return primitives_1.META_KEY; } });
__exportStar(require("./multi"), exports);
__exportStar(require("./higher-order"), exports);
__exportStar(require("./extract"), exports);
// =============================================================================
// SECTION: MIDDLEWARE & INTERCEPTION
// =============================================================================
__exportStar(require("./middleware/index"), exports);
// =============================================================================
// SECTION: UTILITIES & HELPERS
// =============================================================================
var utils_1 = require("./utils");
Object.defineProperty(exports, "isState", { enumerable: true, get: function () { return utils_1.isState; } });
Object.defineProperty(exports, "createEvent", { enumerable: true, get: function () { return utils_1.createEvent; } });
Object.defineProperty(exports, "createTransition", { enumerable: true, get: function () { return utils_1.createTransition; } });
Object.defineProperty(exports, "mergeContext", { enumerable: true, get: function () { return utils_1.mergeContext; } });
Object.defineProperty(exports, "pipeTransitions", { enumerable: true, get: function () { return utils_1.pipeTransitions; } });
Object.defineProperty(exports, "logState", { enumerable: true, get: function () { return utils_1.logState; } });
Object.defineProperty(exports, "call", { enumerable: true, get: function () { return utils_1.call; } });
Object.defineProperty(exports, "bindTransitions", { enumerable: true, get: function () { return utils_1.bindTransitions; } });
Object.defineProperty(exports, "BoundMachine", { enumerable: true, get: function () { return utils_1.BoundMachine; } });
// =============================================================================
// SECTION: FUNCTIONAL COMBINATORS
// =============================================================================
var functional_combinators_1 = require("./functional-combinators");
Object.defineProperty(exports, "createTransitionFactory", { enumerable: true, get: function () { return functional_combinators_1.createTransitionFactory; } });
Object.defineProperty(exports, "createTransitionExtender", { enumerable: true, get: function () { return functional_combinators_1.createTransitionExtender; } });
Object.defineProperty(exports, "createFunctionalMachine", { enumerable: true, get: function () { return functional_combinators_1.createFunctionalMachine; } });
Object.defineProperty(exports, "state", { enumerable: true, get: function () { return functional_combinators_1.state; } });
