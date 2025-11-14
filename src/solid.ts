/**
 * @file Solid.js integration for @doeixd/machine
 * @description
 * Provides reactive primitives for using state machines with Solid.js, including
 * hooks for both sync and async machines, store integration, and signal-based APIs.
 *
 * Solid.js uses fine-grained reactivity with signals and stores, which pairs
 * beautifully with immutable state machines. This integration provides multiple
 * approaches depending on your needs:
 *
 * - `createMachine()` - Signal-based reactive machine
 * - `createMachineStore()` - Store-based reactive machine (for complex context)
 * - `createAsyncMachine()` - Async machine with signal state
 * - `createMachineResource()` - Resource-based async machine
 */

import {
  createSignal,
  createEffect,
  createMemo,
  onCleanup,
  type Accessor,
  type Setter
} from 'solid-js';
import { createStore, type SetStoreFunction, type Store, produce } from 'solid-js/store';
import { Machine, AsyncMachine, Event, Context, runMachine as runMachineCore } from './index';

// =============================================================================
// SIGNAL-BASED MACHINE (for simple state)
// =============================================================================

/**
 * Creates a reactive machine using Solid signals.
 *
 * This is ideal for simple state machines where the entire machine state
 * needs to be tracked reactively. Every transition creates a new machine
 * instance, and the signal updates automatically.
 *
 * @template M - The machine type.
 *
 * @param initialMachine - A function that returns the initial machine state.
 * @returns A tuple of [accessor, transitions] where:
 *   - accessor: Reactive accessor for the current machine
 *   - transitions: Object with all machine transitions bound to update the signal
 *
 * @example
 * ```tsx
 * const [machine, actions] = createMachine(() =>
 *   createCounterMachine({ count: 0 })
 * );
 *
 * // In your component
 * <div>
 *   <p>Count: {machine().context.count}</p>
 *   <button onClick={actions.increment}>Increment</button>
 * </div>
 * ```
 *
 * @example With Type-State
 * ```tsx
 * type LoggedOut = Machine<{ status: "loggedOut" }> & {
 *   login: (user: string) => LoggedIn;
 * };
 *
 * type LoggedIn = Machine<{ status: "loggedIn"; user: string }> & {
 *   logout: () => LoggedOut;
 * };
 *
 * const [auth, actions] = createMachine<LoggedOut | LoggedIn>(() =>
 *   createLoggedOut()
 * );
 *
 * // Conditional rendering based on state type
 * <Show when={auth().context.status === 'loggedIn'}>
 *   <p>Welcome, {auth().context.user}</p>
 *   <button onClick={actions.logout}>Logout</button>
 * </Show>
 * ```
 */
export function createMachine<M extends Machine<any>>(
  initialMachine: () => M
): [Accessor<M>, TransitionHandlers<M>] {
  const [machine, setMachine] = createSignal<M>(initialMachine());

  // Extract all transition methods and bind them to update the signal
  const { context, ...transitions } = machine();

  const handlers = Object.fromEntries(
    Object.entries(transitions).map(([key, fn]) => [
      key,
      (...args: any[]) => {
        const currentMachine = machine();
        const nextMachine = (currentMachine as any)[key](...args);
        setMachine(() => nextMachine);
        return nextMachine;
      }
    ])
  ) as TransitionHandlers<M>;

  return [machine, handlers];
}

/**
 * Helper type to extract transition handlers from a machine.
 */
type TransitionHandlers<M extends Machine<any>> = {
  [K in keyof Omit<M, 'context'>]: M[K] extends (...args: infer Args) => infer R
    ? (...args: Args) => R
    : never;
};

// =============================================================================
// STORE-BASED MACHINE (for complex context with fine-grained reactivity)
// =============================================================================

/**
 * Creates a reactive machine using Solid stores.
 *
 * This is ideal when you have complex nested context and want fine-grained
 * reactivity on individual properties. Instead of replacing the entire machine,
 * transitions update the store, triggering only the affected computations.
 *
 * @template M - The machine type.
 *
 * @param initialMachine - A function that returns the initial machine state.
 * @returns A tuple of [store, actions] where:
 *   - store: Reactive store proxy for the machine
 *   - actions: Transition handlers that update the store
 *
 * @example
 * ```tsx
 * const [machine, actions] = createMachineStore(() =>
 *   createUserMachine({
 *     profile: { name: 'Alice', age: 30 },
 *     settings: { theme: 'dark', notifications: true }
 *   })
 * );
 *
 * // Fine-grained reactivity - only updates when profile.name changes
 * <div>
 *   <p>Name: {machine.context.profile.name}</p>
 *   <p>Age: {machine.context.profile.age}</p>
 *   <button onClick={() => actions.updateName('Bob')}>Change Name</button>
 * </div>
 * ```
 */
