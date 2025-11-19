"use strict";
/**
 * @file multi.ts - Advanced operational patterns for state machine orchestration.
 * @description
 * This module provides optional, higher-level abstractions for managing machines.
 * They solve common ergonomic and integration challenges without compromising the
 * immutable core of the library.
 *
 * It introduces three patterns:
 *
 * 1.  **Runner (`createRunner`):** A stateful controller for ergonomic control
 *     of a single, immutable machine. Solves state reassignment.
 *
 * 2.  **Ensemble (`createEnsemble`):** A functional pattern for orchestrating logic
 *     over an external, framework-agnostic state store.
 *
 * 3.  **MultiMachine (`createMultiMachine`):** A class-based alternative to the
 *     Ensemble for OOP-style orchestration.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiMachineBase = void 0;
exports.createRunner = createRunner;
exports.createEnsemble = createEnsemble;
exports.createEnsembleFactory = createEnsembleFactory;
exports.runWithRunner = runWithRunner;
exports.runWithEnsemble = runWithEnsemble;
exports.createMultiMachine = createMultiMachine;
exports.createMutableMachine = createMutableMachine;
/**
 * Creates a Managed State Runner by wrapping a pure, immutable machine instance
 * in a stateful controller. This eliminates the need for `machine = machine.transition()`
 * reassignment, providing a more ergonomic, imperative API for complex local state.
 *
 * **How it works:**
 * 1. The runner holds a reference to the current machine internally
 * 2. When you call `runner.actions.transition()`, it calls the transition on the
 *    current machine and automatically updates the runner's internal state
 * 3. The runner exposes a stable `actions` object that always reflects what
 *    transitions are available on the *current* machine (important for Type-State)
 * 4. The `onChange` callback is invoked after every state change
 *
 * **Key difference from just calling transitions directly:**
 * Instead of: `let machine = createMachine(...); machine = machine.increment();`
 * You write: `const runner = createRunner(machine); runner.actions.increment();`
 *
 * The runner *is* the state holder, so you never need to reassign variables.
 *
 * @template M - The machine type.
 * @param initialMachine - The starting machine instance.
 * @param onChange - Optional callback fired after every state transition. Receives
 *   the new machine state, allowing you to react to changes (e.g., update a UI,
 *   log state changes, or trigger side effects).
 * @returns A `Runner` instance with `state`, `context`, `actions`, and `setState()`.
 *
 * @example
 * // Simple counter example
 * const counterMachine = createCounterMachine({ count: 0 });
 * const runner = createRunner(counterMachine, (newState) => {
 *   console.log('Count is now:', newState.context.count);
 * });
 *
 * runner.actions.increment(); // Logs: "Count is now: 1"
 * runner.actions.add(5);      // Logs: "Count is now: 6"
 * console.log(runner.context.count); // 6
 *
 * @example
 * // Type-State example with conditional narrowing
 * type AuthMachine = LoggedOutState | LoggedInState;
 *
 * const runner = createRunner(createLoggedOutMachine());
 *
 * // Narrow the type to access login
 * if (runner.state.context.status === 'loggedOut') {
 *   runner.actions.login('alice'); // Only works in loggedOut state
 * }
 *
 * // Now it's logged in, so we can call logout
 * if (runner.state.context.status === 'loggedIn') {
 *   runner.actions.logout();
 * }
 */
