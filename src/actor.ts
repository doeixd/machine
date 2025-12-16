import {
  Event,
  BaseMachine,
  TransitionNames,
  TransitionArgs,
  MaybePromise,
  createMachine
} from './index';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A standard interface for interacting with any actor-like entity.
 */
export interface ActorRef<T> {
  dispatch: (event: any) => void;
  getSnapshot: () => T;
  subscribe: (observer: (state: T) => void) => () => void;
}

/**
 * Inspection event type.
 */
export type InspectionEvent = {
  type: '@actor/send'; // Extendable for lifecycle
  actor: ActorRef<any>;
  event: any;
  snapshot: any;
};

// =============================================================================
// ACTOR CLASS
// =============================================================================

/**
 * A reactive container for a state machine that handles dispatching,
 * queueing of async transitions, and state observability.
 */
export class Actor<M extends BaseMachine<any>> implements ActorRef<M> {
  private _state: M;
  private _observers: Set<(state: M) => void> = new Set();
  private _queue: Array<Event<M>> = [];
  private _processing = false;

  // Global inspector
  private static _inspector: ((event: InspectionEvent) => void) | null = null;

  /**
   * Registers a global inspector.
   */
  static inspect(inspector: (event: InspectionEvent) => void) {
    Actor._inspector = inspector;
  }

  /**
   * The "Magic" Dispatcher.
   * Maps machine transition names to callable functions.
   */
  readonly send: {
    [K in TransitionNames<M>]: (...args: TransitionArgs<M, K>) => void;
  };

  /**
   * A stable reference to the dispatch method, useful for passing around.
   */
  readonly ref: {
    send: (event: Event<M>) => void;
  };

  constructor(initialMachine: M) {
    this._state = initialMachine;

    // Pattern B: Reference to self for event-based dispatch
    this.ref = {
      send: (event) => this.dispatch(event)
    };

    // Pattern A: Proxy for RPC-style dispatch
    this.send = new Proxy({} as any, {
      get: (_target, prop) => {
        return (...args: any[]) => {
          this.dispatch({ type: prop as any, args: args as any } as unknown as Event<M>);
        };
      }
    });
  }

  /**
   * Returns the current immutable snapshot of the machine.
   */
  getSnapshot(): M {
    return this._state;
  }

  /**
   * Subscribes to state changes.
   * @param observer Callback function to be invoked on every state change.
   * @returns Unsubscribe function.
   */
  subscribe(observer: (state: M) => void): () => void {
    this._observers.add(observer);
    return () => {
      this._observers.delete(observer);
    };
  }

  /**
   * Selects a slice of the state. 
   */
  select<T>(selector: (state: M) => T): T {
    return selector(this._state);
  }

  /**
   * Starts the actor.
   */
  start(): this {
    return this;
  }

  /**
   * Stops the actor.
   */
  stop(): void {
    this._observers.clear();
  }

  /**
   * Dispatches an event to the actor.
   * Handles both sync and async transitions.
   */
  dispatch(event: Event<M>): void {
    // Inspection
    if (Actor._inspector) {
      Actor._inspector({
        type: '@actor/send',
        actor: this,
        event,
        snapshot: this._state
      });
    }

    if (this._processing) {
      this._queue.push(event);
      return;
    }

    this._processing = true;
    this._queue.push(event);
    this._flush();
  }

  private _flush() {
    while (this._queue.length > 0) {
      const event = this._queue[0];
      this._queue.shift();

      const transitions = this._state as any;
      const fn = transitions[event.type];

      if (typeof fn !== 'function') {
        console.warn(`[Actor] Transition '${String(event.type)}' not found.`);
        continue;
      }

      let result: MaybePromise<M>;
      try {
        result = fn.apply(this._state.context, event.args);
      } catch (error) {
        console.error(`[Actor] Error in transition '${String(event.type)}':`, error);
        continue;
      }

      if (result instanceof Promise) {
        result.then((nextState) => {
          this._state = nextState;
          this._notify();
          this._flush();
        }).catch((error) => {
          console.error(`[Actor] Async error in transition '${String(event.type)}':`, error);
          this._flush();
        });
        return;
      } else {
        this._state = result;
        this._notify();
      }
    }
    this._processing = false;
  }

  private _notify() {
    const snapshot = this.getSnapshot();
    this._observers.forEach(obs => obs(snapshot));
  }
}

// =============================================================================
// INTEROP & HELPERS
// =============================================================================

/**
 * Creates a new Actor instance from a machine.
 */
export function createActor<M extends BaseMachine<any>>(machine: M): Actor<M> {
  return new Actor(machine);
}

/**
 * Spawns an actor from a machine. Alias for createActor.
 */
export function spawn<M extends BaseMachine<any>>(machine: M): ActorRef<M> {
  return createActor(machine);
}

/**
 * Creates an actor-like machine from a Promise.
 */
export function fromPromise<T>(promiseFn: () => Promise<T>) {
  type PromiseContext =
    | { status: 'pending'; data: undefined; error: undefined }
    | { status: 'resolved'; data: T; error: undefined }
    | { status: 'rejected'; data: undefined; error: any };

  const initial: PromiseContext = { status: 'pending', data: undefined, error: undefined };

  const machine = createMachine<PromiseContext>(initial,
    (next) => ({
      resolve(data: T) {
        return next({ status: 'resolved' as const, data, error: undefined });
      },
      reject(error: any) {
        return next({ status: 'rejected' as const, error, data: undefined });
      }
    })
  );

  const actor = createActor(machine);

  promiseFn()
    .then(data => (actor.send as any).resolve(data))
    .catch(err => (actor.send as any).reject(err));

  return actor;
}

/**
 * Creates an actor-like machine from an Observable.
 */
export function fromObservable<T>(observable: { subscribe: (next: (val: T) => void, error?: (err: any) => void, complete?: () => void) => { unsubscribe: () => void } }) {
  type ObsContext =
    | { status: 'active'; value: undefined; error: undefined }
    | { status: 'active'; value: T; error: undefined }
    | { status: 'done'; value: undefined; error: undefined }
    | { status: 'error'; value: undefined; error: any };

  const initial: ObsContext = { status: 'active', value: undefined, error: undefined };

  const machine = createMachine<ObsContext>(initial,
    (next) => ({
      next(value: T) {
        return next({ status: 'active' as const, value, error: undefined });
      },
      error(error: any) {
        return next({ status: 'error' as const, error, value: undefined });
      },
      complete() {
        return next({ status: 'done' as const, value: undefined, error: undefined });
      }
    })
  );

  const actor = createActor(machine);

  observable.subscribe(
    (val) => (actor.send as any).next(val),
    (err) => (actor.send as any).error(err),
    () => (actor.send as any).complete()
  );

  return actor;
}
