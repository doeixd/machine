/**
 * Example demonstrating the createTransition utility function.
 * This shows how to create transitions from pure context transformers.
 */

import { createMachine } from '../dist/esm/development/index.js';
import { createTransition } from '../dist/esm/development/utils.js';

// Define a simple counter machine using createTransition
const counterTransitions: any = {
  increment: createTransition(
    () => counterTransitions,
    (ctx: { count: number }) => ({ count: ctx.count + 1 })
  ),

  decrement: createTransition(
    () => counterTransitions,
    (ctx: { count: number }) => ({ count: ctx.count - 1 })
  ),

  add: createTransition(
    () => counterTransitions,
    (ctx: { count: number }, amount: number) => ({ count: ctx.count + amount })
  ),

  reset: createTransition(
    () => counterTransitions,
    (_ctx: { count: number }) => ({ count: 0 })
  ),
};

// Create the machine
const counter = createMachine({ count: 0 }, counterTransitions);

// Demonstrate usage
console.log('Initial state:', counter.context);

const incremented = counter.increment();
console.log('After increment:', incremented.context);

const added = incremented.add(5);
console.log('After add(5):', added.context);

const decremented = added.decrement();
console.log('After decrement:', decremented.context);

const reset = decremented.reset();
console.log('After reset:', reset.context);

// All transitions are preserved across state changes
console.log('Has increment method:', typeof reset.increment === 'function');
console.log('Has add method:', typeof reset.add === 'function');