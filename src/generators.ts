/**
 * @file Generator-based state machine composition utilities.
 * @description
 * This module provides a generator-based approach to composing state machine transitions.
 * Instead of chaining method calls or using composition functions, you can write
 * imperative-style code using generators that feels like sequential, synchronous code
 * while maintaining the immutability and type safety of the state machine model.
 *
 * This pattern is particularly useful for:
 * - Multi-step workflows where each step depends on the previous
 * - Complex transition logic that would be unwieldy with chaining
 * - When you want imperative control flow (if/else, loops) with immutable state
 * - Testing scenarios where you want to control the flow step-by-step
 *
 * @example
 * ```typescript
 * const result = run(function* (machine) {
 *   // Each yield passes control back and receives the next state
 *   let m = yield* step(machine.increment());
 *   m = yield* step(m.add(5));
 *   if (m.context.count > 10) {
 *     m = yield* step(m.reset());
 *   }
 *   return m.context.count;
 * }, initialMachine);
 * ```
 */



/**
 * Runs a generator-based state machine flow to completion.
 *
 * This function executes a generator that yields machine states and returns a final value.
 * Each yield passes the current machine state back to the generator, allowing you to
 * write imperative-style code while maintaining immutability.
 *
 * **How it works:**
 * 1. The generator function receives the initial machine
 * 2. Each `yield` expression produces a new machine state
 * 3. That state is sent back into the generator via `next()`
 * 4. The generator can use the received state for the next operation
 * 5. When the generator returns, that value is returned from `run()`
 *
 * **Key insight:** The generator doesn't mutate state—it yields new immutable states
 * at each step, creating a clear audit trail of state transitions.
 *
 * @template C - The context object type for the machine.
 * @template T - The return type of the generator (can be any type).
 *
 * @param flow - A generator function that receives a machine and yields machines,
 *               eventually returning a value of type T.
 * @param initial - The initial machine state to start the flow.
 *
 * @returns The final value returned by the generator.
 *
 * @example Basic usage with counter
 * ```typescript
 * const counter = createMachine({ count: 0 }, {
 *   increment: function() {
 *     return createMachine({ count: this.count + 1 }, this);
 *   },
 *   add: function(n: number) {
 *     return createMachine({ count: this.count + n }, this);
 *   }
 * });
 *
 * const finalCount = run(function* (m) {
 *   m = yield* step(m.increment());  // count: 1
 *   m = yield* step(m.add(5));       // count: 6
 *   m = yield* step(m.increment());  // count: 7
 *   return m.context.count;
 * }, counter);
 *
 * console.log(finalCount); // 7
 * ```
 *
 * @example Conditional logic
 * ```typescript
 * const result = run(function* (m) {
 *   m = yield* step(m.increment());
 *
 *   if (m.context.count > 5) {
 *     m = yield* step(m.reset());
 *   } else {
 *     m = yield* step(m.add(10));
 *   }
 *
 *   return m;
 * }, counter);
 * ```
 *
 * @example Loops and accumulation
 * ```typescript
 * const sum = run(function* (m) {
 *   let total = 0;
 *
 *   for (let i = 0; i < 5; i++) {
 *     m = yield* step(m.increment());
 *     total += m.context.count;
 *   }
 *
 *   return total;
 * }, counter);
 * ```
 *
 * @example Error handling
 * ```typescript
 * const result = run(function* (m) {
 *   try {
 *     m = yield* step(m.riskyOperation());
 *     m = yield* step(m.processResult());
 *   } catch (error) {
 *     m = yield* step(m.handleError(error));
 *   }
 *   return m;
 * }, machine);
 * ```
 */
export function run<C extends any = any, M extends { context: C } & Record<string, any> = { context: C }, T = any>(
  flow: (m: M) => Generator<M, T, M>,
  initial: M
): T {
  // Create the generator by calling the flow function with the initial machine
  const generator = flow(initial);

  // Track the current machine state as we iterate
  let current = initial;

  // Iterate the generator until completion
  while (true) {
    // Send the current machine state into the generator and get the next yielded value
    // The generator receives `current` as the result of its last yield expression
    const { value, done } = generator.next(current);

    // If the generator has returned (done), we have our final value
    if (done) {
      return value;
    }

    // Otherwise, the yielded value becomes our new current state
    // This state will be sent back into the generator on the next iteration
    current = value;
  }
}

