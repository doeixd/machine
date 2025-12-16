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
 * The fundamental shape of a synchronous machine. This is a highly advanced
 * generic type that performs two critical functions at compile time:
 *
 * 1.  **Extraction:** It intelligently infers the pure transitions object from
 *     the flexible argument `A` (which can be a plain object, a factory
 *     function, or the augmented `this` from another transition).
 *
 * 2.  **Filtering:** After extracting the transitions, it filters them, keeping
 *     only the functions that return a valid `Machine`.
 *
 * This makes the `Machine` type itself the single source of truth for what
 * constitutes a valid, type-safe machine, enabling a remarkably clean and
 * powerful API for `createMachine`.
 *
 * @template C The context object type.
 * @template A The raw, flexible argument for transitions (object, factory, or `this`).
 */
export type Machine<
  C extends object,
  T extends object = {}
> = {
  readonly context: C;
} & T;

/**
 * The shape of an asynchronous machine, where transitions can return Promises.
 * Async transitions receive an AbortSignal as the last parameter for cancellation support.
 * @template C - The context object type.
 */
export type AsyncMachine<
  C extends object,
  T extends object = {}
> = {
  readonly context: C;
} & T;

/**
 * Utility type to extract the parameters of an async transition function,
 * which includes TransitionOptions as the last parameter.
 */
export type AsyncTransitionArgs<M extends AsyncMachine<any, any>, K extends keyof M & string> =
  M[K] extends (...a: infer A) => any
  ? A extends [...infer Rest, TransitionOptions] ? Rest : A
  : never;

/**
 * A helper type to define a distinct state in a state machine (a "typestate").
 * Allows defining the context and transitions in a single generic type.
 * @template C - The context specific to this state.
 * @template T - The transitions available in this state.
 */
export type TypeState<C extends object, T extends object = {}> = Machine<C, T>;

/**
 * A helper type to define a distinct async state in a state machine.
 * @template C - The context specific to this state.
 * @template T - The transitions available in this state.
 */
export type AsyncTypeState<C extends object, T extends object = {}> = AsyncMachine<C, T>;


/**
 * Options passed to async transition functions, including cancellation support.
 */
export interface TransitionOptions {
  /** AbortSignal for cancelling long-running async operations. */
  signal: AbortSignal;
}


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
};

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


export type EventFromTransitions<T extends Record<string, (...args: any[]) => any>> =
  { [K in keyof T & string]: { type: K; args: T[K] extends (...a: infer A) => any ? A : never } }[keyof T & string];

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


/**
 * A helper type for use with TypeScript's `satisfies` operator to provide
 * strong, immediate type-checking for standalone transition objects.
 *
 * This solves the "chicken-and-egg" problem where you need the final machine
 * type to correctly type the transitions object, but you need the transitions
 * object to create the machine. By forward-declaring the machine type and using
 * `satisfies TransitionsFor<...>`, you get full IntelliSense and error-checking
 * at the exact location of your transition definitions.
 *
 * @template C The context object type for the machine.
 * @template T The literal type of the transitions object itself (`typeof myTransitions`).
 *
 * @example
 * import { createMachine, Machine, TransitionsFor } from '@doeixd/machine';
 *
 * // 1. Define the context for your machine.
 * type CounterContext = { count: number };
 *
 * // 2. Forward-declare the final machine type. This is the key step that
 * //    breaks the circular dependency for the type checker.
 * type CounterMachine = Machine<CounterContext> & typeof counterTransitions;
 *
 * // 3. Define the transitions object, using `satisfies` to apply the helper type.
 * //    This provides immediate type-checking and full autocompletion for `this`.
 * const counterTransitions = {
 *   increment() {
 *     // `this` is now fully typed!
 *     // IntelliSense knows `this.count` is a number and
 *     // `this.transitions.add` is a function.
 *     return createMachine({ count: this.count + 1 }, this.transitions);
 *   },
 *   add(n: number) {
 *     return createMachine({ count: this.count + n }, this.transitions);
 *   },
 *   // ❌ TypeScript will immediately throw a compile error on the next line
 *   //    because the return type 'string' does not satisfy 'Machine<any>'.
 *   invalidTransition() {
 *     return "this is not a machine";
 *   }
 * } satisfies TransitionsFor<CounterContext, typeof counterTransitions>;
 *
 * // 4. Create the machine instance. The `createMachine` call is now
 * //    guaranteed to be type-safe because `counterTransitions` has already
 * //    been validated.
 * export function createCounter(initialCount = 0): CounterMachine {
 *   return createMachine({ count: initialCount }, counterTransitions);
 * }
 */
