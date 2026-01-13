import { createMachine, Machine, BaseMachine, extendTransitions } from './index';

/**
 * Creates a factory for building type-safe transitions for a specific machine.
 * This higher-order function captures the machine's `transitions` object in a closure,
 * enabling a clean, functional pattern for defining state changes without directly
 * manipulating the machine's context.
 *
 * This pattern promotes:
 * - Pure functions for state transformations
 * - Separation of transition logic from machine construction
 * - Reusable transition factories across similar machines
 * - Type safety through generic constraints
 *
 * @template C The context type of the machine
 * @template C The context type of the machine
 * @returns A `createTransition` function that can create transitions for machines with context type C
 *
 * @example
 * ```typescript
 * // Define your machine's transitions object
 * const counterTransitions = {
 *   increment: function(amount: number) {
 *     return createMachine({ count: this.context.count + amount }, counterTransitions);
 *   }
 * };
 *
 * // Create a transition factory
 * const createCounterTransition = createTransitionFactory<{ count: number }>();
 *
 * // Use the factory to create pure, type-safe transitions
 * const incrementBy = createCounterTransition(
 *   (ctx, amount: number) => ({ count: ctx.count + amount })
 * );
 *
 * const counter = createMachine({ count: 0 }, counterTransitions);
 * const newCounter = counter.increment(5); // Direct call
 * // OR
 * const incremented = incrementBy.call(counter, 5); // Using factory
 * ```
 */
export function createTransitionFactory<C extends object>() {
  /**
   * Takes a pure context transformer function and returns a full, type-safe
   * machine transition method that can be attached to a machine.
   *
   * The transformer function receives the current context as its first argument,
   * followed by any additional arguments passed to the transition.
   *
   * @template TArgs The argument types for the transition (excluding context)
   * @param transformer A pure function: `(context, ...args) => nextContext`
   * @returns A machine transition method that can be called on a machine instance
   *
   * @example
   * ```typescript
   * const createTodoTransition = createTransitionFactory<TodoContext>();
   *
   * const addTodo = createTodoTransition(
   *   (ctx, text: string) => ({
   *     ...ctx,
   *     todos: [...ctx.todos, { id: Date.now(), text, completed: false }]
   *   })
   * );
   *
   * const updateTodo = createTodoTransition(
   *   (ctx, id: number, updates: Partial<Todo>) => ({
   *     ...ctx,
   *     todos: ctx.todos.map(todo =>
   *       todo.id === id ? { ...todo, ...updates } : todo
   *     )
   *   })
   * );
   * ```
   */
  return function createTransition<TArgs extends any[]>(
    transformer: (ctx: C, ...args: TArgs) => C
  ) {
    return function (this: BaseMachine<C>, ...args: TArgs): Machine<C> {
      const nextContext = transformer(this.context, ...args);
      // Use `this` as the transitions object, which includes all current transitions
      return createMachine(nextContext, this);
    };
  };
}

/**
 * Creates a factory for adding new, type-safe transitions to an existing machine instance.
 * This enables a functional, compositional approach to building up a machine's capabilities
 * incrementally, without modifying the original machine.
 *
 * This pattern supports:
 * - Progressive enhancement of machine behavior
 * - Plugin-like extension of existing machines
 * - Immutable composition (original machine unchanged)
 * - Type-safe addition of new transitions
 *
 * @template M The machine type being extended
 * @param machine The machine instance to extend
 * @returns An `addTransition` function pre-configured for this machine
 *
 * @example
 * ```typescript
 * // Start with a basic counter machine
 * const basicCounter = createMachine({ count: 0 }, {
 *   increment: function() {
 *     return createMachine({ count: this.context.count + 1 }, this);
 *   }
 * });
 *
 * // Create an extender for this machine
 * const extendCounter = createTransitionExtender(basicCounter);
 *
 * // Add new transitions functionally
 * const extendedCounter = extendCounter('decrement',
 *   (ctx) => ({ count: ctx.count - 1 })
 * ).addTransition('reset',
 *   (ctx) => ({ count: 0 })
 * ).addTransition('add',
 *   (ctx, amount: number) => ({ count: ctx.count + amount })
 * );
 *
 * // The original machine is unchanged
 * console.log(basicCounter.count); // 0
 *
 * // The extended machine has all transitions
 * const result = extendedCounter.increment().add(10).decrement();
 * console.log(result.count); // 10
 * ```
 */
