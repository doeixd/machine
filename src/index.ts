/**
 * @file A tiny, immutable, and type-safe state machine library for TypeScript.
 * @author doeixd
 * @version 1.0.0
 */

// =============================================================================
// SECTION: CORE TYPES & INTERFACES
// =============================================================================

/**
 * A utility type that represents either a value of type T or a Promise that resolves to T.
 * @template T - The value type.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * The fundamental shape of any machine: a `context` object for state, and methods for transitions.
 * @template C - The context (state) object type.
 */
export type Machine<C extends object> = {
  /** The readonly state of the machine. */
  readonly context: C;
} & Record<string, (...args: any[]) => Machine<any>>;

/**
 * The shape of an asynchronous machine, where transitions can return Promises.
 * @template C - The context (state) object type.
 */
export type AsyncMachine<C extends object> = {
  /** The readonly state of the machine. */
  readonly context: C;
} & Record<string, (...args: any[]) => MaybePromise<AsyncMachine<any>>>;


// =============================================================================
// SECTION: TYPE UTILITIES & INTROSPECTION
// =============================================================================

/**
 * Extracts the context type `C` from a machine type `M`.
 * @template M - The machine type.
 * @example type Ctx = Context<Machine<{ count: number }>> // { count: number }
 */
export type Context<M extends { context: any }> = M["context"];

/**
 * Extracts the transition function signatures from a machine, excluding the context property.
 * @template M - The machine type.
 */
export type Transitions<M extends BaseMachine<any>> = Omit<M, "context">;

/**
 * Extracts the argument types for a specific transition function in a Machine.
 * @template M - The machine type.
 * @template K - The transition function name.
 */
export type TransitionArgs<M extends Machine<any>, K extends keyof M & string> =
  M[K] extends (...args: infer A) => any ? A : never;

/**
 * Extracts the names of all transitions as a string union type.
 * @template M - The machine type.
 * @example
 * type Names = TransitionNames<Machine<{ count: number }> & { increment: () => any }>
 * // Names = "increment"
 */
export type TransitionNames<M extends BaseMachine<any>> = keyof Omit<M, "context"> & string;

/**
 * Base machine type that both Machine and AsyncMachine extend from.
 * @template C - The context object type.
 */
export type BaseMachine<C extends object> = {
  /** The readonly state of the machine. */
  readonly context: C;
} & Record<string, (...args: any[]) => any>;

/**
 * Helper to make a type deeply readonly (freezes nested objects).
 * Useful for ensuring immutability of context at the type level.
 * @template T - The type to make readonly.
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object
    ? T[P] extends (...args: any[]) => any
      ? T[P]
      : DeepReadonly<T[P]>
    : T[P];
};

/**
 * Infers the machine type from a machine factory function.
 * @template F - The factory function type.
 * @example
 * const factory = () => createMachine({ count: 0 }, { ... });
 * type MyMachine = InferMachine<typeof factory>; // Extracts the return type
 */
export type InferMachine<F extends (...args: any[]) => any> = ReturnType<F>;

/**
 * A discriminated union type representing an event that can be dispatched to a machine.
 * This is automatically generated from a machine's type signature, ensuring full type safety.
 * @template M - The machine type.
 * @example
 * type CounterEvent = Event<Machine<{ count: number }>& { add: (n: number) => any }>
 * // CounterEvent = { type: "add"; args: [number] }
 */
export type Event<M extends BaseMachine<any>> = {
  [K in keyof Omit<M, "context"> & string]: M[K] extends (...args: infer A) => any
    ? { type: K; args: A }
    : never
}[keyof Omit<M, "context"> & string];


// =============================================================================
// SECTION: MACHINE CREATION (FUNCTIONAL & OOP)
// =============================================================================

/**
 * Creates a synchronous state machine from a context and transition functions.
 * This is the core factory for the functional approach.
 *
 * @template C - The context object type.
 * @param context - The initial state context.
 * @param fns - An object containing transition function definitions.
 * @returns A new machine instance.
 */
export function createMachine<C extends object, T extends Record<string, (this: C, ...args: any[]) => any>>(
  context: C,
  fns: T
): { context: C } & T {
  return Object.assign({ context }, fns);
}

/**
 * Creates an asynchronous state machine from a context and async transition functions.
 *
 * @template C - The context object type.
 * @param context - The initial state context.
 * @param fns - An object containing async transition function definitions.
 * @returns A new async machine instance.
 */