export type TransitionsFor<C extends object, T extends Record<string, any>> = {
  [K in keyof T]: (this: C & { transitions: T }, ...args: Parameters<T[K] extends (...a: infer A) => any ? (...a: A) => any : never>) => Machine<any, any>;
};

/**
 * A helper type for use with the `satisfies` operator to provide strong
 * type-checking for standalone asynchronous transition objects.
 */
export type AsyncTransitionsFor<C extends object, T extends Record<string, any>> = {
  [K in keyof T]: (this: C & { transitions: T }, ...args: Parameters<T[K] extends (...a: infer A) => any ? (...a: A) => any : never>) => MaybePromise<AsyncMachine<any, any>>;
};

/**
 * A mapped type that iterates over a transitions object `T` and keeps only the
 * keys whose functions return a valid `Machine`. This provides a "self-correcting"
 * type that prevents the definition of invalid transitions at compile time.
 *
 * It acts as a filter at the type level. When used in the return type of a
 * function like `createMachine`, it ensures that the resulting machine object
 * will not have any properties corresponding to functions that were defined
 * with an incorrect return type. This provides immediate, precise feedback to
 * the developer, making it impossible to create a machine with an invalid
 * transition shape.
 *
 * @template T The raw transitions object type provided by the user.
 *
 * @example
 * import { createMachine, Machine } from '@doeixd/machine';
 *
 * const machine = createMachine({ value: 'A' }, {
 *   // This is a valid transition because it returns a `Machine`.
 *   // The key 'goToB' will be PRESERVED in the final type.
 *   goToB() {
 *     return createMachine({ value: 'B' }, this.transitions);
 *   },
 *
 *   // This is an INVALID transition because it returns a string.
 *   // The key 'invalid' will be OMITTED from the final type.
 *   invalid() {
 *     return "This is not a Machine object";
 *   },
 *
 *   // This is also invalid as it's not a function.
 *   // The key 'alsoInvalid' will be OMITTED from the final type.
 *   alsoInvalid: 123
 * });
 *
 * // --- USAGE ---
 *
 * // ✅ This call is valid and works as expected.
 * const nextState = machine.goToB();
 *
 * // ❌ This line will cause a COMPILE-TIME a ERROR because the `FilterValidTransitions`
 * //    type has removed the 'invalid' key from the `machine`'s type signature.
 * //
 * //    Error: Property 'invalid' does not exist on type
 * //    'Machine<{ value: string; }> & { goToB: () => Machine<...>; }'.
 * //
 * machine.invalid();
 */
export type FilterValidTransitions<T> = {
  [K in keyof T as T[K] extends (...args: any[]) => Machine<any> ? K : never]: T[K];
};

/**
 * A conditional type that intelligently extracts the pure transitions object `T`
 * from the flexible second argument of `createMachine`.
 *
 * It handles three cases:
 * 1. If the argument is the augmented `this` context (`C & { transitions: T }`), it extracts `T`.
 * 2. If the argument is a factory function `((ctx: C) => T)`, it infers and returns `T`.
 * 3. If the argument is already the pure transitions object `T`, it returns it as is.
 */
export type ExtractTransitions<Arg, C extends object> = Arg extends (
  ...args: any[]
) => infer R
  ? R // Case 2: It's a factory function, extract the return type `R`.
  : Arg extends C & { transitions: infer T }
  ? T // Case 1: It's the augmented `this` context, extract `T` from `transitions`.
  : Arg; // Case 3: It's already the plain transitions object.

/** Keep only keys whose value is a function that returns a Machine. */
export type ValidTransitions<T> = {
  [K in keyof T as T[K] extends (...a: any[]) => Machine<any, any> ? K : never]:
  T[K] extends (...a: infer A) => Machine<infer C2, infer T2> ? (...a: A) => Machine<C2, T2> : never;
};

