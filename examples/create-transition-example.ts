/**
 * Example demonstrating the modern functional state machine pattern.
 * This shows how to create type-safe machines using pure context transformers
 * with the `state()` function, which automatically chooses the best pattern.
 */

import { state } from '../src/index.js';

// Create a counter machine factory using the functional pattern
const createCounter = state({ count: 0 });

// Define the machine with pure context transformers
const counter = createCounter({
  increment: (ctx) => ({ count: ctx.count + 1 }),

  decrement: (ctx) => ({ count: ctx.count - 1 }),

  add: (ctx, amount: number) => ({ count: ctx.count + amount }),

  reset: (_ctx) => ({ count: 0 })
});

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

// Demonstrate the functional pattern benefits:
// - Pure functions for state transformations
// - Type-safe transitions with automatic inference
// - Immutable updates with full type safety