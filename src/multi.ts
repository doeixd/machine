/**
 * @file multi.ts - Advanced Primitives for State Machine Orchestration
 * @description
 * This module provides advanced, optional primitives for managing state machines
 * with improved ergonomics and deep framework integration. These tools are built
 * upon the immutable core of `@doeixd/machine` but offer alternative ways to

 * interact with state, solving the need for constant variable reassignment.
 *
 * It introduces two primary concepts:
 *
 * 1.  **Runner**: A stateful controller that wraps a single, self-contained,
 *     immutable machine. It provides a stable `actions` object, so you can call
 *     transitions imperatively (`runner.actions.increment()`) without reassigning
 *     the machine variable. This is ideal for simplifying complex local state.
 *
 * 2.  **Ensemble**: A powerful orchestration engine that decouples state logic
 *     (the machine) from state storage. It plugs into external, framework-specific
 *     state managers (like Solid Stores, React's `useState`, or Zustand) via a
 *     simple `StateStore` interface. This is the recommended solution for machines
 *     that need to interact with or drive global application state.
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
 * @template M - The machine type, which can be a union of multiple machine states.
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
 * an action is called.
 * @template M - The machine type (can be a union of states).
 */
export type Runner<M extends Machine<any>> = {
  /**
   * The current, raw machine instance. This property is essential for
   * type-narrowing in Type-State Programming patterns.
   * @example
   * if (runner.state.context.status === 'loggedIn') {
   *   // runner.state is now typed as LoggedInMachine
   *   console.log(runner.state.context.username);
   * }
   */
  readonly state: M;

  /** A direct, readonly accessor to the context of the current machine state. */
  readonly context: Context<M>;

  /**
   * A stable object containing all available transition methods, pre-bound to
   * update the runner's state. This is the primary way to trigger transitions.
   * Note: For union-type machines, you must first narrow the type of `runner.state`
   * to ensure a given action is available at compile time.
   */
  readonly actions: BoundTransitions<M>;

  /**
   * Manually sets the runner to a new machine state. Useful for resetting state
   * or synchronizing with external events.
   * @param newState - The new machine instance to set.
   */
  setState(newState: M): void;
};

/**
 * Creates a Managed State Runner for a given machine.
 *
 * This function wraps a pure, immutable state machine in a stateful controller,
 * eliminating the need for `machine = machine.transition()` reassignment.
 * It's the recommended way to handle complex, multi-step local state.
 *
 * @template M - The machine type.
 * @param initialMachine - The starting machine instance.
 * @param onChange - An optional callback that fires with the new state after every transition.
 * @returns A `Runner` instance with a stable API.
 *
 * @example
 * const counterMachine = createCounterMachine({ count: 0 });
 * const runner = createRunner(counterMachine, (newState) => {
 *   console.log('Count is now:', newState.context.count);
 * });
 *
 * runner.actions.increment(); // Logs: "Count is now: 1"
 * runner.actions.add(5);      // Logs: "Count is now: 6"
 * console.log(runner.context.count); // 6
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

  const actions = new Proxy({} as BoundTransitions<M>, {
    get(_target, prop: string) {
      const transition = (currentMachine as any)[prop];
      if (typeof transition !== 'function') {
        // Return undefined for properties that aren't valid transitions on the current state
        return undefined;
      }

      return (...args: any[]) => {
        const nextState = transition.apply(currentMachine, args);
        setState(nextState);
        return nextState;
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
 * @template C - The shared context object type.
 */
export interface StateStore<C extends object> {
  /** A function that returns the current, up-to-date context from the external store. */
  getContext: () => C;
  /** A function that takes a new context and updates the external store. */
  setContext: (newContext: C) => void;
}

/**
 * A mapped type that finds all unique transition names across a union of machine types.
 * @template AllMachines - A union of all possible machine types in an Ensemble.
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
 * currently active based on the state of the shared context.
 *
 * @template AllMachines - A union type of all possible machine states.
 * @template C - The shared context type.
 */
export type Ensemble<AllMachines extends Machine<any>, C extends object> = {
  /** A direct, readonly accessor to the context from the provided `StateStore`. */
  readonly context: C;

  /**
   * The current, fully-typed machine instance. This is dynamically created on-demand
   * based on the context. Use this for type-narrowing.
   */
  readonly state: AllMachines;

  /**
   * A stable object containing all possible actions from all machine states.
   * The Ensemble performs a runtime check to ensure an action is valid for the
   * current state before executing it.
   */
  readonly actions: AllTransitions<AllMachines>;
};

