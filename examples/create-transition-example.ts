/**
 * Example demonstrating the modern functional state machine pattern.
 * This shows how to create type-safe immutable transitions with the concise,
 * curried `state()` form.
 */

import { state } from '../src/index.js';

const createCounter = state({ count: 0 });

const counter = createCounter({
  increment: (context) => ({ count: context.count + 1 }),
  decrement: (context) => ({ count: context.count - 1 }),
  add: (context, amount: number) => ({ count: context.count + amount }),
  reset: () => ({ count: 0 }),
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
// - Pure context transformations
// - Type-safe transitions with automatic inference
// - Immutable updates with full type safety