export function createMachineStore<M extends Machine<any>>(
  initialMachine: () => M
): [Store<M>, SetStoreFunction<M>, TransitionHandlers<M>] {
  const initial = initialMachine();
  const [store, setStore] = createStore<M>(initial);

  const { context, ...transitions } = initial;

  const handlers = Object.fromEntries(
    Object.entries(transitions).map(([key, fn]) => [
      key,
      (...args: any[]) => {
        const nextMachine = (store as any)[key](...args);
        setStore(() => nextMachine);
        return nextMachine;
      }
    ])
  ) as TransitionHandlers<M>;

  return [store, setStore, handlers];
}

// =============================================================================
// ASYNC MACHINE WITH SIGNALS
// =============================================================================

/**
 * Creates a reactive async machine with event dispatching.
 *
 * This wraps the core `runMachine` with Solid reactivity, automatically
 * updating a signal whenever the machine state changes. Perfect for async
 * workflows like data fetching, multi-step forms, or any stateful async logic.
 *
 * @template M - The async machine type.
 *
 * @param initialMachine - A function that returns the initial async machine state.
 * @returns A tuple of [accessor, dispatch] where:
 *   - accessor: Reactive accessor for current machine state
 *   - dispatch: Type-safe event dispatcher
 *
 * @example Basic data fetching
 * ```tsx
 * type FetchMachine = AsyncMachine<{
 *   status: 'idle' | 'loading' | 'success' | 'error';
 *   data: any;
 * }> & {
 *   fetch: () => Promise<FetchMachine>;
 *   retry: () => Promise<FetchMachine>;
 * };
 *
 * const [state, dispatch] = createAsyncMachine(() => createFetchMachine());
 *
 * <div>
 *   <Switch>
 *     <Match when={state().context.status === 'idle'}>
 *       <button onClick={() => dispatch({ type: 'fetch', args: [] })}>
 *         Load Data
 *       </button>
 *     </Match>
 *     <Match when={state().context.status === 'loading'}>
 *       <p>Loading...</p>
 *     </Match>
 *     <Match when={state().context.status === 'success'}>
 *       <p>Data: {JSON.stringify(state().context.data)}</p>
 *     </Match>
 *     <Match when={state().context.status === 'error'}>
 *       <button onClick={() => dispatch({ type: 'retry', args: [] })}>
 *         Retry
 *       </button>
 *     </Match>
 *   </Switch>
 * </div>
 * ```
 *
 * @example With effects
 * ```tsx
 * const [state, dispatch] = createAsyncMachine(() => createAuthMachine());
 *
 * // React to state changes
 * createEffect(() => {
 *   console.log('Auth state changed:', state().context.status);
 *
 *   if (state().context.status === 'loggedIn') {
 *     // Navigate, fetch user data, etc.
 *   }
 * });
 * ```
 */
export function createAsyncMachine<M extends AsyncMachine<any>>(
  initialMachine: () => M
): [Accessor<M>, (event: Event<M>) => Promise<M>] {
  const [machine, setMachine] = createSignal<M>(initialMachine());

  // Create the runner with signal update callback
  const runner = runMachineCore(initialMachine(), (nextMachine) => {
    setMachine(() => nextMachine as M);
  });

  const dispatch = async (event: Event<M>): Promise<M> => {
    const result = await runner.dispatch(event);
    return result as M;
  };

  return [machine, dispatch];
}

// =============================================================================
// CONTEXT-ONLY STORE (for just the context data)
// =============================================================================

/**
 * Creates a Solid store for just the machine's context, with actions that
 * transition the machine and sync the context back to the store.
 *
 * This is useful when you want fine-grained reactivity on context properties
 * but don't need to track the machine instance itself.
 *
 * @template C - The context object type.
 * @template M - The machine type.
 *
 * @param initialMachine - A function that returns the initial machine.
 * @returns A tuple of [context store, setContext, actions].
 *
 * @example
 * ```tsx
 * const [context, setContext, actions] = createMachineContext(() =>
 *   createCounterMachine({ count: 0, name: 'Counter' })
 * );
 *
 * // Direct access to context with fine-grained reactivity
 * <div>
 *   <p>{context.name}: {context.count}</p>
 *   <button onClick={actions.increment}>+</button>
 * </div>
 * ```
 */
export function createMachineContext<C extends object, M extends Machine<C>>(
  initialMachine: () => M
): [Store<C>, SetStoreFunction<C>, TransitionHandlers<M>] {
  let currentMachine = initialMachine();
  const [context, setContext] = createStore<C>(currentMachine.context);

  const { context: _, ...transitions } = currentMachine;

  const handlers = Object.fromEntries(
    Object.entries(transitions).map(([key, fn]) => [
      key,
      (...args: any[]) => {
        const nextMachine = (currentMachine as any)[key](...args);
        currentMachine = nextMachine;
        setContext(() => nextMachine.context);
        return nextMachine;
      }
    ])
  ) as TransitionHandlers<M>;

  return [context, setContext, handlers];
}