function createRunner(initialMachine, onChange) {
    let currentMachine = initialMachine;
    const setState = (newState) => {
        currentMachine = newState;
        onChange === null || onChange === void 0 ? void 0 : onChange(newState);
    };
    // Capture the original transitions from the initial machine
    const { context: _initialContext, ...originalTransitions } = initialMachine;
    const actions = new Proxy({}, {
        get(_target, prop) {
            const transition = currentMachine[prop];
            if (typeof transition !== 'function') {
                // Return undefined for properties that aren't valid transitions on the current state
                return undefined;
            }
            return (...args) => {
                const nextState = transition.apply(currentMachine.context, args);
                // Ensure the next state has all the original transitions
                // by reconstructing it with the original transition functions
                const nextStateWithTransitions = Object.assign({ context: nextState.context }, originalTransitions);
                setState(nextStateWithTransitions);
                return nextStateWithTransitions;
            };
        },
    });
    return {
        get state() {
            return currentMachine;
        },
        get context() {
            return currentMachine.context;
        },
        actions,
        setState,
    };
}
/**
 * Creates an Ensemble to orchestrate a state machine over an external state store.
 * This is the primary tool for framework integration, as it decouples pure state
 * logic (defined in factories) from an application's state management solution
 * (defined in store).
 *
 * **How it works:**
 * 1. You provide a `StateStore` that can read and write your application's state
 * 2. You define factory functions that create machines for each state
 * 3. You provide a `getDiscriminant` accessor that tells the Ensemble which
 *    factory to use based on the current context
 * 4. The Ensemble dynamically constructs the right machine and provides a stable
 *    `actions` object to call transitions
 *
 * **Why this pattern?**
 * Your business logic (machines) is completely separated from your state management
 * (React, Solid, Zustand). You can change state managers without rewriting machines,
 * and you can test machines in isolation without framework dependencies.
 *
 * @template C - The shared context type.
 * @template F - An object of functions that create machine instances for each state.
 *   Each factory receives the context and returns a Machine instance for that state.
 * @param store - The user-provided `StateStore` that reads/writes the context.
 * @param factories - An object mapping state discriminant keys to factory functions.
 *   Each factory receives the context and returns a machine instance.
 * @param getDiscriminant - An accessor function that takes the context and returns
 *   the key of the current state in the `factories` object. This provides full
 *   refactoring safety—if you rename a property in your context, TypeScript will
 *   catch it at the accessor function.
 * @returns An `Ensemble` instance with `context`, `state`, and `actions`.
 *
 * @example
 * // Using a simple in-memory store
 * let sharedContext = { status: 'idle' as const, data: null };
 * const store = {
 *   getContext: () => sharedContext,
 *   setContext: (newCtx) => { sharedContext = newCtx; }
 * };
 *
 * // Define factories for each state
 * const factories = {
 *   idle: (ctx) => createMachine(ctx, {
 *     fetch: () => store.setContext({ ...ctx, status: 'loading' })
 *   }),
 *   loading: (ctx) => createMachine(ctx, {
 *     succeed: (data: any) => store.setContext({ status: 'success', data }),
 *     fail: (error: string) => store.setContext({ status: 'error', error })
 *   }),
 *   success: (ctx) => createMachine(ctx, {
 *     retry: () => store.setContext({ status: 'loading', data: null })
 *   }),
 *   error: (ctx) => createMachine(ctx, {
 *     retry: () => store.setContext({ status: 'loading', data: null })
 *   })
 * };
 *
 * // Create the ensemble with a discriminant accessor
 * const ensemble = createEnsemble(store, factories, (ctx) => ctx.status);
 *
 * // Use the ensemble
 * ensemble.actions.fetch();
 * console.log(ensemble.context.status); // 'loading'
 *
 * @example
 * // React integration example
 * function useAppEnsemble() {
 *   const [context, setContext] = useState({ status: 'idle' as const, data: null });
 *
 *   const store: StateStore<typeof context> = {
 *     getContext: () => context,
 *     setContext: (newCtx) => setContext(newCtx)
 *   };
 *
 *   const ensemble = useMemo(() =>
 *     createEnsemble(store, factories, (ctx) => ctx.status),
 *     [context] // Re-create ensemble if context changes
 *   );
 *
 *   return ensemble;
 * }
 *
 * // In your component:
 * function MyComponent() {
 *   const ensemble = useAppEnsemble();
 *   return (
 *     <>
 *       <p>Status: {ensemble.context.status}</p>
 *       <button onClick={() => ensemble.actions.fetch()}>
 *         Fetch Data
 *       </button>
 *     </>
 *   );
 * }
 */