/** Same for async transitions (functions returning MaybePromise<AsyncMachine>). */
export type ValidAsyncTransitions<T> = {
  [K in keyof T as T[K] extends (...a: any[]) => MaybePromise<AsyncMachine<any, any>> ? K : never]:
  T[K] extends (...a: infer A) => MaybePromise<AsyncMachine<infer C2, infer T2>> ? (...a: A) => MaybePromise<AsyncMachine<C2, T2>> : never;
};

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
/**
 * Helper to transform transition functions to be bound (no 'this' requirement).
 */
export type BindTransitions<T> = {
  [K in keyof T]: T[K] extends (this: any, ...args: infer A) => infer R
  ? (...args: A) => R
  : T[K];
};

/**
 * Creates a synchronous state machine from a context and a factory function.
 * This "Functional Builder" pattern allows for type-safe transitions without
 * manually passing `this` or `transitions`.
 *
 * @template C - The context object type.
 * @template T - The transitions object type.
 * @param context - The initial state context.
 * @param factory - A function that receives a `transition` helper and returns the transitions object.
 * @returns A new machine instance.
 */
export function createMachine<C extends object, T extends Record<string, (this: C, ...args: any[]) => any> = Record<string, (this: C, ...args: any[]) => any>>(
  context: C,
  factory: (transition: (newContext: C) => Machine<C, any>) => T
): Machine<C, BindTransitions<T>>;

/**
 * Creates a synchronous state machine from a context and transition functions.
 * This is the core factory for the functional approach.
 *
 * @template C - The context object type.
 * @param context - The initial state context.
 * @param fns - An object containing transition function definitions.
 * @returns A new machine instance.
 */
export function createMachine<C extends object, T extends Record<string, (this: { context: C } & T, ...args: any[]) => any> & { context?: any }>(
  context: C,
  fns: T
): { context: C } & T;

/**
 * Creates a synchronous state machine by copying context and transitions from an existing machine.
 * This is useful for creating a new machine with updated context but the same transitions.
 *
 * @template C - The context object type.
 * @template M - The machine type to copy transitions from.
 * @param context - The new context.
 * @param machine - The machine to copy transitions from.
 * @returns A new machine instance with the given context and copied transitions.
 */
export function createMachine<C extends object, M extends BaseMachine<C>>(
  context: C,
  machine: M
): Machine<C, Transitions<M>>;

/**
 * Creates a synchronous state machine from a context and transition functions that expect `this` to be the context object.
 * This is used internally by utilities that need to bind transitions to context objects.
 *
 * @template C - The context object type.
 * @param context - The initial state context.
 * @param fns - An object containing transition function definitions that expect `this` to be the context.
 * @returns A new machine instance.
 */
export function createMachine<C extends object, T extends Record<string, (this: C, ...args: any[]) => any>>(
  context: C,
  fns: T
): Machine<C, T>;

export function createMachine(context: any, fnsOrFactory: any): any {
  if (typeof fnsOrFactory === 'function') {
    let transitions: any;
    const transition = (newContext: any) => {
      const machine = createMachine(newContext, transitions);
      // Re-bind transitions to the new context
      const boundTransitions = Object.fromEntries(
        Object.entries(transitions).map(([key, fn]) => [
          key,
          (fn as Function).bind(newContext)
        ])
      );
      return Object.assign(machine, boundTransitions);
    };
    transitions = fnsOrFactory(transition);

    // Bind transitions to initial context
    const boundTransitions = Object.fromEntries(
      Object.entries(transitions).map(([key, fn]) => [
        key,
        (fn as Function).bind(context)
      ])
    );

    return Object.assign({ context }, boundTransitions);
  }

  // If fns is a machine (has context property), extract just the transition functions
  const transitions = 'context' in fnsOrFactory ? Object.fromEntries(
    Object.entries(fnsOrFactory).filter(([key]) => key !== 'context')
  ) : fnsOrFactory;

  // For normal object transitions, we might also need binding if they use `this`
  // But existing code expects `this` to be the machine (context + transitions).
  // The new API expects `this` to be just context.

  const machine = Object.assign({ context }, transitions);
  return machine;
}

