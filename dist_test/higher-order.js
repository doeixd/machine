"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.delegateToChild = delegateToChild;
exports.toggle = toggle;
exports.createFetchMachine = createFetchMachine;
exports.createParallelMachine = createParallelMachine;
const index_1 = require("./index"); // Assuming this is a sibling package or in the same project
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
function delegateToChild(actionName) {
    return function (...args) {
        const child = this.context.child;
        if (typeof child[actionName] === 'function') {
            const newChildState = child[actionName](...args);
            return (0, index_1.setContext)(this, { ...this.context, child: newChildState });
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
function toggle(prop) {
    return function () {
        // Ensure the property is boolean-like for a sensible toggle
        if (typeof this.context[prop] !== 'boolean') {
            console.warn(`[toggle primitive] Property '${String(prop)}' is not a boolean. Toggling may have unexpected results.`);
        }
        return (0, index_1.setContext)(this, {
            ...this.context,
            [prop]: !this.context[prop],
        });
    };
}
// --- Machine State Classes (internal) ---
class IdleMachine extends index_1.MachineBase {
    constructor(config) {
        super({ status: 'idle' });
        this.config = config;
        this.fetch = (params) => new LoadingMachine(this.config, params !== null && params !== void 0 ? params : this.config.initialParams, 1);
    }
}
class LoadingMachine extends index_1.MachineBase {
    constructor(config, params, attempts) {
        super({ status: 'loading', abortController: new AbortController(), attempts });
        this.config = config;
        this.params = params;
        this.succeed = (data) => {
            var _a, _b;
            (_b = (_a = this.config).onSuccess) === null || _b === void 0 ? void 0 : _b.call(_a, data);
            return new SuccessMachine(this.config, { status: 'success', data });
        };
        this.fail = (error) => {
            var _a, _b, _c;
            const maxRetries = (_a = this.config.maxRetries) !== null && _a !== void 0 ? _a : 3;
            if (this.context.attempts < maxRetries) {
                return new RetryingMachine(this.config, this.params, error, this.context.attempts);
            }
            (_c = (_b = this.config).onError) === null || _c === void 0 ? void 0 : _c.call(_b, error);
            return new ErrorMachine(this.config, { status: 'error', error });
        };
        this.cancel = () => {
            this.context.abortController.abort();
            return new CanceledMachine(this.config);
        };
        this.execute(); // Auto-execute on creation
    }
    async execute() {
        // This is a "fire-and-forget" call that transitions the machine internally.
        // In a real implementation, this would be managed by an external runner.
        // For this example, we assume an external mechanism calls `succeed`, `fail`, etc.
    }
}
class RetryingMachine extends index_1.MachineBase {
    constructor(config, params, error, attempts) {
        super({ status: 'retrying', error, attempts });
        this.config = config;
        this.params = params;
        // This would be called after a delay.
        this.retry = (params) => new LoadingMachine(this.config, params !== null && params !== void 0 ? params : this.params, this.context.attempts + 1);
        // In a real implementation, you'd have a delay here (e.g., exponential backoff)
        // before transitioning to LoadingMachine again.
    }
}
class SuccessMachine extends index_1.MachineBase {
    constructor(config, context) {
        super(context);
        this.config = config;
        this.refetch = (params) => new LoadingMachine(this.config, params !== null && params !== void 0 ? params : this.config.initialParams, 1);
    }
}
class ErrorMachine extends index_1.MachineBase {
    constructor(config, context) {
        super(context);
        this.config = config;
        this.retry = (params) => new LoadingMachine(this.config, params !== null && params !== void 0 ? params : this.config.initialParams, 1);
    }
}
class CanceledMachine extends index_1.MachineBase {
    constructor(config) {
        super({ status: 'canceled' });
        this.config = config;
        this.refetch = (params) => new LoadingMachine(this.config, params !== null && params !== void 0 ? params : this.config.initialParams, 1);
    }
}
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
function createFetchMachine(config) {
    // A more robust implementation would validate the config here.
    return new IdleMachine(config);
}
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
function createParallelMachine(m1, m2) {
    // 1. Combine the contexts
    const combinedContext = { ...m1.context, ...m2.context };
    const transitions1 = { ...m1 };
    const transitions2 = { ...m2 };
    delete transitions1.context;
    delete transitions2.context;
    const combinedTransitions = {};
    // 2. Re-wire transitions from the first machine
    for (const key in transitions1) {
        const transitionFn = transitions1[key];
        combinedTransitions[key] = (...args) => {
            const nextM1 = transitionFn.apply(m1.context, args);
            // Recursively create a new parallel machine with the new M1 state
            return createParallelMachine(nextM1, m2);
        };
    }
    // 3. Re-wire transitions from the second machine
    for (const key in transitions2) {
        const transitionFn = transitions2[key];
        combinedTransitions[key] = (...args) => {
            const nextM2 = transitionFn.apply(m2.context, args);
            // Recursively create a new parallel machine with the new M2 state
            return createParallelMachine(m1, nextM2);
        };
    }
    return {
        context: combinedContext,
        ...combinedTransitions,
    };
}