function createEnsemble(store, factories, getDiscriminant) {
    const getCurrentMachine = () => {
        const context = store.getContext();
        const currentStateName = getDiscriminant(context);
        const factory = factories[currentStateName];
        if (!factory) {
            throw new Error(`[Ensemble] Invalid state: No factory found for state "${String(currentStateName)}".`);
        }
        return factory(context);
    };
    const actions = new Proxy({}, {
        get(_target, prop) {
            const currentMachine = getCurrentMachine();
            const action = currentMachine[prop];
            if (typeof action !== 'function') {
                throw new Error(`[Ensemble] Transition "${prop}" is not valid in the current state.`);
            }
            // Return a function that, when called, executes the transition.
            // The transition itself is responsible for calling `store.setContext`.
            return (...args) => {
                return action.apply(currentMachine.context, args);
            };
        },
    });
    return {
        get context() {
            return store.getContext();
        },
        get state() {
            return getCurrentMachine();
        },
        actions,
    };
}
/**
 * Creates a factory for building type-safe, framework-agnostic Ensembles.
 * This is a higher-order function that captures the application's state store
 * and state-discriminant logic in a closure.
 *
 * This allows you to define your application's state "environment" once and then
 * easily create multiple, consistent ensembles by only providing the behavioral logic.
 *
 * @template C The shared context type for the application.
 * @param store The application's state store (e.g., from React, Zustand, etc.).
 * @param getDiscriminant An accessor function that determines the current state from the context.
 * @returns A `withFactories` function that is pre-configured for your app's environment.
 */
function createEnsembleFactory(store, getDiscriminant) {
    /**
     * This returned function is pre-configured with the `store` and `getDiscriminant` logic.
     * It takes the machine factories (the behavioral logic) and returns a complete Ensemble.
     *
     * @template F The type of the factories object.
     * @param factories An object where each key is a state name and each value is a
     *   function that creates a machine instance for that state.
     * @returns A fully-formed, reactive, and type-safe Ensemble instance.
     */
    return function withFactories(factories) {
        // We simply call the original createEnsemble with the captured arguments.
        return createEnsemble(store, factories, getDiscriminant);
    };
}
// =============================================================================
// SECTION 3: GENERATOR INTEGRATION
// =============================================================================
/**
 * Executes a generator-based workflow using a Managed State Runner.
 *
 * This provides the cleanest syntax for multi-step imperative workflows, as the
 * `yield` keyword is only used for control flow, not state passing. Unlike the
 * basic `run()` function from the core library, this works directly with a Runner,
 * making it perfect for complex local state orchestration.
 *
 * **Syntax benefits:**
 * - No need to manually thread state through a chain of transitions
 * - `yield` is purely for control flow, not for passing state
 * - Can use regular `if`/`for` statements without helpers
 * - Generator return value is automatically your final result
 *
 * @param flow - A generator function that receives the `Runner` instance. The
 *   generator can yield values (returned by transitions) and use them for control
 *   flow, or just yield for side effects.
 * @param initialMachine - The machine to start the flow with. A runner will be
 *   created from this automatically.
 * @returns The final value returned by the generator (the `return` statement).
 *
 * @example
 * // Simple sequential transitions
 * const result = runWithRunner(function* (runner) {
 *   yield runner.actions.increment();
 *   yield runner.actions.add(10);
 *   if (runner.context.count > 5) {
 *     yield runner.actions.reset();
 *   }
 *   return runner.context;
 * }, createCounterMachine());
 * console.log(result); // { count: 0 }
 *
 * @example
 * // Complex workflow with Type-State narrowing
 * const result = runWithRunner(function* (runner) {
 *   // Start logged out
 *   if (runner.state.context.status === 'loggedOut') {
 *     yield runner.actions.login('alice');
 *   }
 *
 *   // Now logged in, fetch profile
 *   if (runner.state.context.status === 'loggedIn') {
 *     yield runner.actions.fetchProfile();
 *   }
 *
 *   // Return final context
 *   return runner.context;
 * }, createAuthMachine());
 */