export function createTransitionExtender<M extends Machine<any>>(machine: M) {
  type C = M['context'];

  /**
   * Adds a new transition to the machine and returns a new extender for chaining.
   * The new transition is created from a pure context transformer function.
   *
   * @template TName The name of the new transition
   * @template TArgs The argument types for the new transition
   * @param name The name of the new transition method
   * @param transformer A pure function that defines how the context should change
   * @returns A new transition extender with the added transition
   *
   * @example
   * ```typescript
   * const userMachine = createMachine({ name: '', email: '' }, {});
   * const extendUser = createTransitionExtender(userMachine);
   *
   * const withValidation = extendUser.addTransition('setName',
   *   (ctx, name: string) => {
   *     if (name.length < 2) throw new Error('Name too short');
   *     return { ...ctx, name };
   *   }
   * ).addTransition('setEmail',
   *   (ctx, email: string) => {
   *     if (!email.includes('@')) throw new Error('Invalid email');
   *     return { ...ctx, email };
   *   }
   * );
   *
   * const user = withValidation.machine.setName('John').setEmail('john@example.com');
   * ```
   */
  return {
    machine,

    addTransition: function<
      TName extends string,
      TArgs extends any[],
    >(
      name: TName,
      transformer: (ctx: C, ...args: TArgs) => C
    ) {
      const transitionFn = function (this: Machine<C>, ...args: TArgs) {
        const nextContext = transformer(this.context, ...args);

        // Use `this` as the transitions object, which includes all current transitions
        return createMachine(nextContext, this);
      };

      // Create the extended machine
      const newMachine = extendTransitions(machine, { [name]: transitionFn } as any);

      // Return a new extender that includes this transition
      return createTransitionExtender(newMachine);
    }
  };
}

/**
 * A mapped type that creates the final transition method signatures based on
 * an object of pure context transformers. It infers argument types and sets
 * the correct return type.
 */
type MachineTransitions<
  T extends Record<string, (ctx: C, ...args: any[]) => C>,
  C extends object
> = {
  [K in keyof T]: T[K] extends (ctx: C, ...args: infer A) => C
    ? (this: Machine<C>, ...args: A) => Machine<C>
    : never;
};

/**
 * Creates a complete, type-safe, functional state machine using a curried, two-step
 * approach that separates the initial data from the transition logic.
 *
 * This is a highly declarative and functional pattern for building single-state machines.
 *
 * @template C The context type of the machine.
 * @param initialContext The starting context (data) for the machine.
 * @returns A new function that takes an object of pure context-transformer
 *   functions and returns a fully-formed machine instance.
 */
