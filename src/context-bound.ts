import type { Machine, TransitionArgs, TransitionNames, TransitionReturn } from './index';
import { attachTransitions } from './internal-transitions';

/**
 * Creates a machine where transformers receive context as `this` and return new contexts.
 * The wrapper automatically converts these context-returning functions into proper
 * machine-returning transitions.
 *
 * **Important Limitations:**
 * - Transformers receive ONLY context as `this` (a lightweight `{ context }` object)
 * - Cannot call other transitions via `this.otherTransition()`
 * - Provides cleaner syntax for simple context transformations
 *
 * @template C - The context type
 * @template T - The transformers record mapping transition names to context transformers
 *
 * @param initialContext - The initial context object
 * @param transformers - Record of transition names to pure context transformers.
 *                       Each transformer receives `this === context` and returns a new context.
 *                       The public API returns machines, not contexts.
 * @returns A context-bound machine where public transitions return machines,
 *          but internal transformers work with contexts directly.
 *
 * @example
 * ```typescript
 * const machine = createContextBoundMachine({ count: 0 }, {
 *   increment() {
 *     // Inside: `this` is the context object, return new context
 *     return { count: this.context.count + 1 };
 *   },
 *   add(amount: number) {
 *     return { count: this.context.count + amount };
 *   }
 * });
 *
 * // Outside: returns a machine (not just context)
 * const result = machine.increment();
 * console.log(result.context.count); // 1
 *
 * // ❌ CANNOT do this inside transformers:
 * // incrementTwice() { return this.increment().increment(); }
 * // (this.increment doesn't exist - `this` is just the context)
 * ```
 */
export function createContextBoundMachine<
  C extends object,
  T extends Record<string, (this: { readonly context: C }, ...args: any[]) => C>
>(
  initialContext: C,
  transformers: T
): ContextBoundMachine<C, T> {
  // Create a closure to hold the transformers for reuse
  const savedTransformers = transformers;

  // Create transition functions that bind to context
  const boundTransitions = Object.fromEntries(
    Object.entries(transformers).map(([key, transformer]) => [
      key,
      function (this: Machine<C>, ...args: any[]) {
        // Bind transformer to a context-only object ({ context })
        const contextOnly = { context: this.context } as Pick<Machine<C>, 'context'>;
        const newContext = transformer.apply(contextOnly as any, args);
        // Return new machine with same transformers
        return createContextBoundMachine(newContext, savedTransformers);
      },
    ])
  );

  Object.values(boundTransitions).forEach((fn) => {
    if (typeof fn === 'function') {
      Object.defineProperty(fn, '__contextBound', {
        value: true,
        enumerable: false,
      });
    }
  });

  return attachTransitions(
    Object.assign({ context: initialContext }, boundTransitions),
    boundTransitions as any
  ) as any;
}

/**
 * Machine type where transitions receive context as `this`.
 *
 * @template C - The context type
 * @template T - The transformers record type
 */
export type ContextBoundMachine<
  C extends object,
  T extends Record<string, any>
> = Machine<
  C,
  {
    [K in keyof T]: (
      ...args: Parameters<T[K]>
    ) => ContextBoundMachine<C, T>;
  }
>;


/**
 * Helper to call a transition with context binding.
 * Equivalent to `fn.call({ context: machine.context }, ...args)`.
 *
 * @template M - The machine type
 * @template K - The transition name (keyof the transitions)
 *
 * @param machine - The machine instance
 * @param transitionName - The name of the transition to call
 * @param args - Arguments to pass to the transition
 * @returns The result of calling the transition
 *
 * @example
 * ```typescript
 * const machine = createMachine({ count: 0 }, {
 *   increment(this: {count: number}) {
 *     return { count: this.context.count + 1 };
 *   }
 * });
 *
 * // Instead of: machine.increment.call(machine.context)
 * const result = callWithContext(machine, 'increment');
 * ```
 */
export function callWithContext<M extends Machine<any>, K extends TransitionNames<M>>(
  machine: M,
  transitionName: K,
  ...args: TransitionArgs<M, K>
): TransitionReturn<M, K>;
/**
 * Runtime implementation signature for {@link callWithContext}.
 *
 * @typeParam M - Machine containing the selected transition.
 * @throws {TypeError} If `transitionName` is not a function on `machine`.
 */
export function callWithContext<M extends Machine<any>>(
  machine: M,
  transitionName: TransitionNames<M>,
  ...args: any[]
): unknown {
  const fn = (machine as any)[transitionName];
  if (typeof fn !== 'function') {
    throw new TypeError(`Transition '${String(transitionName)}' is not available on this machine.`);
  }
  const contextOnly = { context: machine.context } as Pick<Machine<any>, 'context'>;
  return fn.apply(contextOnly as any, args);
}

/**
 * Type guard to check if a machine is context-bound.
 *
 * @param machine - The machine to check
 * @returns True if the machine was created with createContextBoundMachine
 *
 * @example
 * ```typescript
 * const cbMachine = createContextBoundMachine({ count: 0 }, {...});
 * const normalMachine = createMachine({ count: 0 }, {...});
 *
 * isContextBound(cbMachine);    // true
 * isContextBound(normalMachine); // false
 * ```
 */
export function isContextBound(machine: Machine<any>): boolean {
  const firstTransition = Object.values(machine).find(
    (v) => typeof v === 'function'
  );
  if (!firstTransition) return false;

  // Context-bound machines have a marker property
  return (firstTransition as any).__contextBound === true;
}
