/**
 * @file React integration for @doeixd/machine
 * @description
 * Provides a suite of hooks for integrating state machines with React components,
 * covering simple component state, performance-optimized selections, and advanced
 * framework-agnostic patterns.
 *
 * ---
 *
 * ### Hooks Overview
 *
 * 1.  **`useMachine(machineFactory)`**:
 *     - **Best for:** Local, self-contained component state.
 *     - **Returns:** `[machine, actions]`
 *     - The simplest way to get started. It manages an immutable machine instance
 *       and provides a stable `actions` object to trigger transitions.
 *
 * 2.  **`useMachineSelector(machine, selector, isEqual?)`**:
 *     - **Best for:** Performance optimization in child components.
 *     - **Returns:** A selected slice of the machine's state: `T`.
 *     - Subscribes a component to only a part of the machine's state, preventing
 *       unnecessary re-renders when other parts of the context change.
 *
 * 3.  **`useEnsemble(initialContext, factories, getDiscriminant)`**:
 *     - **Best for:** Complex state, shared state, or integrating with external logic.
 *     - **Returns:** A stable `Ensemble` instance.
 *     - The most powerful hook. It uses the `Ensemble` pattern to decouple your
 *       pure machine logic from React's state management, making your business
 *       logic portable and easy to test.
 *
 * 4.  **`createMachineContext()`**:
 *     - **Best for:** Avoiding prop-drilling.
 *     - **Returns:** A `Provider` and consumer hooks (`useContext`, `useSelector`, etc.).
 *     - A utility to provide a machine created with `useMachine` or `useEnsemble` to
 *       the entire component tree below it.
 */

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  createContext,
  useContext,
  createElement,
  type ReactNode,
} from 'react';

import {
  Machine,
  createRunner,
  createEnsemble,
  type Runner,
  type Ensemble,
  type StateStore,
} from './index';

// =============================================================================
// HOOK 1: useMachine (Ergonomic local state)
// =============================================================================

/**
 * A React hook for using a self-contained, immutable state machine within a component.
 * It provides a more ergonomic API than a raw dispatcher by returning a stable `actions`
 * object, similar to the `createRunner` primitive.
 *
 * This is the ideal hook for managing component-level state.
 *
 * @template M - The machine type (can be a union of states).
 * @param machineFactory - A function that creates the initial machine instance.
 *   This function is called only once on the initial render.
 * @returns A tuple of `[machine, actions]`, where:
 *   - `machine`: The current, reactive machine instance. Its identity changes on
 *     every transition, triggering re-renders. Use this for reading state and
 *     for type-narrowing.
 *   - `actions`: A stable object containing all possible transition methods,
 *     pre-bound to update the machine's state.
 *
 * @example
 * ```tsx
 * const [machine, actions] = useMachine(() => createCounterMachine({ count: 0 }));
 *
 * return (
 *   <div>
 *     <p>Count: {machine.context.count}</p>
 *     <button onClick={() => actions.increment()}>Increment</button>
 *     <button onClick={() => actions.add(5)}>Add 5</button>
 *   </div>
 * );
 * ```
 *
 * @example With Type-State Programming
 * ```tsx
 * const [auth, actions] = useMachine(() => createLoggedOutMachine());
 *
 * return (
 *   <div>
 *     {auth.context.status === 'loggedOut' && (
 *       <button onClick={() => actions.login('user')}>Login</button>
 *     )}
 *     {auth.context.status === 'loggedIn' && (
 *       <p>Welcome, {auth.context.username}!</p>
 *       <button onClick={() => actions.logout()}>Logout</button>
 *     )}
 *   </div>
 * );
 * ```
 */
