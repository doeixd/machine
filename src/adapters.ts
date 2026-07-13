// src/adapters.ts

/**
 * @file Event-Driven Adapters for @doeixd/machine
 * @description Provides primitives to adapt a machine's method-call-based API
 * to standard event-driven interfaces like the browser's `EventTarget` and
 * Node.js's `EventEmitter`. These adapters allow your type-safe machines to
 * integrate seamlessly into decoupled, event-driven architectures.
 */

import { EventEmitter } from 'events';
import {
  Machine,
  Runner,
  createRunner,
  Context,
  TransitionNames,
} from './index';

// =============================================================================
// SECTION 0: Observable Types (Minimal Implementation)
// =============================================================================

/**
 * A minimal Observer interface for reactive streams.
 * Compatible with RxJS and other Observable implementations.
 */
export interface Observer<T> {
  next?: (value: T) => void;
  error?: (error: unknown) => void;
  complete?: () => void;
}

/**
 * A minimal Observable interface for reactive streams.
 * Compatible with RxJS and other Observable implementations.
 */
export interface Observable<T> {
  subscribe(observer: Observer<T>): { unsubscribe: () => void };
}

function customEvent<T>(type: string, detail: T): CustomEvent<T> {
  if (typeof CustomEvent === 'function') {
    return new CustomEvent(type, { detail });
  }

  const event = new Event(type) as CustomEvent<T>;
  Object.defineProperty(event, 'detail', { value: detail, enumerable: true });
  return event;
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

// =============================================================================
// SECTION 1: EventTarget Adapter (for Browser Environments)
// =============================================================================

// --- Helper Types for EventTarget ---

/**
 * A helper type that extracts the detail payload for a given machine event.
 * If the transition has arguments, it's an array of those arguments.
 * If it has no arguments, it's `undefined`.
 *
 * @template M The machine type.
 * @template K The name of the transition.
 */
export type MachineEventDetail<
  M extends Machine<any>,
  K extends TransitionNames<M>
> = M[K] extends (...args: infer A) => any ? (A extends [] ? undefined : A) : never;

/**
 * A mapped type that creates a DOM-standard event map for a machine.
 * This is crucial for providing type safety when using `addEventListener`.
 *
 * It includes:
 * - A `statechange` event with the new machine state in its detail.
 * - An `error` event with an `Error` object in its detail.
 * - An entry for every possible machine transition.
 *
 * @template M The machine type.
 */
export type MachineEventMap<M extends Machine<any>> = {
  [K in TransitionNames<M>]: CustomEvent<MachineEventDetail<M, K>>;
} & {
  statechange: CustomEvent<{ state: M }>;
  error: CustomEvent<{ error: Error }>;
};


/**
 * A type-safe, augmented EventTarget that wraps a state machine.
 *
 * It provides two key functionalities:
 * 1. Emits a `CustomEvent` named 'statechange' whenever the machine's state updates.
 * 2. Listens for other `CustomEvent`s and translates them into type-safe machine transitions.
 *
 * @template M The machine type (can be a union of states).
 */
export class MachineEventTarget<M extends Machine<any>> extends EventTarget {
  private readonly runner: Runner<M>;

  /**
   * The current, readonly state of the machine.
   * Access this property to get the latest machine instance for UI rendering or inspection.
   * @example
   * console.log(machineTarget.state.context.count);
   */
  public get state(): M {
    return this.runner.state;
  }

  /**
   * A direct, readonly accessor to the machine's current context.
   * A convenience property equivalent to `machineTarget.state.context`.
   */
  public get context(): Context<M> {
    return this.runner.state.context;
  }

  constructor(initialMachine: M) {
    super();

    const originalDispatchEvent = this.dispatchEvent.bind(this);

    this.runner = createRunner(initialMachine, (newState) => {
      originalDispatchEvent(customEvent('statechange', { state: newState }));
    });

    const handleEvent = (event: Event) => {
      const { type, detail } = event as CustomEvent;
      if (type === 'statechange' || type === 'error') return;

      const action = (this.runner.actions as any)[type];
      if (typeof action === 'function') {
        const args = Array.isArray(detail) ? detail : [];
        try {
          action(...args);
        } catch (error) {
          originalDispatchEvent(customEvent('error', { error: asError(error) }));
        }
      } else {
        const error = new Error(`Invalid event type "${type}" for current state "${(this.state.context as any).status || 'unknown'}".`);
        originalDispatchEvent(customEvent('error', { error }));
      }
    };

    // Override dispatchEvent to intercept all events and route them.
    this.dispatchEvent = (event: Event): boolean => {
      // The event is first handled by our logic, then passed to the native dispatcher.
      handleEvent(event);
      return originalDispatchEvent(event);
    };
  }
  
  // Type-safe event listener methods for machine events
  public addMachineEventListener<K extends keyof MachineEventMap<M>>(
    type: K,
    listener: (event: MachineEventMap<M>[K]) => void,
    options?: boolean | AddEventListenerOptions
  ): void {
    super.addEventListener(type, listener as EventListener, options);
  }

  public removeMachineEventListener<K extends keyof MachineEventMap<M>>(
    type: K,
    listener: (event: MachineEventMap<M>[K]) => void,
    options?: boolean | EventListenerOptions
  ): void {
    super.removeEventListener(type, listener as EventListener, options);
  }



  /**
   * A type-safe method for dispatching transition events.
   * This is the recommended way to interact with the machine from your application code.
   *
   * @param type The name of the transition to trigger (e.g., 'add').
   * @param detail The arguments for that transition, matching the method signature.
   *
   * @example
   * // For a transition `add(n: number)`
   * machineTarget.dispatch('add', [5]);
   *
   * // For a transition `increment()`
   * machineTarget.dispatch('increment');
   */
  public dispatch<K extends TransitionNames<M>>(
    type: K,
    detail?: MachineEventDetail<M, K>
  ): void {
    this.dispatchEvent(customEvent(type, detail));
  }
}

/**
 * Creates a browser-native EventTarget from a machine.
 *
 * This powerful adapter makes your machine behave like a standard DOM element,
 * perfect for decoupling components or integrating with event-driven browser APIs.
 *
 * @param initialMachine The machine instance to wrap.
 * @returns A `MachineEventTarget` instance.
 */
export function asEventTarget<M extends Machine<any>>(initialMachine: M): MachineEventTarget<M> {
  return new MachineEventTarget(initialMachine);
}

/**
 * A utility function to ergonomically add and clean up a listener on a MachineEventTarget.
 * It returns an `unsubscribe` function, which is ideal for use in `useEffect` hooks.
 *
 * @param target The `MachineEventTarget` to listen to.
 * @param type The name of the event to listen for.
 * @param listener The callback function to execute.
 * @returns A cleanup function that removes the event listener.
 *
 * @example
 * useEffect(() => {
 *   // The listener is automatically typed based on the event name.
 *   const unsubscribe = listen(counterTarget, 'statechange', (event) => {
 *     setCount(event.detail.state.context.count);
 *   });
 *
 *   // The returned function is perfect for a useEffect cleanup.
 *   return unsubscribe;
 * }, []);
 */
export function listen<M extends Machine<any>, K extends keyof MachineEventMap<M>>(
  target: MachineEventTarget<M>,
  type: K,
  listener: (event: MachineEventMap<M>[K]) => void
): () => void {
  target.addMachineEventListener(type, listener);
  return () => {
    target.removeMachineEventListener(type, listener);
  };
}


// =============================================================================
// SECTION 2: EventEmitter Adapter (for Node.js & Event-Driven Architectures)
// =============================================================================

/**
 * Defines the events and their payloads that our MachineEventEmitter can emit,
 * providing strict type safety for listeners.
 */
interface MachineEmitterEvents<M extends Machine<any>> {
  statechange: (newState: M) => void;
  error: (error: Error) => void;
}

/**
 * A type-safe, augmented EventEmitter that wraps a state machine.
 *
 * It provides two key functionalities:
 * 1. Emits a `'statechange'` event whenever the machine's state updates.
 * 2. Exposes a type-safe `dispatch` method to trigger machine transitions.
 *
 * @template M The machine type (can be a union of states).
 */
export class MachineEventEmitter<M extends Machine<any>> extends EventEmitter {
  private readonly runner: Runner<M>;

  // Augment EventEmitter's methods to be fully type-safe with our event map.
  public on<E extends keyof MachineEmitterEvents<M>>(event: E, listener: MachineEmitterEvents<M>[E]): this {
    return super.on(event, listener);
  }
  public emit<E extends keyof MachineEmitterEvents<M>>(event: E, ...args: Parameters<MachineEmitterEvents<M>[E]>): boolean {
    return super.emit(event, ...args);
  }

  public get state(): M {
    return this.runner.state;
  }
  public get context(): Context<M> {
    return this.runner.state.context;
  }

  constructor(initialMachine: M) {
    super();
    this.runner = createRunner(initialMachine, (newState) => {
      this.emit('statechange', newState);
    });
  }

  /**
   * A type-safe method for dispatching transitions to the machine.
   * This is the primary input for the machine in an event-driven system.
   *
   * @param eventName The name of the transition to trigger.
   * @param args The arguments for that transition, matching the method signature.
   *
   * @example
   * sessionEmitter.dispatch('login', 'username', 'password');
   */
  public dispatch<K extends TransitionNames<M>>(
    eventName: K,
    ...args: M[K] extends (...args: infer A) => any ? A : never
  ): void {
    const action = (this.runner.actions as any)[eventName];

    if (typeof action === 'function') {
      try {
        action(...args);
      } catch (error) {
        this.emit('error', asError(error));
      }
    } else {
      this.emit('error', new Error(`Invalid event "${String(eventName)}" for current state.`));
    }
  }
}

/**
 * Creates a Node.js-style EventEmitter from a machine.
 *
 * This adapter is perfect for backend services, scripts, or any architecture that
 * uses the classic EventEmitter pattern for decoupling system components.
 *
 * @param initialMachine The machine instance to wrap.
 * @returns A `MachineEventEmitter` instance.
 */
export function asEventEmitter<M extends Machine<any>>(initialMachine: M): MachineEventEmitter<M> {
  return new MachineEventEmitter(initialMachine);
}


// =============================================================================
// SECTION 3: Observable Adapter (for Stream-Based Architectures)
// =============================================================================

/**
 * A type-safe Observable that wraps a state machine, emitting the new state
 * on every transition.
 *
 * This class conforms to the standard Observable interface, making it compatible
 * with libraries like RxJS and frameworks that use Observables (e.g., Angular).
 *
 * @template M The machine type (can be a union of states).
 */
export class MachineObservable<M extends Machine<any>> implements Observable<M> {
  private readonly runner: Runner<M>;
  private observers: Set<Observer<M>> = new Set();
  private completed = false;

  public get state(): M {
    return this.runner.state;
  }
  public get context(): Context<M> {
    return this.runner.state.context;
  }

  constructor(initialMachine: M) {
    this.runner = createRunner(initialMachine, (newState) => {
      // When the runner's state changes, push the new state to all subscribers.
      this.emitNext(newState);
    });

    // We can also forward errors from the runner if we enhance it to do so.
  }

  /**
   * Subscribes to the stream of machine states.
   *
   * @param observer An object with `next`, `error`, and `complete` methods.
   * @returns A subscription object with an `unsubscribe` method.
   */
  public subscribe(observer: Observer<M>): { unsubscribe: () => void } {
    if (this.completed) {
      observer.complete?.();
      return { unsubscribe: () => undefined };
    }

    this.observers.add(observer);

    // Register before emitting so a transition dispatched by this callback is not missed.
    this.notifyNext(observer, this.runner.state);
    
    return {
      unsubscribe: () => {
        this.observers.delete(observer);
        // Optional: If this is the last observer, we could tear down the machine.
        // For now, we keep it simple and the machine lives forever.
      },
    };
  }

  /**
   * A type-safe method for dispatching transitions to the machine.
   *
   * @param eventName The name of the transition to trigger.
   * @param args The arguments for that transition.
   */
  public dispatch<K extends TransitionNames<M>>(
    eventName: K,
    ...args: M[K] extends (...args: infer A) => any ? A : never
  ): void {
    if (this.completed) return;

    const action = (this.runner.actions as any)[eventName];
    if (typeof action === 'function') {
      try {
        action(...args);
      } catch (error) {
        this.emitError(asError(error));
      }
    } else {
      // Emit an error to all observers.
      const error = new Error(`Invalid event "${String(eventName)}" for current state.`);
      this.emitError(error);
    }
  }
  
  /**
   * Signals to all observers that the stream is complete.
   * This is useful when the machine reaches a final state.
   */
  public complete(): void {
    if (this.completed) return;
    this.completed = true;
    for (const observer of [...this.observers]) {
      try {
        observer.complete?.();
      } catch (error) {
        this.notifyError(observer, asError(error));
      }
    }
    this.observers.clear();
  }

  private emitNext(state: M): void {
    for (const observer of [...this.observers]) {
      this.notifyNext(observer, state);
    }
  }

  private notifyNext(observer: Observer<M>, state: M): void {
    try {
      observer.next?.(state);
    } catch (error) {
      this.notifyError(observer, asError(error));
    }
  }

  private emitError(error: Error): void {
    for (const observer of [...this.observers]) {
      this.notifyError(observer, error);
    }
  }

  private notifyError(observer: Observer<M>, error: Error): void {
    if (!observer.error) {
      console.error('[MachineObservable] Observer failed:', error);
      return;
    }
    try {
      observer.error(error);
    } catch (observerError) {
      console.error('[MachineObservable] Observer error handler failed:', observerError);
    }
  }
}

/**
 * Creates an Observable from a machine.
 *
 * This adapter is perfect for integrating your machine into architectures that
 * rely on Observables and reactive streams (e.g., RxJS, Angular). It emits the
 * new machine state on every transition.
 *
 * @param initialMachine The machine instance to wrap.
 * @returns A `MachineObservable` instance.
 */
export function asObservable<M extends Machine<any>>(initialMachine: M): MachineObservable<M> {
  return new MachineObservable(initialMachine);
}
