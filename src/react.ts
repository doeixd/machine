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
 * 
 * 5.  **`useActor(actor)`**:
 *     - **Best for:** Using the Actor model.
 *     - **Returns:** The current machine snapshot.
 */

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  createContext,
  useContext,
  createElement,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import {
  Machine,
  runMachine, // Was createRunner
  createEnsemble,
  type Ensemble,
  type StateStore,
  type Actor,
  BaseMachine
} from './index';

export type Runner<M extends Machine<any>> = ReturnType<typeof runMachine<M>>;

// =============================================================================
// HOOK 1: useMachine (Ergonomic local state)
// =============================================================================

/**
 * A React hook for using a self-contained, immutable state machine within a component.
 * It provides a more ergonomic API than a raw dispatcher by returning a stable `actions`
 * object, similar to the `runMachine` primitive.
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
 */
export function useMachine<M extends Machine<any>>(
  machineFactory: () => M
): [M, Record<string, (...args: any[]) => void>] {
  // useState holds the machine state, triggering re-renders.
  const [machine, setMachine] = useState(machineFactory);

  // useMemo creates a stable runner instance that survives re-renders.
  const runner = useMemo(
    () => runMachine(machine, (newState) => {
      setMachine(newState);
    }),
    []
  );

  // Create a stable actions object that proxies calls to the dispatcher
  const actions = useMemo(() => {
    return new Proxy({} as any, {
      get: (_target, prop) => {
        return (...args: any[]) => {
          runner.dispatch({ type: prop as any, args: args as any } as any);
        };
      }
    });
  }, [runner]);

  return [machine, actions];
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
 */
export function createMachineContext<M extends Machine<any>>() {
  type MachineContextValue = [M, Record<string, (...args: any[]) => void>];
  const Context = createContext<MachineContextValue | null>(null);

  const Provider = ({
    machine,
    actions,
    children,
  }: {
    machine: M;
    actions: Record<string, (...args: any[]) => void>;
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
  const useMachineActions = (): Record<string, (...args: any[]) => void> => useMachineContext()[1];

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

// =============================================================================
// HOOK 5: useActor (Actor Model)
// =============================================================================

/**
 * Subscribes to an Actor and returns the current snapshot.
 * Uses `useSyncExternalStore` for concurrent features compatibility.
 * 
 * @param actor The actor instance to subscribe to.
 * @returns The current machine snapshot.
 */
export function useActor<M extends BaseMachine<any>>(actor: Actor<M>): M {
  // bind is important if subscribe methods rely on `this`
  const subscribe = useMemo(() => actor.subscribe.bind(actor), [actor]);
  const getSnapshot = useMemo(() => actor.getSnapshot.bind(actor), [actor]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Subscribes to an Actor and selects a slice of the state.
 * Only re-renders when the selected slice changes.
 * 
 * @param actor The actor instance.
 * @param selector Function to select a part of the state.
 * @param isEqual Optional equality function.
 */
export function useActorSelector<M extends BaseMachine<any>, T>(
  actor: Actor<M>,
  selector: (state: M) => T,
  isEqual: (a: T, b: T) => boolean = Object.is
): T {
  const getSnapshot = useMemo(() => actor.getSnapshot.bind(actor), [actor]);

  const getSelection = () => selector(getSnapshot());

  const [selection, setSelection] = useState(getSelection);

  // Custom selector logic since useSyncExternalStoreWithSelector is not available directly
  // and we want to avoid extra deps.
  // Actually, we can just use useSyncExternalStore and manage the selection stability,
  // but useSyncExternalStore triggers if the result of getSnapshot changes (strict eq).
  // If we wrap getSnapshot to return the selection, standard useSyncExternalStore handles it?
  // No, useSyncExternalStore calls getSnapshot continuously during render to check for tearing.
  // It needs to be cheap and consistent.

  // Simple implementation: Subscribe and update local state only on change.
  useEffect(() => {
    const checkUpdate = () => {
      const nextSelection = selector(actor.getSnapshot());
      setSelection(prev => isEqual(prev, nextSelection) ? prev : nextSelection);
    };

    // Check immediately in case it changed between render and effect
    checkUpdate();

    return actor.subscribe(() => {
      checkUpdate();
    });
  }, [actor, selector, isEqual]);

  return selection;
}