// =============================================================================
// MEMOIZED MACHINE DERIVATIONS
// =============================================================================

/**
 * Creates a memoized derivation from a machine's context.
 *
 * This is useful for computed values that depend on the machine state.
 * The computation only re-runs when the accessed context properties change.
 *
 * @template M - The machine type.
 * @template T - The computed value type.
 *
 * @param machine - Machine accessor.
 * @param selector - Function to compute a value from the context.
 * @returns A memoized accessor for the computed value.
 *
 * @example
 * ```tsx
 * const [machine, actions] = createMachine(() => createCart());
 *
 * const total = createMachineSelector(machine, (ctx) =>
 *   ctx.items.reduce((sum, item) => sum + item.price, 0)
 * );
 *
 * <div>
 *   <p>Total: ${total()}</p>
 * </div>
 * ```
 */
export function createMachineSelector<M extends Machine<any>, T>(
  machine: Accessor<M>,
  selector: (context: Context<M>) => T
): Accessor<T> {
  return createMemo(() => selector(machine().context));
}

// =============================================================================
// BATCH TRANSITIONS
// =============================================================================

/**
 * Batches multiple transitions into a single reactive update.
 *
 * In Solid, this uses `batch` to group updates, preventing intermediate
 * re-renders and effects from firing.
 *
 * @template M - The machine type.
 *
 * @param machine - The current machine.
 * @param setMachine - The setter function.
 * @param transitions - Array of transition functions to apply.
 * @returns The final machine state.
 *
 * @example
 * ```tsx
 * import { batch } from 'solid-js';
 *
 * const [machine, setMachine] = createSignal(createCounterMachine());
 *
 * const batchUpdate = () => {
 *   batch(() => {
 *     let m = machine();
 *     m = m.increment();
 *     m = m.add(5);
 *     m = m.increment();
 *     setMachine(m);
 *   });
 * };
 * ```
 */
export function batchTransitions<M extends Machine<any>>(
  machine: M,
  setMachine: Setter<M>,
  ...transitions: Array<(m: M) => M>
): M {
  const { batch } = require('solid-js');

  return batch(() => {
    const finalMachine = transitions.reduce((m, transition) => transition(m), machine);
    setMachine(finalMachine);
    return finalMachine;
  });
}

// =============================================================================
// LIFECYCLE EFFECTS
// =============================================================================

/**
 * Runs an effect when entering or exiting specific machine states.
 *
 * This is useful for side effects that should happen on state transitions,
 * like analytics, logging, or subscriptions.
 *
 * @template M - The machine type.
 *
 * @param machine - Machine accessor.
 * @param statePredicate - Function to determine if we're in the target state.
 * @param onEnter - Effect to run when entering the state.
 * @param onExit - Optional effect to run when exiting the state.
 *
 * @example
 * ```tsx
 * const [machine, actions] = createMachine(() => createAuthMachine());
 *
 * createMachineEffect(
 *   machine,
 *   (m) => m.context.status === 'loggedIn',
 *   (m) => {
 *     console.log('User logged in:', m.context.username);
 *     // Start session tracking
 *   },
 *   () => {
 *     console.log('User logged out');
 *     // Clean up session
 *   }
 * );
 * ```
 */
export function createMachineEffect<M extends Machine<any>>(
  machine: Accessor<M>,
  statePredicate: (m: M) => boolean,
  onEnter: (m: M) => void,
  onExit?: () => void
): void {
  let wasInState = false;

  createEffect(() => {
    const m = machine();
    const isInState = statePredicate(m);

    if (isInState && !wasInState) {
      // Entering state
      onEnter(m);
      wasInState = true;
    } else if (!isInState && wasInState) {
      // Exiting state
      onExit?.();
      wasInState = false;
    }
  });

  onCleanup(() => {
    if (wasInState && onExit) {
      onExit();
    }
  });
}

/**
 * Helper to create effects for specific context values.
 *
 * @template M - The machine type.
 * @template T - The selected value type.
 *
 * @param machine - Machine accessor.
 * @param selector - Function to select a value from context.
 * @param effect - Effect to run when the selected value changes.
 *
 * @example
 * ```tsx
 * const [machine, actions] = createMachine(() => createCounterMachine());
 *
 * createMachineValueEffect(
 *   machine,
 *   (ctx) => ctx.count,
 *   (count) => {
 *     console.log('Count changed to:', count);
 *     if (count > 10) {
 *       alert('Count is high!');
 *     }
 *   }
 * );
 * ```
 */
export function createMachineValueEffect<M extends Machine<any>, T>(
  machine: Accessor<M>,
  selector: (context: Context<M>) => T,
  effect: (value: T) => void
): void {
  createEffect(() => {
    const value = selector(machine().context);
    effect(value);
  });
}

// =============================================================================
// EXPORT TYPES FOR BETTER DX
// =============================================================================

export type {
  Accessor,
  Setter,
  Store,
  SetStoreFunction
};