function runWithRunner(flow, initialMachine) {
    const runner = createRunner(initialMachine);
    const generator = flow(runner);
    let result = generator.next();
    while (!result.done) {
        result = generator.next();
    }
    return result.value;
}
/**
 * Executes a generator-based workflow using an Ensemble.
 *
 * This pattern is ideal for orchestrating complex sagas or workflows that
 * interact with a global, framework-managed state. Like `runWithRunner`,
 * it provides clean imperative syntax for multi-step workflows, but operates
 * on an Ensemble's external store rather than internal state.
 *
 * **Key differences from runWithRunner:**
 * - Works with external state stores (React, Solid, etc.)
 * - Useful for global workflows and sagas
 * - State changes automatically propagate to the framework
 * - Great for testing framework-agnostic state logic
 *
 * @param flow - A generator function that receives the `Ensemble` instance.
 *   The generator can read `ensemble.context` and call `ensemble.actions`.
 * @param ensemble - The `Ensemble` to run the workflow against. Its context
 *   is shared across the entire workflow.
 * @returns The final value returned by the generator (the `return` statement).
 *
 * @example
 * // Multi-step workflow with an ensemble
 * const result = runWithEnsemble(function* (ensemble) {
 *   // Fetch initial data
 *   if (ensemble.context.status === 'idle') {
 *     yield ensemble.actions.fetch();
 *   }
 *
 *   // Process the data
 *   if (ensemble.context.status === 'success') {
 *     yield ensemble.actions.process(ensemble.context.data);
 *   }
 *
 *   return ensemble.context;
 * }, ensemble);
 *
 * @example
 * // Testing a workflow without a UI framework
 * const store: StateStore<AppContext> = {
 *   getContext: () => context,
 *   setContext: (newCtx) => Object.assign(context, newCtx)
 * };
 *
 * const ensemble = createEnsemble(store, factories, (ctx) => ctx.status);
 *
 * // Run a complex workflow and assert the result
 * const result = runWithEnsemble(function* (e) {
 *   yield e.actions.login('alice');
 *   yield e.actions.fetchProfile();
 *   yield e.actions.updateEmail('alice@example.com');
 *   return e.context;
 * }, ensemble);
 *
 * expect(result.userEmail).toBe('alice@example.com');
 */
function runWithEnsemble(flow, ensemble) {
    const generator = flow(ensemble);
    let result = generator.next();
    while (!result.done) {
        result = generator.next();
    }
    return result.value;
}
// =============================================================================
// SECTION 4: CLASS-BASED MULTI-MACHINE (OOP APPROACH)
// =============================================================================
/**
 * The base class for creating a class-based state machine (MultiMachine).
 * Extend this class to define your state machine's logic using instance methods
 * as transitions.
 *
 * This approach is ideal for developers who prefer class-based architectures
 * and want to manage a shared context directly through an external StateStore.
 * It provides a familiar OOP interface while maintaining the decoupling benefits
 * of the StateStore pattern.
 *
 * **Key features:**
 * - Extend this class and define transition methods as instance methods
 * - Protected `context` getter provides access to the current state
 * - Protected `setContext()` method updates the external store
 * - Works seamlessly with `createMultiMachine()`
 *
 * @template C - The shared context type. Should typically contain a discriminant
 *   property (like `status`) that identifies the current state.
 *
 * @example
 * // Define your context type
 * type AppContext = { status: 'idle' | 'loading' | 'error'; data?: any; error?: string };
 *
 * // Extend MultiMachineBase and define transitions as methods
 * class AppMachine extends MultiMachineBase<AppContext> {
 *   async fetch(url: string) {
 *     // Notify subscribers we're loading
 *     this.setContext({ ...this.context, status: 'loading' });
 *
 *     try {
 *       const data = await fetch(url).then(r => r.json());
 *       // Update state when done
 *       this.setContext({ ...this.context, status: 'idle', data });
 *     } catch (error) {
 *       // Handle errors
 *       this.setContext({
 *         ...this.context,
 *         status: 'error',
 *         error: error.message
 *       });
 *     }
 *   }
 *
 *   reset() {
 *     this.setContext({ status: 'idle' });
 *   }
 * }
 */
