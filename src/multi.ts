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

import {
  Machine,
  Context,
  TransitionArgs,
  TransitionNames,
  // Transitions,
} from './index';

// =============================================================================
// SECTION 1: THE MANAGED STATE RUNNER
// =============================================================================

/**
 * A mapped type that creates a new object type with the same transition methods
 * as the machine `M`, but pre-bound to update a Runner's internal state.
 *
 * When you call a method on `BoundTransitions`, it automatically transitions the
 * runner's state and returns the new machine instance. This is the key mechanism
 * that eliminates the need for manual state reassignment in imperative code.
 *
 * @template M - The machine type, which can be a union of multiple machine states.
 *
 * @example
 * // If your machine has these transitions:
 * // increment: () => Machine
 * // add: (n: number) => Machine
 * // Then BoundTransitions<typeof machine> provides:
 * // increment: () => Machine (auto-updates runner state)
 * // add: (n: number) => Machine (auto-updates runner state)
 */
export type BoundTransitions<M extends Machine<any>> = {
  [K in TransitionNames<M>]: (
    ...args: TransitionArgs<M, K>
  ) => M[K] extends (...args: any[]) => infer R ? R : never;
};

/**
 * A stateful controller that wraps an immutable machine instance, providing a
 * stable API for imperative state transitions without manual reassignment.
 *
 * The Runner holds the "current" machine state internally and updates it whenever
 * an action is called. This solves the ergonomic problem of having to write:
 * `machine = machine.transition()` over and over. Instead, you just call
 * `runner.actions.transition()` and the runner manages the state for you.
 *
 * **Use Runner for:**
 * - Complex local component state (React, Vue, Svelte components)
 * - Scripts that need clean imperative state management
 * - Situations where you have a single, self-contained state machine
 *
 * **Don't use Runner for:**
 * - Global application state (use Ensemble instead)
 * - Multiple interconnected machines
 *
 * @template M - The machine type (can be a union of states for Type-State patterns).
 */