export function createFunctionalMachine<C extends object>(initialContext: C) {
  /**
   * This returned function is pre-configured with the `initialContext`.
   *
   * @template T The type of the transformers object.
   * @param transformers An object where each key is a transition name and each value
   *   is a pure function: `(context, ...args) => nextContext`.
   * @returns A fully-formed, immutable, and type-safe machine instance.
   *
   * @example
   * ```typescript
   * const createCounter = createFunctionalMachine({ count: 0 });
   *
   * const counter = createCounter({
   *   increment: (ctx) => ({ count: ctx.count + 1 }),
   *   decrement: (ctx) => ({ count: ctx.count - 1 }),
   *   add: (ctx, amount: number) => ({ count: ctx.count + amount }),
   *   reset: (ctx) => ({ count: 0 })
   * });
   *
   * // Use the machine
   * const updated = counter.increment().add(5).decrement();
   * console.log(updated.context.count); // 5
   * ```
   */
  return function withTransitions<
    T extends Record<string, (ctx: C, ...args: any[]) => C>
  >(
    transformers: T
  ): Machine<C> & MachineTransitions<T, C> {
    // 1. Create a placeholder object for the final transitions.
    const transitions: any = {};

    // 2. Map the pure transformers to full machine transition methods.
    const machineTransitions = Object.fromEntries(
      Object.entries(transformers).map(([key, transformer]) => [
        key,
        function (this: { context: C }, ...args: any[]) {
          // Apply the pure data transformation.
          const nextContext = transformer(this.context, ...args);
          // Return a new machine, passing in the `transitions` object from the closure.
          // At this point, `transitions` will be fully populated.
          return createMachine(nextContext, transitions);
        },
      ])
    );

    // 3. Populate the placeholder with the real transitions.
    Object.assign(transitions, machineTransitions);

    // 4. Create and return the initial machine instance using the provided context.
    return createMachine(initialContext, transitions) as any;
  };
}

/**
 * A smart, type-safe function that creates state machines using either the traditional
 * `createMachine` pattern or the functional `createFunctionalMachine` pattern, automatically
 * detecting which approach to use based on the arguments provided.
 *
 * **Two Usage Patterns:**
 *
 * 1. **Traditional Pattern** (with transitions object):
 *    ```typescript
 *    const machine = state({ count: 0 }, {
 *      increment() { return createMachine({ count: this.context.count + 1 }, this); }
 *    });
 *    ```
 *
 * 2. **Functional Pattern** (curried, with transformers):
 *    ```typescript
 *    const createCounter = state({ count: 0 });
 *    const machine = createCounter({
 *      increment: ctx => ({ count: ctx.count + 1 }),
 *      add: (ctx, n: number) => ({ count: ctx.count + n })
 *    });
 *    ```
 *
 * **How it works:**
 * - When called with 2 arguments: Uses `createMachine` (traditional pattern)
 * - When called with 1 argument: Uses `createFunctionalMachine` (functional pattern)
 *
 * **Edge Cases Handled:**
 * - Empty transitions object: Falls back to functional pattern
 * - Context with function properties: Properly typed as transitions vs transformers
 * - Type inference: Maintains full type safety in both patterns
 *
 * @template C The context type
 * @template T The transitions/transformers type
 * @param context The initial context object
 * @param transitions Optional transitions object (traditional pattern)
 * @returns Either a machine (traditional) or a factory function (functional)
 *
 * @example
 * ```typescript
 * // Traditional pattern
 * const counter1 = state({ count: 0 }, {
 *   increment() { return createMachine({ count: this.context.count + 1 }, this); },
 *   decrement() { return createMachine({ count: this.context.count - 1 }, this); }
 * });
 *
 * // Functional pattern
 * const createCounter = state({ count: 0 });
 * const counter2 = createCounter({
 *   increment: ctx => ({ count: ctx.count + 1 }),
 *   decrement: ctx => ({ count: ctx.count - 1 }),
 *   reset: ctx => ({ count: 0 })
 * });
 * ```
 */
export function state<C extends object>(context: C): ReturnType<typeof createFunctionalMachine<C>>;
export function state<C extends object, T extends Record<string, any>>(
  context: C,
  transitions: T
): Machine<C> & T;
export function state<C extends object, T extends Record<string, any>>(
  context: C,
  transitions?: T
): Machine<C> & T | ReturnType<typeof createFunctionalMachine<C>> {
  // If transitions is provided (2 arguments), use traditional createMachine pattern
  if (transitions !== undefined) {
    return createMachine(context, transitions);
  }

  // If only context is provided (1 argument), use functional createFunctionalMachine pattern
  return createFunctionalMachine(context);
}