export function useMachine<M extends Machine<any>>(
  machineFactory: () => M
): [M, Runner<M>['actions']] {
  // useState holds the machine state, triggering re-renders.
  // The factory is passed directly to useState to ensure it's only called once.
  const [machine, setMachine] = useState(machineFactory);

  // useMemo creates a stable runner instance that survives re-renders.
  // The runner's job is to hold the *current* machine state and update our
  // React state when a transition occurs.
  const runner = useMemo(
    () => createRunner(machine, (newState) => {
      // This is the magic link: when the runner's internal state changes,
      // we update React's state, causing a re-render.
      setMachine(newState);
    }),
    [] // Empty dependency array ensures the runner is created only once.
  );

  return [machine, runner.actions];
}

// =============================================================================
// HOOK 2: useMachineSelector (Performance optimization)
// =============================================================================

/**
 * A hook that subscribes a component to a selected slice of a machine's state.
 *
 * This is a critical performance optimization. It prevents a component from
 * re-rendering if only an irrelevant part of the machine's context has changed.
 * The component will only re-render if the value returned by the `selector` function
 * is different from the previous render.
 *
 * @template M - The machine type.
 * @template T - The type of the selected value.
 * @param machine - The reactive machine instance from `useMachine`.
 * @param selector - A function that takes the current machine state and returns
 *   a derived value.
 * @param isEqual - An optional function to compare the previous and next selected
 *   values. Defaults to `Object.is` for strict equality checking. Provide your own
 *   for deep comparisons of objects or arrays.
 * @returns The selected, memoized value from the machine's state.
 *
 * @example
 * ```tsx
 * // In parent component:
 * const [machine, actions] = useMachine(() => createUserMachine());
 *
 * // In child component (only re-renders when the user's name changes):
 * function UserNameDisplay({ machine }) {
 *   const userName = useMachineSelector(
 *     machine,
 *     (m) => m.context.user.name
 *   );
 *   return <p>User: {userName}</p>;
 * }
 * ```
 */
export function useMachineSelector<M extends Machine<any>, T>(
  machine: M,
  selector: (state: M) => T,
  isEqual: (a: T, b: T) => boolean = Object.is
): T {
  // Store the selected value in local state.
  const [selectedValue, setSelectedValue] = useState(() => selector(machine));
  
  // Keep refs to the latest selector and comparison functions.
  const selectorRef = useRef(selector);
  const isEqualRef = useRef(isEqual);
  selectorRef.current = selector;
  isEqualRef.current = isEqual;

  // Effect to update the selected value only when it actually changes.
  useEffect(() => {
    const nextValue = selectorRef.current(machine);
    if (!isEqualRef.current(selectedValue, nextValue)) {
      setSelectedValue(nextValue);
    }
  }, [machine, selectedValue]); // Re-run only when the machine or the slice changes.

  return selectedValue;
}

// =============================================================================
// HOOK 3: useEnsemble (Advanced integration pattern)
// =============================================================================