export type Runner<M extends Machine<any>> = {
  /**
   * The current, raw machine instance. This property is essential for
   * type-narrowing in Type-State Programming patterns.
   *
   * Since machines can be unions of different state types, you can narrow
   * the type by checking `runner.state.context` properties, and TypeScript
   * will automatically narrow which transitions are available.
   *
   * @example
   * if (runner.state.context.status === 'loggedIn') {
   *   // runner.state is now typed as LoggedInMachine
   *   console.log(runner.state.context.username);
   *   runner.actions.logout(); // Only available when logged in
   * }
   */
  readonly state: M;

  /**
   * A direct, readonly accessor to the context of the current machine state.
   * This is a convenience property equivalent to `runner.state.context`.
   *
   * @example
   * console.log(runner.context.count); // Same as runner.state.context.count
   */
  readonly context: Context<M>;

  /**
   * A stable object containing all available transition methods, pre-bound to
   * update the runner's state. This is the primary way to trigger transitions.
   *
   * When you call `runner.actions.someTransition()`, the runner automatically:
   * 1. Calls the transition on the current machine
   * 2. Updates `runner.state` with the new machine instance
   * 3. Fires the `onChange` callback (if provided to createRunner)
   * 4. Returns the new machine instance
   *
   * Note: For union-type machines, you must first narrow the type of `runner.state`
   * to ensure a given action is available at compile time.
   *
   * @example
   * runner.actions.increment(); // Automatically updates runner.state
   * runner.actions.add(5);       // Returns new machine instance
   */
  readonly actions: BoundTransitions<M>;

  /**
   * Manually sets the runner to a new machine state. Useful for resetting state
   * or synchronizing with external events.
   *
   * This method bypasses the normal transition path and directly updates the
   * runner's internal state. The `onChange` callback will be called.
   *
   * @param newState - The new machine instance to set.
   *
   * @example
   * const reset = createCounterMachine({ count: 0 });
   * runner.setState(reset); // Jump back to initial state
   */
  setState(newState: M): void;
};

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
export function createRunner<M extends Machine<any>>(
  initialMachine: M,
  onChange?: (newState: M) => void
): Runner<M> {
  let currentMachine = initialMachine;

  const setState = (newState: M) => {
    currentMachine = newState;
    onChange?.(newState);
  };

  // Capture the original transitions from the initial machine
  const { context: _initialContext, ...originalTransitions } = initialMachine;

  const actions = new Proxy({} as BoundTransitions<M>, {
    get(_target, prop: string) {
      const transition = (currentMachine as any)[prop];
      if (typeof transition !== 'function') {
        // Return undefined for properties that aren't valid transitions on the current state
        return undefined;
      }

      return (...args: any[]) => {
        const nextState = transition.apply(currentMachine.context, args);
        // Ensure the next state has all the original transitions
        // by reconstructing it with the original transition functions
        const nextStateWithTransitions = Object.assign(
          { context: nextState.context },
          originalTransitions
        ) as M;
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

// =============================================================================
// SECTION 2: THE ENSEMBLE (FRAMEWORK-AGNOSTIC ORCHESTRATION)
// =============================================================================

/**
 * Defines the contract for an external, user-provided state store. The Ensemble
 * uses this interface to read and write the machine's context, allowing it to
 * plug into any state management solution (React, Solid, Zustand, etc.).
 *
 * **The power of this abstraction:**
 * Your machine logic is completely decoupled from how or where the state is stored.
 * The same machine factories can work with React's `useState`, Solid's `createSignal`,
 * a plain object, or any custom store implementation.
 *
 * **Implementation examples:**
 * - React: `{ getContext: () => state, setContext: setState }`
 * - Solid: `{ getContext: () => store, setContext: (newCtx) => Object.assign(store, newCtx) }`
 * - Plain object: `{ getContext: () => context, setContext: (ctx) => Object.assign(context, ctx) }`
 *
 * @template C - The shared context object type.
 *
 * @example
 * // Implement a simple in-memory store
 * let sharedContext = { status: 'idle' };
 * const store: StateStore<typeof sharedContext> = {
 *   getContext: () => sharedContext,
 *   setContext: (newCtx) => { sharedContext = newCtx; }
 * };
 *
 * @example
 * // Implement a React-based store
 * function useAppStore() {
 *   const [state, setState] = useState({ status: 'idle' });
 *   return {
 *     getContext: () => state,
 *     setContext: setState
 *   };
 * }
 */
export interface StateStore<C extends object> {
  /**
   * A function that returns the current, up-to-date context from the external store.
   * Called whenever the Ensemble needs the latest state.
   */
  getContext: () => C;

  /**
   * A function that takes a new context and updates the external store.
   * Called by transitions to persist state changes.
   *
   * @param newContext - The new context object to persist.
   */
  setContext: (newContext: C) => void;
}

/**
 * A mapped type that finds all unique transition names across a union of machine types.
 *
 * This type extracts the union of all methods from all possible machine states,
 * excluding the `context` property. This is used to create the `actions` object
 * on an Ensemble, which can have methods from any of the machine states.
 *
 * At runtime, the Ensemble validates that an action is valid for the current state
 * before executing it.
 *
 * @template AllMachines - A union of all possible machine types in an Ensemble.
 *
 * @example
 * type IdleState = Machine<{ status: 'idle' }> & { fetch: () => LoadingState };
 * type LoadingState = Machine<{ status: 'loading' }> & { cancel: () => IdleState };
 * type AllStates = IdleState | LoadingState;
 *
 * // AllTransitions<AllStates> = { fetch: (...) => ..., cancel: (...) => ... }
 * // (Both fetch and cancel are available, but each is only valid in its state)
 */
type AllTransitions<AllMachines extends Machine<any>> = Omit<
  { [K in keyof AllMachines]: AllMachines[K] }[keyof AllMachines],
  'context'
>;

/**
 * The Ensemble object. It provides a stable, unified API for orchestrating a
 * state machine whose context is managed by an external store.
 *
 * The Ensemble acts as the "director," determining which machine "actor" is
 * currently active based on the state of the shared context. Unlike a Runner,
 * which manages local state, an Ensemble plugs into external state management
 * (like React's useState, Solid's signal, or a global store).
 *
 * **Key characteristics:**
 * - Dynamically reconstructs the current machine based on context
 * - Validates transitions at runtime for the current state
 * - Integrates seamlessly with framework state managers
 * - Same factories can be reused across different frameworks
 *
 * **Use Ensemble for:**
 * - Global application state
 * - Framework integration (React, Solid, Vue, etc.)
 * - Complex workflows that span multiple components
 * - Decoupling business logic from UI framework
 *
 * @template AllMachines - A union type of all possible machine states.
 * @template C - The shared context type.
 */
export type Ensemble<AllMachines extends Machine<any>, C extends object> = {
  /**
   * A direct, readonly accessor to the context from the provided `StateStore`.
   * This is always up-to-date with the external store.
   */
  readonly context: C;

  /**
   * The current, fully-typed machine instance. This is dynamically created on-demand
   * based on the context state. Use this for type-narrowing with Type-State patterns.
   *
   * The machine is reconstructed on every access, so it always reflects the
   * current state of the context.
   */
  readonly state: AllMachines;

  /**
   * A stable object containing all possible actions from all machine states.
   * The Ensemble performs a runtime check to ensure an action is valid for the
   * current state before executing it.
   *
   * The `actions` object itself is stable (doesn't change), but the methods
   * available on it dynamically change based on the current state.
   */
  readonly actions: AllTransitions<AllMachines>;
};

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
export function createEnsemble<
  C extends object,
  F extends Record<string, (context: C) => Machine<C>>
>(
  store: StateStore<C>,
  factories: F,
  getDiscriminant: (context: C) => keyof F
): Ensemble<ReturnType<F[keyof F]>, C> {
  type AllMachines = ReturnType<F[keyof F]>;

  const getCurrentMachine = (): AllMachines => {
    const context = store.getContext();
    const currentStateName = getDiscriminant(context);
    const factory = factories[currentStateName];

    if (!factory) {
      throw new Error(
        `[Ensemble] Invalid state: No factory found for state "${String(currentStateName)}".`
      );
    }
    return factory(context) as AllMachines;
  };

  const actions = new Proxy({} as AllTransitions<AllMachines>, {
    get(_target, prop: string) {
      const currentMachine = getCurrentMachine();
      const action = (currentMachine as any)[prop];

      if (typeof action !== 'function') {
        throw new Error(
          `[Ensemble] Transition "${prop}" is not valid in the current state.`
        );
      }

      // Return a function that, when called, executes the transition.
      // The transition itself is responsible for calling `store.setContext`.
      return (...args: any[]) => {
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
export function runWithRunner<M extends Machine<any>, T>(
  flow: (runner: Runner<M>) => Generator<any, T, any>,
  initialMachine: M
): T {
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
export function runWithEnsemble<
  AllMachines extends Machine<any>,
  C extends object,
  T
>(
  flow: (ensemble: Ensemble<AllMachines, C>) => Generator<any, T, any>,
  ensemble: Ensemble<AllMachines, C>
): T {
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
export abstract class MultiMachineBase<C extends object> {
  /**
   * The external state store that manages the machine's context.
   * @protected
   */
  protected store: StateStore<C>;

  /**
   * @param store - The StateStore that will manage this machine's context.
   */
  constructor(store: StateStore<C>) {
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
  protected get context(): C {
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
  protected setContext(newContext: C): void {
    this.store.setContext(newContext);
  }
}

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
export function createMultiMachine<
  C extends object,
  T extends MultiMachineBase<C>
>(
  MachineClass: new (store: StateStore<C>) => T,
  store: StateStore<C>
): C & T {
  const instance = new MachineClass(store);

  return new Proxy({} as C & T, {
    get(_target, prop: string | symbol) {
      // 1. Prioritize properties from the context
      const context = store.getContext();
      if (prop in context) {
        return (context as any)[prop];
      }

      // 2. Then check for methods on the instance
      const method = (instance as any)[prop];
      if (typeof method === 'function') {
        return (...args: any[]) => {
          return method.apply(instance, args);
        };
      }

      return undefined;
    },

    set(_target, prop: string | symbol, value: any) {
      // Allow direct mutation of context properties
      const context = store.getContext();
      if (prop in context) {
        const newContext = { ...context, [prop]: value } as C;
        store.setContext(newContext);
        return true;
      }
      return false;
    },

    has(_target, prop: string | symbol) {
      // Support `in` operator checks
      const context = store.getContext();
      return prop in context || typeof (instance as any)[prop] === 'function';
    },

    ownKeys(_target) {
      // Support reflection APIs
      const context = store.getContext();
      const contextKeys = Object.keys(context);
      const methodKeys = Object.getOwnPropertyNames(
        Object.getPrototypeOf(instance)
      ).filter((key) => key !== 'constructor' && typeof (instance as any)[key] === 'function');
      return Array.from(new Set([...contextKeys, ...methodKeys]));
    },

    getOwnPropertyDescriptor(_target, prop) {
      // Support property descriptors
      const context = store.getContext();
      if (prop in context || typeof (instance as any)[prop] === 'function') {
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

// =============================================================================
// SECTION 5: THE MUTABLE MACHINE (EXPERIMENTAL)
// =============================================================================

/**
 * A mapped type that defines the shape of a Mutable Machine: an intersection
 * of the context `C` and all possible transitions.
 */
type MutableMachine<C extends object, AllMachines extends Machine<any>> = C &
  AllTransitions<AllMachines>;


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
export function createMutableMachine<
  C extends object,
  F extends Record<string, (context: C) => Machine<C>>
>(
  sharedContext: C,
  factories: F,
  getDiscriminant: (context: C) => keyof F
): MutableMachine<C, ReturnType<F[keyof F]>> {
  const getCurrentMachine = (): ReturnType<F[keyof F]> => {
    const currentStateName = getDiscriminant(sharedContext);
    const factory = factories[currentStateName];
    if (!factory) {
      throw new Error(
        `[MutableMachine] Invalid state: No factory for state "${String(currentStateName)}".`
      );
    }
    return factory(sharedContext) as ReturnType<F[keyof F]>;
  };

  return new Proxy(sharedContext, {
    get(target, prop, _receiver) {
      // 1. Prioritize properties on the context object itself.
      if (prop in target) {
        return (target as any)[prop];
      }

      // 2. If not on context, check if it's a valid transition for the current state.
      const currentMachine = getCurrentMachine();
      const transition = (currentMachine as any)[prop];

      if (typeof transition === 'function') {
        return (...args: any[]) => {
          // This pattern requires transitions to be pure functions that return the next context.
          const nextContext = transition.apply(currentMachine.context, args);
          if (typeof nextContext !== 'object' || nextContext === null) {
            console.warn(`[MutableMachine] Transition "${String(prop)}" did not return a valid context object. State may be inconsistent.`);
            return;
          }
          // 3. Mutate the shared context with the result.
          // Clear existing keys before assigning to handle removed properties.
          Object.keys(target).forEach(key => delete (target as any)[key]);
          Object.assign(target, nextContext);
        };
      }

      return undefined;
    },
    set(target, prop, value, _receiver) {
        // Allow direct mutation of the context
        (target as any)[prop] = value;
        return true;
    },
    has(target, prop) {
      // Let checks like `if ('login' in machine)` work correctly.
      const currentMachine = getCurrentMachine();
      return prop in target || typeof (currentMachine as any)[prop] === 'function';
    }
  }) as MutableMachine<C, ReturnType<F[keyof F]>>;
}