/**
 * A helper function to yield a machine state and receive the next state back.
 *
 * This function creates a mini-generator that yields the provided machine and
 * returns whatever value the outer runner sends back. It's designed to be used
 * with `yield*` (yield delegation) inside your main generator.
 *
 * **Why use this helper?**
 * - Makes the intent clear: "step to this state"
 * - Provides a consistent API for state transitions
 * - Enables type inference for the received state
 * - Works seamlessly with the `run()` function
 *
 * **What `yield*` does:**
 * `yield*` delegates to another generator. When you write `yield* step(m)`,
 * control passes to the `step` generator, which yields `m`, then returns the
 * value sent back by the runner.
 *
 * @template C - The context object type for the machine.
 *
 * @param m - The machine state to yield.
 *
 * @returns A generator that yields the machine and returns the received state.
 *
 * @example Basic stepping
 * ```typescript
 * run(function* (machine) {
 *   // Yield this state and receive the next one
 *   const next = yield* step(machine.increment());
 *   console.log(next.context.count);
 *   return next;
 * }, counter);
 * ```
 *
 * @example Without step (more verbose)
 * ```typescript
 * run(function* (machine) {
 *   // This is what step() does internally
 *   const next = yield machine.increment();
 *   return next;
 * }, counter);
 * ```
 *
 * @example Chaining with step
 * ```typescript
 * run(function* (m) {
 *   m = yield* step(m.action1());
 *   m = yield* step(m.action2());
 *   m = yield* step(m.action3());
 *   return m;
 * }, machine);
 * ```
 */
export function step<C extends any = any, M extends { context: C } & Record<string, any> = { context: C }>(
  m: M
): Generator<M, M, M> {
  // Create an immediately-invoked generator that:
  // 1. Yields the provided machine
  // 2. Receives a value back (the next state)
  // 3. Returns that received value
  return (function* () {
    const received = yield m;
    return received;
  })();
}

/**
 * Alternative to `step` that doesn't require `yield*`.
 * This is semantically identical but uses direct yielding.
 *
 * Use this if you prefer the simpler syntax without delegation.
 *
 * @template C - The context object type.
 * @param m - The machine to yield.
 * @returns The same machine (passed through).
 *
 * @example
 * ```typescript
 * run(function* (m) {
 *   m = yield m.increment(); // No yield* needed
 *   m = yield m.add(5);
 *   return m;
 * }, counter);
 * ```
 */
export function yieldMachine<C extends any = any, M extends { context: C } & Record<string, any> = { context: C }>(m: M): M {
  return m;
}

/**
 * Runs multiple generator flows in sequence, passing the result of each to the next.
 *
 * This is useful for composing multiple generator-based workflows into a pipeline.
 *
 * @template C - The context object type.
 * @param initial - The initial machine state.
 * @param flows - An array of generator functions to run in sequence.
 * @returns The final machine state after all flows complete.
 *
 * @example
 * ```typescript
 * const flow1 = function* (m: Machine<{ count: number }>) {
 *   m = yield* step(m.increment());
 *   return m;
 * };
 *
 * const flow2 = function* (m: Machine<{ count: number }>) {
 *   m = yield* step(m.add(5));
 *   return m;
 * };
 *
 * const result = runSequence(counter, [flow1, flow2]);
 * console.log(result.context.count); // 6
 * ```
 */
export function runSequence<C extends any = any, M extends { context: C } & Record<string, any> = { context: C }>(
  initial: M,
  flows: Array<(m: M) => Generator<M, M, M>>
): M {
  return flows.reduce((machine, flow) => {
    return run(flow, machine);
  }, initial);
}