class MultiMachineBase {
    /**
     * @param store - The StateStore that will manage this machine's context.
     */
    constructor(store) {
        this.store = store;
    }
    /**
     * Read-only access to the current context from the external store.
     * This getter always returns the latest context from the store.
     *
     * @protected
     *
     * @example
     * const currentStatus = this.context.status;
     * const currentData = this.context.data;
     */
    get context() {
        return this.store.getContext();
    }
    /**
     * Update the shared context in the external store.
     * Call this method in your transition methods to update the state.
     *
     * @protected
     * @param newContext - The new context object. Should typically be a shallow
     *   copy with only the properties you're changing, merged with the current
     *   context using spread operators.
     *
     * @example
     * // In a transition method:
     * this.setContext({ ...this.context, status: 'loading' });
     *
     * @example
     * // Updating nested properties:
     * this.setContext({
     *   ...this.context,
     *   user: { ...this.context.user, name: 'Alice' }
     * });
     */
    setContext(newContext) {
        this.store.setContext(newContext);
    }
}
exports.MultiMachineBase = MultiMachineBase;
/**
 * Creates a live, type-safe instance of a class-based state machine (MultiMachine).
 *
 * This is the class-based alternative to the functional `createEnsemble` pattern,
 * designed for developers who prefer an OOP-style architecture. This function takes
 * your MultiMachine class blueprint and an external state store, and wires them
 * together. The returned object is a Proxy that dynamically exposes both context
 * properties and the available transition methods from your class.
 *
 * **Key features:**
 * - Directly access context properties as if they were on the machine object
 * - Call transition methods to update state through the store
 * - Type-safe integration with TypeScript
 * - Seamless Proxy-based API (no special method names or API quirks)
 *
 * **How it works:**
 * The returned Proxy intercepts property access. For context properties, it returns
 * values from the store. For methods, it calls them on the MultiMachine instance.
 * This creates the illusion of a single object that is both data and behavior.
 *
 * @template C - The shared context type.
 * @template T - The MultiMachine class type.
 *
 * @param MachineClass - The class you defined that extends `MultiMachineBase<C>`.
 * @param store - The `StateStore` that will manage the machine's context.
 * @returns A Proxy that merges context properties with class methods, allowing
 *   direct access to both via a unified object interface.
 *
 * @example
 * // Define your context type
 * type CounterContext = { count: number };
 *
 * // Define your machine class
 * class CounterMachine extends MultiMachineBase<CounterContext> {
 *   increment() {
 *     this.setContext({ count: this.context.count + 1 });
 *   }
 *
 *   add(n: number) {
 *     this.setContext({ count: this.context.count + n });
 *   }
 *
 *   reset() {
 *     this.setContext({ count: 0 });
 *   }
 * }
 *
 * // Create a store
 * let sharedContext = { count: 0 };
 * const store = {
 *   getContext: () => sharedContext,
 *   setContext: (ctx) => { sharedContext = ctx; }
 * };
 *
 * // Create the machine instance
 * const machine = createMultiMachine(CounterMachine, store);
 *
 * // Use it naturally - properties and methods seamlessly integrated
 * console.log(machine.count); // 0
 * machine.increment();
 * console.log(machine.count); // 1
 * machine.add(5);
 * console.log(machine.count); // 6
 * machine.reset();
 * console.log(machine.count); // 0
 *
 * @example
 * // Status-based state machine with type discrimination
 * type AppContext = {
 *   status: 'idle' | 'loading' | 'success' | 'error';
 *   data?: any;
 *   error?: string;
 * };
 *
 * class AppMachine extends MultiMachineBase<AppContext> {
 *   async fetch() {
 *     this.setContext({ ...this.context, status: 'loading' });
 *     try {
 *       const data = await fetch('/api/data').then(r => r.json());
 *       this.setContext({ status: 'success', data });
 *     } catch (error) {
 *       this.setContext({
 *         status: 'error',
 *         error: error instanceof Error ? error.message : 'Unknown error'
 *       });
 *     }
 *   }
 *
 *   reset() {
 *     this.setContext({ status: 'idle' });
 *   }
 * }
 *
 * // Set up
 * let context: AppContext = { status: 'idle' };
 * const store = {
 *   getContext: () => context,
 *   setContext: (ctx) => { context = ctx; }
 * };
 *
 * const app = createMultiMachine(AppMachine, store);
 *
 * // Use naturally with type discrimination
 * console.log(app.status); // 'idle'
 *
 * if (app.status === 'idle') {
 *   app.fetch(); // Transition to loading
 * }
 *
 * // Later: app.status === 'success'
 * // console.log(app.data); // Access the data
 */