/**
 * Creates an Ensemble to orchestrate a state machine over an external state store.
 *
 * This is the ultimate tool for framework integration. It decouples your pure state
 * logic (defined in `factories`) from your application's state management solution
 * (defined in `store`), making your business logic portable and easy to test.
 *
 * @template C - The shared context type, which MUST include a discriminant property.
 * @template Factories - An object of functions that create machine instances for each state.
 * @param store - The user-provided `StateStore` that reads/writes the context.
 * @param factories - An object mapping state names to functions that create machine instances.
 * @param discriminantKey - The key in the context object (e.g., "status") that the
 *   Ensemble uses to determine the current state and select the correct factory.
 * @returns An `Ensemble` instance providing a stable API.
 *
 * @example
 * // Using a simple object as a store
 * let sharedContext = { status: 'idle', data: null };
 * const store = {
 *   getContext: () => sharedContext,
 *   setContext: (newCtx) => { sharedContext = newCtx; }
 * };
 *
 * const factories = {
 *   idle: (ctx) => createMachine(ctx, { fetch: () => store.setContext({ ...ctx, status: 'loading' }) }),
 *   loading: (ctx) => createMachine(ctx, { succeed: (data) => store.setContext({ status: 'success', data }) }),
 *   // ...
 * };
 *
 * const ensemble = createEnsemble(store, factories, 'status');
 * ensemble.actions.fetch();
 * console.log(ensemble.context.status); // 'loading'
 */
export function createEnsemble<
  C extends object & { [key in K]: keyof F & string },
  F extends Record<string, (context: C) => Machine<C>>,
  K extends keyof C & string
>(
  store: StateStore<C>,
  factories: F,
  discriminantKey: K
): Ensemble<ReturnType<F[keyof F]>, C> {
  type AllMachines = ReturnType<F[keyof F]>;

  const getCurrentMachine = (): AllMachines => {
    const context = store.getContext();
    const currentStateName = context[discriminantKey];
    const factory = factories[currentStateName];

    if (!factory) {
      throw new Error(
        `[Ensemble] Invalid state: No factory found for state "${currentStateName}" based on discriminant key "${discriminantKey}".`
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
          `[Ensemble] Transition "${prop}" is not valid in the current state "${String(
            currentMachine.context[discriminantKey]
          )}".`
        );
      }

      // Return a function that, when called, executes the transition.
      // The transition itself is responsible for calling `store.setContext`.
      return (...args: any[]) => {
        return action.apply(currentMachine, args);
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
 * `yield` keyword is only used for control flow, not state passing.
 *
 * @param flow - A generator function that receives the `Runner` instance.
 * @param initialMachine - The machine to start the flow with.
 * @returns The final value returned by the generator.
 *
 * @example
 * runWithRunner(function* (runner) {
 *   yield runner.actions.increment();
 *   yield runner.actions.add(10);
 *   if (runner.context.count > 5) {
 *     yield runner.actions.reset();
 *   }
 *   return runner.context;
 * }, createCounterMachine());
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
 * This pattern is ideal for orchestrating complex sagas or workflows that
 * interact with a global, framework-managed state.
 *
 * @param flow - A generator function that receives the `Ensemble` instance.
 * @param ensemble - The `Ensemble` to run the workflow against.
 * @returns The final value returned by the generator.
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
// SECTION 4: THE SHARED CONTEXT MACHINE (EXPERIMENTAL)
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
 * @template C - The shared context type, which MUST include a discriminant property.
 * @template F - An object of functions that create machine instances for each state.
 *   **Crucially, transitions inside these machines must be pure functions that
 *   return the *next context object*, not a new machine instance.**
 * @param sharedContext - The initial context object. This object will be mutated.
 * @param factories - An object mapping state names to functions that create machine instances.
 * @param discriminantKey - The key in the context object used to determine the current state.
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
 *   'state'
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
  C extends object & { [key in K]: keyof F & string },
  F extends Record<string, (context: C) => Machine<C>>,
  K extends keyof C & string
>(
  sharedContext: C,
  factories: F,
  discriminantKey: K
): MutableMachine<C, ReturnType<F[keyof F]>> {
  const getCurrentMachine = (): ReturnType<F[keyof F]> => {
    const currentStateName = sharedContext[discriminantKey];
    const factory = factories[currentStateName];
    if (!factory) {
      throw new Error(
        `[MutableMachine] Invalid state: No factory for state "${currentStateName}".`
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
          const nextContext = transition.apply(currentMachine, args);
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