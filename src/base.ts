/**
 * @file Base class for machine implementations
 * @description This file contains the MachineBase class, which is the foundation
 * for creating state machines using an Object-Oriented style. This is separated
 * to avoid circular dependencies with higher-order abstractions.
 */

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