function createMultiMachine(MachineClass, store) {
    const instance = new MachineClass(store);
    return new Proxy({}, {
        get(_target, prop) {
            // 1. Prioritize properties from the context
            const context = store.getContext();
            if (prop in context) {
                return context[prop];
            }
            // 2. Then check for methods on the instance
            const method = instance[prop];
            if (typeof method === 'function') {
                return (...args) => {
                    return method.apply(instance, args);
                };
            }
            return undefined;
        },
        set(_target, prop, value) {
            // Allow direct mutation of context properties
            const context = store.getContext();
            if (prop in context) {
                const newContext = { ...context, [prop]: value };
                store.setContext(newContext);
                return true;
            }
            return false;
        },
        has(_target, prop) {
            // Support `in` operator checks
            const context = store.getContext();
            return prop in context || typeof instance[prop] === 'function';
        },
        ownKeys(_target) {
            // Support reflection APIs
            const context = store.getContext();
            const contextKeys = Object.keys(context);
            const methodKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(instance)).filter((key) => key !== 'constructor' && typeof instance[key] === 'function');
            return Array.from(new Set([...contextKeys, ...methodKeys]));
        },
        getOwnPropertyDescriptor(_target, prop) {
            // Support property descriptors
            const context = store.getContext();
            if (prop in context || typeof instance[prop] === 'function') {
                return {
                    value: undefined,
                    writable: true,
                    enumerable: true,
                    configurable: true,
                };
            }
            return undefined;
        },
    });
}
/**
* Creates a Mutable Machine that uses a shared, mutable context. This primitive
* provides a stable object reference whose properties are mutated in place,
* offering a direct, imperative API.
*
* ---
*
* ### Key Characteristics & Trade-offs
*
* - **Stable Object Reference**: The machine is a single object. You can pass this
*   reference around, and it will always reflect the current state.
* - **Direct Imperative API**: Transitions are called like methods directly on the
*   object (`machine.login('user')`), and the object's properties update immediately.
* - **No State History**: Since the context is mutated, the history of previous
*   states is not preserved, which makes patterns like time-travel debugging impossible.
* - **Not for Reactive UIs**: Most UI frameworks (React, Solid, Vue) rely on
*   immutable state changes to trigger updates. Mutating the context directly
*   will not cause components to re-render. Use the `Ensemble` primitive for UI integration.
*
* ---
*
* ### Best Suited For
*
* - **Backend Services & Game Logic**: Ideal for managing state in server-side
*   processes, game loops, or other non-UI environments where performance and a
*   stable state object are priorities.
* - **Complex Synchronous Scripts**: Useful for orchestrating data processing
*   pipelines, command-line tools, or any script where state needs to be managed
*   imperatively without passing it through a function chain.
*
* @template C - The shared context type.
* @template F - An object of functions that create machine instances for each state.
*   **Crucially, transitions inside these machines must be pure functions that
*   return the *next context object*, not a new machine instance.**
* @param sharedContext - The initial context object. This object will be mutated.
* @param factories - An object mapping state names to functions that create machine instances.
* @param getDiscriminant - An accessor function that takes the context and returns the key
*   of the current state in the `factories` object. Provides refactoring safety.
* @returns A Proxy that acts as a stable, mutable machine instance.
*
* @example
* // ===== 1. Basic Authentication Example =====
*
* type AuthContext =
*   | { status: 'loggedOut'; error?: string }
*   | { status: 'loggedIn'; username: string };
*
* const authFactories = {
*   loggedOut: (ctx: AuthContext) => ({
*     context: ctx,
*     // This transition is a PURE function that returns the NEXT CONTEXT
*     login: (username: string) => ({ status: 'loggedIn', username }),
*   }),
*   loggedIn: (ctx: AuthContext) => ({
*     context: ctx,
*     logout: () => ({ status: 'loggedOut' }),
*   }),
* };
*
* const authUser = createMutableMachine(
*   { status: 'loggedOut' } as AuthContext,
*   authFactories,
*   'status'
* );
*
* const userReference = authUser; // Store a reference to the object
*
* console.log(authUser.status); // 'loggedOut'
*
* authUser.login('alice'); // Mutates the object in place
*
* console.log(authUser.status); // 'loggedIn'
* console.log(authUser.username); // 'alice'
*
* // The original reference points to the same, mutated object
* console.log(userReference.status); // 'loggedIn'
* console.log(userReference === authUser); // true
*
* // --- Type-safe transitions ---
* // `authUser.login('bob')` would now throw a runtime error because `login`
* // is not a valid action in the 'loggedIn' state.
*
* if (authUser.status === 'loggedIn') {
*   // TypeScript correctly narrows the type here, allowing a safe call.
*   authUser.logout();
* }
* console.log(authUser.status); // 'loggedOut'
*
* @example
* // ===== 2. Game State Loop Example =====
*
* type PlayerContext = {
*   state: 'idle' | 'walking' | 'attacking';
*   hp: number;
*   position: { x: number; y: number };
* };
*
* const playerFactories = {
*   idle: (ctx: PlayerContext) => ({
*     context: ctx,
*     walk: (dx: number, dy: number) => ({ ...ctx, state: 'walking', position: { x: ctx.position.x + dx, y: ctx.position.y + dy } }),
*     attack: () => ({ ...ctx, state: 'attacking' }),
*   }),
*   walking: (ctx: PlayerContext) => ({
*     context: ctx,
*     stop: () => ({ ...ctx, state: 'idle' }),
*   }),
*   attacking: (ctx: PlayerContext) => ({
*     context: ctx,
*     finishAttack: () => ({ ...ctx, state: 'idle' }),
*   }),
* };
*
* const player = createMutableMachine(
*   { state: 'idle', hp: 100, position: { x: 0, y: 0 } },
*   playerFactories,
*   (ctx) => ctx.state
* );
*
* // Simulate a game loop
* function processInput(input: 'move_right' | 'attack') {
*   if (player.state === 'idle') {
*     if (input === 'move_right') player.walk(1, 0);
*     if (input === 'attack') player.attack();
*   }
*   console.log(`State: ${player.state}, Position: (${player.position.x}, ${player.position.y})`);
* }
*
* processInput('move_right'); // State: walking, Position: (1, 0)
* player.stop();
* processInput('attack'); // State: attacking, Position: (1, 0)
*/
function createMutableMachine(sharedContext, factories, getDiscriminant) {
    const getCurrentMachine = () => {
        const currentStateName = getDiscriminant(sharedContext);
        const factory = factories[currentStateName];
        if (!factory) {
            throw new Error(`[MutableMachine] Invalid state: No factory for state "${String(currentStateName)}".`);
        }
        return factory(sharedContext);
    };
    return new Proxy(sharedContext, {
        get(target, prop, _receiver) {
            // 1. Prioritize properties on the context object itself.
            if (prop in target) {
                return target[prop];
            }
            // 2. If not on context, check if it's a valid transition for the current state.
            const currentMachine = getCurrentMachine();
            const transition = currentMachine[prop];
            if (typeof transition === 'function') {
                return (...args) => {
                    // This pattern requires transitions to be pure functions that return the next context.
                    const nextContext = transition.apply(currentMachine.context, args);
                    if (typeof nextContext !== 'object' || nextContext === null) {
                        console.warn(`[MutableMachine] Transition "${String(prop)}" did not return a valid context object. State may be inconsistent.`);
                        return;
                    }
                    // 3. Mutate the shared context with the result.
                    // Clear existing keys before assigning to handle removed properties.
                    Object.keys(target).forEach(key => delete target[key]);
                    Object.assign(target, nextContext);
                };
            }
            return undefined;
        },
        set(target, prop, value, _receiver) {
            // Allow direct mutation of the context
            target[prop] = value;
            return true;
        },
        has(target, prop) {
            // Let checks like `if ('login' in machine)` work correctly.
            const currentMachine = getCurrentMachine();
            return prop in target || typeof currentMachine[prop] === 'function';
        }
    });
}