export function createAsyncMachine<C extends object, T extends Record<string, (this: C, ...args: any[]) => any>>(
  context: C,
  fns: T
): { context: C } & T {
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
export function createMachineFactory<C extends object>() {
  return <T extends Record<string, (ctx: C, ...args: any[]) => C>>(
    transformers: T
  ) => {
    type MachineFns = {
      [K in keyof T]: (
        this: C,
        ...args: T[K] extends (ctx: C, ...args: infer A) => C ? A : never
      ) => Machine<C>;
    };

    const fns = Object.fromEntries(
      Object.entries(transformers).map(([key, transform]) => [
        key,
        function (this: C, ...args: any[]) {
          const newContext = (transform as any)(this, ...args);
          return createMachine(newContext, fns as any);
        },
      ])
    ) as MachineFns;

    return (initialContext: C): Machine<C> & MachineFns => {
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
export function setContext<M extends Machine<any>>(
  machine: M,
  newContextOrFn: Context<M> | ((ctx: Readonly<Context<M>>) => Context<M>)
): M {
  const { context, ...transitions } = machine;
  const newContext =
    typeof newContextOrFn === "function"
      ? (newContextOrFn as (ctx: Readonly<Context<M>>) => Context<M>)(context)
      : newContextOrFn;

  return createMachine(newContext, transitions) as M;
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
export function overrideTransitions<
  M extends Machine<any>,
  T extends Record<string, (this: Context<M>, ...args: any[]) => any>
>(
  machine: M,
  overrides: T
): Machine<Context<M>> & Omit<Transitions<M>, keyof T> & T {
  const { context, ...originalTransitions } = machine;
  const newTransitions = { ...originalTransitions, ...overrides };
  return createMachine(context, newTransitions) as any;
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
export function extendTransitions<
  M extends Machine<any>,
  T extends Record<string, (this: Context<M>, ...args: any[]) => any> & {
    [K in keyof T]: K extends keyof M ? never : T[K];
  }
>(machine: M, newTransitions: T): M & T {
  const { context, ...originalTransitions } = machine;
  const combinedTransitions = { ...originalTransitions, ...newTransitions };
  return createMachine(context, combinedTransitions) as M & T;
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
export function createMachineBuilder<M extends Machine<any>>(
  templateMachine: M
): (context: Context<M>) => M {
  const { context, ...transitions } = templateMachine;
  return (newContext: Context<M>): M => {
    return createMachine(newContext, transitions) as M;
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
export function matchMachine<
  M extends Machine<any>,
  K extends keyof Context<M> & string,
  R
>(
  machine: M,
  discriminantKey: K,
  handlers: {
    [V in Context<M>[K] & string]: (ctx: Context<M>) => R;
  }
): R {
  const discriminant = machine.context[discriminantKey] as Context<M>[K] & string;
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
export function hasState<
  M extends Machine<any>,
  K extends keyof Context<M>,
  V extends Context<M>[K]
>(
  machine: M,
  key: K,
  value: V
): machine is M & { context: Context<M> & { [P in K]: V } } {
  return machine.context[key] === value;
}


// =============================================================================
// SECTION: RUNTIME & EVENT DISPATCHER
// =============================================================================

/**
 * Runs an asynchronous state machine with a managed lifecycle and event dispatch capability.
 * This is the "interpreter" for async machines, handling state updates and side effects.
 *
 * @template M - The initial machine type.
 * @param initial - The initial machine state.
 * @param onChange - Optional callback invoked with the new machine state after every transition.
 * @returns An object with a `state` getter for the current context and an async `dispatch` function.
 */
export function runMachine<M extends AsyncMachine<any>>(
  initial: M,
  onChange?: (m: M) => void
) {
  let current = initial;

  async function dispatch<E extends Event<typeof current>>(event: E): Promise<M> {
    const fn = (current as any)[event.type];
    if (typeof fn !== 'function') {
      throw new Error(`[Machine] Unknown event type '${String(event.type)}' on current state.`);
    }
    const nextState = await fn.apply(current.context, event.args);
    current = nextState;
    onChange?.(current);
    return current;
  }

  return {
    /** Gets the context of the current state of the machine. */
    get state(): Context<M> {
      return current.context;
    },
    /** Dispatches a type-safe event to the machine, triggering a transition. */
    dispatch,
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
export class MachineBase<C extends object> {
  /**
   * The immutable state of the machine.
   * To change the state, a transition method must return a new machine instance
   * with a new context object.
   */
  public readonly context: C;

  /**
   * Initializes a new machine instance with its starting context.
   * @param context - The initial state of the machine.
   */
  constructor(context: C) {
    this.context = context;
    // Object.freeze can provide additional runtime safety against accidental mutation,
    // though it comes with a minor performance cost. It's a good practice for ensuring purity.
    // Object.freeze(this.context);
  }
}


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
export function next<C extends object>(
  m: Machine<C>,
  update: (ctx: Readonly<C>) => C
): Machine<C> {
  const { context, ...transitions } = m;
  return createMachine(update(context), transitions) as Machine<C>;
}

/**
 * A type representing either a synchronous Machine or a Promise that resolves to a Machine.
 * Useful for functions that can return either sync or async machines.
 *
 * @template C - The context object type.
 *
 * @example
 * function getMachine(): MachineLike<{ count: number }> {
 *   if (Math.random() > 0.5) {
 *     return createMachine({ count: 0 }, { ... });
 *   } else {
 *     return Promise.resolve(createMachine({ count: 0 }, { ... }));
 *   }
 * }
 */
export type MachineLike<C extends object> =
  | Machine<C>
  | Promise<Machine<C>>;

/**
 * A type representing the result of a machine transition.
 * Can be either:
 * - A new machine state
 * - A tuple of [machine, cleanup function] where cleanup is called when leaving the state
 *
 * This enables state machines with side effects that need cleanup (e.g., subscriptions, timers).
 *
 * @template C - The context object type.
 *
 * @example
 * function transition(): MachineResult<{ count: number }> {
 *   const interval = setInterval(() => console.log("tick"), 1000);
 *   const machine = createMachine({ count: 0 }, { ... });
 *   return [machine, () => clearInterval(interval)];
 * }
 */
export type MachineResult<C extends object> =
  | Machine<C>
  | [Machine<C>, () => void | Promise<void>];


// =============================================================================
// SECTION: GENERATOR-BASED COMPOSITION
// =============================================================================

export {
  run,
  step,
  yieldMachine,
  runSequence,
  createFlow,
  runWithDebug,
  runAsync,
  stepAsync
} from './generators';