/**
 * Creates a reusable generator flow that can be composed into other flows.
 *
 * This allows you to define common state machine patterns as reusable building blocks.
 *
 * @template C - The context object type.
 * @param flow - A generator function representing a reusable flow.
 * @returns A function that can be used with `yield*` in other generators.
 *
 * @example
 * ```typescript
 * // Define a reusable flow
 * const incrementThrice = createFlow(function* (m: Machine<{ count: number }>) {
 *   m = yield* step(m.increment());
 *   m = yield* step(m.increment());
 *   m = yield* step(m.increment());
 *   return m;
 * });
 *
 * // Use it in another flow
 * const result = run(function* (m) {
 *   m = yield* incrementThrice(m);
 *   m = yield* step(m.add(10));
 *   return m;
 * }, counter);
 * ```
 */
export function createFlow<C extends any = any, M extends { context: C } & Record<string, any> = { context: C }>(
  flow: (m: M) => Generator<M, M, M>
): (m: M) => Generator<M, M, M> {
  return flow;
}

/**
 * Runs a generator flow with debugging output at each step.
 *
 * This is useful for understanding the state transitions in your flow.
 *
 * @template C - The context object type.
 * @template T - The return type.
 * @param flow - The generator function to run.
 * @param initial - The initial machine state.
 * @param logger - Optional custom logger function.
 * @returns The final value from the generator.
 *
 * @example
 * ```typescript
 * const result = runWithDebug(function* (m) {
 *   m = yield* step(m.increment());
 *   m = yield* step(m.add(5));
 *   return m.context.count;
 * }, counter);
 *
 * // Output:
 * // Step 0: { count: 0 }
 * // Step 1: { count: 1 }
 * // Step 2: { count: 6 }
 * // Final: 6
 * ```
 */
export function runWithDebug<C extends any = any, M extends { context: C } & Record<string, any> = { context: C }, T = any>(
  flow: (m: M) => Generator<M, T, M>,
  initial: M,
  logger: (step: number, machine: M) => void = (step, m) => {
    console.log(`Step ${step}:`, m.context);
  }
): T {
  const generator = flow(initial);
  let current = initial;
  let stepCount = 0;

  logger(stepCount, current);

  while (true) {
    const { value, done } = generator.next(current);

    if (done) {
      console.log('Final:', value);
      return value;
    }

    current = value;
    stepCount++;
    logger(stepCount, current);
  }
}

// =============================================================================
// ASYNC GENERATOR SUPPORT
// =============================================================================

/**
 * Async version of `run` for async state machines.
 *
 * This allows you to use async/await inside your generator flows while maintaining
 * the same compositional benefits.
 *
 * @template C - The context object type.
 * @template T - The return type.
 * @param flow - An async generator function.
 * @param initial - The initial machine state.
 * @returns A promise that resolves to the final value.
 *
 * @example
 * ```typescript
 * const result = await runAsync(async function* (m) {
 *   m = yield* stepAsync(await m.fetchData());
 *   m = yield* stepAsync(await m.processData());
 *   return m.context;
 * }, asyncMachine);
 * ```
 */
export async function runAsync<C extends any = any, M extends { context: C } & Record<string, any> = { context: C }, T = any>(
  flow: (m: M) => AsyncGenerator<M, T, M>,
  initial: M
): Promise<T> {
  const generator = flow(initial);
  let current = initial;

  while (true) {
    const { value, done } = await generator.next(current);

    if (done) {
      return value;
    }

    current = value;
  }
}

/**
 * Async version of `step` for async generators.
 *
 * @template C - The context object type.
 * @param m - The machine to yield.
 * @returns An async generator.
 *
 * @example
 * ```typescript
 * await runAsync(async function* (m) {
 *   m = yield* stepAsync(await m.asyncOperation());
 *   return m;
 * }, machine);
 * ```
 */
export async function* stepAsync<C extends any = any, M extends { context: C } & Record<string, any> = { context: C }>(
  m: M
): AsyncGenerator<M, M, M> {
  const received = yield m;
  return received;
}