/**
 * Creates an asynchronous state machine from a context and a factory function.
 * This "Functional Builder" pattern allows for type-safe transitions without
 * manually passing `this` or `transitions`.
 *
 * @template C - The context object type.
 * @template T - The transitions object type.
 * @param context - The initial state context.
 * @param factory - A function that receives a `transition` helper and returns the transitions object.
 * @returns A new async machine instance.
 */
export function createAsyncMachine<C extends object, T extends Record<string, (this: C, ...args: any[]) => any>>(
  context: C,
  factory: (transition: (newContext: C) => AsyncMachine<C, T>) => T
): AsyncMachine<C, BindTransitions<T>>;

/**
 * Creates an asynchronous state machine by copying context and transitions from an existing machine.
 * This is useful for creating a new machine with updated context but the same transitions.
 *
 * @template C - The context object type.
 * @template M - The machine type to copy transitions from.
 * @param context - The new context.
 * @param machine - The machine to copy transitions from.
 * @returns A new async machine instance with the given context and copied transitions.
 */
export function createAsyncMachine<C extends object, M extends BaseMachine<C>>(
  context: C,
  machine: M
): AsyncMachine<C, Transitions<M>>;

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
): AsyncMachine<C, T>;

export function createAsyncMachine(context: any, fnsOrFactory: any): any {
  if (typeof fnsOrFactory === 'function') {
    let transitions: any;
    const transition = (newContext: any) => {
      const machine = createAsyncMachine(newContext, transitions);
      // Re-bind transitions to the new context
      const boundTransitions = Object.fromEntries(
        Object.entries(transitions).map(([key, fn]) => [
          key,
          (fn as Function).bind(newContext)
        ])
      );
      return Object.assign(machine, boundTransitions);
    };
    transitions = fnsOrFactory(transition);

    // Bind transitions to initial context
    const boundTransitions = Object.fromEntries(
      Object.entries(transitions).map(([key, fn]) => [
        key,
        (fn as Function).bind(context)
      ])
    );

    return Object.assign({ context }, boundTransitions);
  }

  // If fns is a machine (has context property), extract just the transition functions
  const transitions = 'context' in fnsOrFactory ? Object.fromEntries(
    Object.entries(fnsOrFactory).filter(([key]) => key !== 'context')
  ) : fnsOrFactory;

  const machine = Object.assign({ context }, transitions);
  return machine;
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
        this: Machine<C>,
        ...args: T[K] extends (ctx: C, ...args: infer A) => C ? A : never
      ) => MaybePromise<Machine<C>>;
    };

    const fns = Object.fromEntries(
      Object.entries(transformers).map(([key, transform]) => [
        key,
        function (this: Machine<C>, ...args: any[]) {
          const newContext = (transform as any)(this.context, ...args);
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

  return createMachine(newContext, transitions as any) as M;
}

/**
 * Creates a minimal machine-like object with just a context property.
 * Useful for creating test fixtures and working with pattern matching utilities.
 *
 * @template C - The context type
 * @param context - The context object
 * @returns An object with a readonly context property
 *
 * @example
 * ```typescript
 * // For testing with discriminated unions
 * type FetchContext =
 *   | { status: 'idle' }
 *   | { status: 'success'; data: string };
 *
 * const idleMachine = createContext<FetchContext>({ status: 'idle' });
 * const successMachine = createContext<FetchContext>({ status: 'success', data: 'result' });
 *
 * // Works with pattern matching
 * const match = createMatcher(
 *   discriminantCase('idle', 'status', 'idle'),
 *   discriminantCase('success', 'status', 'success')
 * );
 *
 * if (match.is.success(successMachine)) {
 *   console.log(successMachine.context.data); // TypeScript knows data exists
 * }
 * ```
 */
export function createContext<C extends object>(
  context: C
): { readonly context: C } {
  return { context };
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
  return createMachine(context, newTransitions as any) as any;
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
  return createMachine(context, combinedTransitions as any) as M & T;
}

/**
 * Combines two machine factories into a single factory that creates machines with merged context and transitions.
 * This allows you to compose independent state machines that operate on different parts of the same context.
 *
 * The resulting factory takes the parameters of the first factory, while the second factory is called with no arguments.
 * Context properties are merged (second factory's context takes precedence on conflicts).
 * Transition names must not conflict between the two machines.
 *
 * @template F1 - The first factory function type.
 * @template F2 - The second factory function type.
 * @param factory1 - The first machine factory (provides parameters and primary context).
 * @param factory2 - The second machine factory (provides additional context and transitions).
 * @returns A new factory function that creates combined machines.
 *
 * @example
 * ```typescript
 * // Define two independent machines
 * const createCounter = (initial: number) =>
 *   createMachine({ count: initial }, {
 *     increment: function() { return createMachine({ count: this.count + 1 }, this); },
 *     decrement: function() { return createMachine({ count: this.count - 1 }, this); }
 *   });
 *
 * const createLogger = () =>
 *   createMachine({ logs: [] as string[] }, {
 *     log: function(message: string) {
 *       return createMachine({ logs: [...this.logs, message] }, this);
 *     },
 *     clear: function() {
 *       return createMachine({ logs: [] }, this);
 *     }
 *   });
 *
 * // Combine them
 * const createCounterWithLogging = combineFactories(createCounter, createLogger);
 *
 * // Use the combined factory
 * const machine = createCounterWithLogging(5); // { count: 5, logs: [] }
 * const incremented = machine.increment(); // { count: 6, logs: [] }
 * const logged = incremented.log("Count incremented"); // { count: 6, logs: ["Count incremented"] }
 * ```
 */
export function combineFactories<
  F1 extends (...args: any[]) => Machine<any>,
  F2 extends () => Machine<any>
>(
  factory1: F1,
  factory2: F2
): (
  ...args: Parameters<F1>
) => Machine<Context<ReturnType<F1>> & Context<ReturnType<F2>>> &
    Omit<ReturnType<F1>, 'context'> &
    Omit<ReturnType<F2>, 'context'> {
  return (...args: Parameters<F1>) => {
    // Create instances from both factories
    const machine1 = factory1(...args);
    const machine2 = factory2();

    // Merge contexts (machine2 takes precedence on conflicts)
    const combinedContext = { ...machine1.context, ...machine2.context };

    // Extract transitions from both machines
    const { context: _, ...transitions1 } = machine1;
    const { context: __, ...transitions2 } = machine2;

    // Combine transitions (TypeScript will catch conflicts at compile time)
    const combinedTransitions = { ...transitions1, ...transitions2 };

    // Create the combined machine
    return createMachine(combinedContext, combinedTransitions as any) as any;
  };
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
    return createMachine(newContext, transitions as any) as M;
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
 * This narrows the type of the context based on the discriminant, properly handling
 * discriminated unions.
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
 * type Context = { status: 'idle' } | { status: 'loading' } | { status: 'success'; data: string };
 * const machine = createMachine<Context>({ status: 'success', data: 'test' }, {});
 *
 * if (hasState(machine, 'status', 'success')) {
 *   // machine.context is narrowed to { status: 'success'; data: string }
 *   console.log(machine.context.data); // ✓ TypeScript knows about 'data'
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
): machine is M & { context: Extract<Context<M>, { [P in K]: V }> } {
  return machine.context[key] === value;
}


// =============================================================================
// SECTION: RUNTIME & EVENT DISPATCHER
// =============================================================================

/**
 * Runs an asynchronous state machine with a managed lifecycle and event dispatch capability.
 * This is the "interpreter" for async machines, handling state updates and side effects.
 * Provides automatic AbortController management to prevent async race conditions.
 *
 * @template M - The initial machine type.
 * @param initial - The initial machine state.
 * @param onChange - Optional callback invoked with the new machine state after every transition.
 * @returns An object with a `state` getter for the current context, an async `dispatch` function, and a `stop` method.
 */
export function runMachine<M extends AsyncMachine<any>>(
  initial: M,
  onChange?: (m: M) => void
) {
  let current = initial;
  // Keep track of the controller for the currently-running async transition.
  let activeController: AbortController | null = null;

  async function dispatch<E extends Event<typeof current>>(event: E): Promise<M> {
    // 1. If an async transition is already in progress, cancel it.
    if (activeController) {
      activeController.abort();
      activeController = null;
    }

    const fn = (current as any)[event.type];
    if (typeof fn !== 'function') {
      throw new Error(`[Machine] Unknown event type '${String(event.type)}' on current state.`);
    }

    // 2. Create a new AbortController for this new transition.
    const controller = new AbortController();
    activeController = controller;

    try {
      // 3. Pass the signal to the transition function.
      const nextStatePromise = fn.apply(current.context, [...event.args, { signal: controller.signal }]);

      const nextState = await nextStatePromise;

      // 4. If this promise resolved but has since been aborted, do not update state.
      // This prevents the race condition.
      if (controller.signal.aborted) {
        // Return the *current* state, as if the transition never completed.
        return current;
      }

      current = nextState;
      onChange?.(current);
      return current;

    } finally {
      // 5. Clean up the controller once the transition is complete (resolved or rejected).
      // Only clear it if it's still the active one.
      if (activeController === controller) {
        activeController = null;
      }
    }
  }

  return {
    /** Gets the context of the current state of the machine. */
    get state(): Context<M> {
      return current.context;
    },
    /** Dispatches a type-safe event to the machine, triggering a transition. */
    dispatch,
    /** Stops any pending async operation and cleans up resources. */
    stop: () => {
      if (activeController) {
        activeController.abort();
        activeController = null;
      }
    },
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
  return createMachine(update(context), transitions as any) as Machine<C>;
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

// =============================================================================
// SECTION: TYPE-LEVEL METADATA PRIMITIVES
// =============================================================================

export {
  transitionTo,
  describe,
  guarded,
  guard,
  guardAsync,
  whenGuard,
  whenGuardAsync,
  invoke,
  action,
  metadata,
  META_KEY,
  type TransitionMeta,
  type GuardMeta,
  type InvokeMeta,
  type ActionMeta,
  type ClassConstructor,
  type WithMeta,
  type GuardOptions,
  type GuardFallback,
  type GuardedTransition
} from './primitives';

// =============================================================================
// SECTION: STATECHART EXTRACTION (Build-time only)
// =============================================================================

// Note: Extraction tools are available as dev dependencies for build-time use
// They are not included in the runtime bundle for size optimization
// Use: npx tsx scripts/extract-statechart.ts

export type {
  MachineConfig,
  ExtractionConfig,
  ParallelRegionConfig,
  ChildStatesConfig
} from './extract';

// Note: Extraction functions (extractMachine, extractMachines, generateChart) are NOT exported
// to keep them out of the runtime bundle. Use the CLI tool or import directly from the source
// file for build-time statechart generation.

export * from './multi'

export * from './higher-order'

// =============================================================================
// SECTION: MIDDLEWARE & INTERCEPTION
// =============================================================================

export * from './middleware/index';

export * from './mixins';

// =============================================================================
// SECTION: UTILITIES & HELPERS
// =============================================================================

export {
  isState,
  createEvent,
  createTransition,
  mergeContext,
  pipeTransitions,
  logState,
  call,
  bindTransitions,
  BoundMachine
} from './utils';

// =============================================================================
// SECTION: FUNCTIONAL COMBINATORS
// =============================================================================

export {
  createTransitionFactory,
  createTransitionExtender,
  createFunctionalMachine,
  state
} from './functional-combinators';

// =============================================================================
// SECTION: PATTERN MATCHING
// =============================================================================

export {
  createMatcher,
  classCase,
  discriminantCase,
  customCase,
  forContext,
  type MatcherCase,
  type CasesToMapping,
  type MatcherUnion,
  type CaseNames,
  type CaseHandler,
  type ExhaustivenessMarker,
  type IsExhaustive,
  type WhenBuilder,
  type Matcher
} from './matcher';

// =============================================================================
// SECTION: ACTOR MODEL
// =============================================================================

export {
  Actor,
  createActor,
  spawn,
  fromPromise,
  fromObservable,
  type ActorRef,
  type InspectionEvent
} from './actor';