/**
 * A hook that creates and manages an `Ensemble` within a React component.
 *
 * This is the most powerful and flexible integration pattern. It decouples your
 * state logic (defined in `factories`) from React's state management. Your machine
 * logic becomes pure, portable, and easily testable outside of React.
 *
 * @template C - The shared context object type.
 * @template F - An object of factory functions that create machine instances.
 * @param initialContext - The initial context object for the machine.
 * @param factories - An object mapping state names to factory functions.
 * @param getDiscriminant - An accessor function that determines the current state
 *   from the context.
 * @returns A stable `Ensemble` instance. The component will reactively update
 *   when the ensemble's underlying context changes.
 *
 * @example
 * ```tsx
 * const fetchFactories = {
 *   idle: (ctx) => createMachine(ctx, { fetch: () => ({ ...ctx, status: 'loading' }) }),
 *   loading: (ctx) => createMachine(ctx, { succeed: (data) => ({ status: 'success', data }) }),
 *   // ...
 * };
 *
 * function MyComponent() {
 *   const ensemble = useEnsemble(
 *     { status: 'idle', data: null },
 *     fetchFactories,
 *     (ctx) => ctx.status
 *   );
 *
 *   return (
 *     <div>
 *       <p>Status: {ensemble.context.status}</p>
 *       {ensemble.state.context.status === 'idle' && (
 *          <button onClick={() => ensemble.actions.fetch()}>Fetch</button>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useEnsemble<
  C extends object,
  F extends Record<string, (context: C) => Machine<C>>
>(
  initialContext: C,
  factories: F,
  getDiscriminant: (context: C) => keyof F
): Ensemble<ReturnType<F[keyof F]>, C> {
  const [context, setContext] = useState(initialContext);
  const contextRef = useRef(context);
  contextRef.current = context;

  const store = useMemo<StateStore<C>>(
    () => ({
      // getContext reads from the ref to ensure it always has the latest value,
      // avoiding stale closures.
      getContext: () => contextRef.current,
      setContext: (newContext) => {
        // The update is dispatched to React's state setter.
        setContext(newContext);
      },
    }),
    [] // The store itself is stable and created only once.
  );

  // The ensemble instance is also memoized to remain stable across re-renders.
  const ensemble = useMemo(
    () => createEnsemble(store, factories, getDiscriminant),
    [store, factories, getDiscriminant]
  );

  return ensemble;
}

// =============================================================================
// UTILITY 4: createMachineContext (Dependency injection)
// =============================================================================

/**
 * Creates a React Context for providing a machine instance down the component tree,
 * avoiding the need to pass it down as props ("prop-drilling").
 *
 * It returns a `Provider` component and a suite of consumer hooks for accessing
 * the state and actions.
 *
 * @returns An object containing:
 *  - `Provider`: The context provider component.
 *  - `useMachineContext`: Hook to get the full `[machine, actions]` tuple.
 *  - `useMachineState`: Hook to get only the reactive `machine` instance.
 *  - `useMachineActions`: Hook to get only the stable `actions` object.
 *  - `useSelector`: Hook to get a memoized slice of the machine's state.
 *
 * @example
 * ```tsx
 * // 1. Create the context
 * const { Provider, useMachineState, useMachineActions } = createMachineContext<MyMachine>();
 *
 * // 2. In your top-level component, create the machine and provide it
 * function App() {
 *   const [machine, actions] = useMachine(() => createMyMachine());
 *   return (
 *     <Provider machine={machine} actions={actions}>
 *       <ChildComponent />
 *     </Provider>
 *   );
 * }
 *
 * // 3. In a deeply nested child component
 * function ChildComponent() {
 *   const machine = useMachineState(); // Gets the current state
 *   const actions = useMachineActions(); // Gets the stable actions
 *   const name = useSelector(m => m.context.name); // Selects a slice
 *
 *   return (
 *     <div>
 *       <p>Name: {name}</p>
 *       <button onClick={() => actions.rename('new name')}>Rename</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function createMachineContext<M extends Machine<any>>() {
  type MachineContextValue = [M, Runner<M>['actions']];
  const Context = createContext<MachineContextValue | null>(null);

  const Provider = ({
    machine,
    actions,
    children,
  }: {
    machine: M;
    actions: Runner<M>['actions'];
    children: ReactNode;
  }) => {
    // Memoize the context value to prevent unnecessary re-renders in consumers.
    const value = useMemo<MachineContextValue>(() => [machine, actions], [machine, actions]);
    return createElement(Context.Provider, { value }, children);
  };

  const useMachineContext = (): MachineContextValue => {
    const context = useContext(Context);
    if (!context) {
      throw new Error('useMachineContext must be used within a Machine.Provider');
    }
    return context;
  };

  const useMachineState = (): M => useMachineContext()[0];
  const useMachineActions = (): Runner<M>['actions'] => useMachineContext()[1];

  const useSelector = <T,>(
    selector: (state: M) => T,
    isEqual?: (a: T, b: T) => boolean
  ): T => {
    const machine = useMachineState();
    return useMachineSelector(machine, selector, isEqual);
  };

  return {
    Provider,
    useMachineContext,
    useMachineState,
    useMachineActions,
    useSelector,
  };
}