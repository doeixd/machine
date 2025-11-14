/**
 * @file Examples demonstrating generator-based state machine composition.
 * @description
 * This file shows various patterns for using generators to compose state machine
 * transitions in an imperative style while maintaining immutability.
 */

import { createMachine, run, step, runSequence, createFlow, runWithDebug, Machine } from '../src/index';

// =============================================================================
// EXAMPLE 1: Basic Counter with Sequential Operations
// =============================================================================

const counter = createMachine(
  { count: 0 },
  {
    increment: function() {
      return createMachine({ count: this.count + 1 }, this);
    },
    add: function(n: number) {
      return createMachine({ count: this.count + n }, this);
    },
    reset: function() {
      return createMachine({ count: 0 }, this);
    }
  }
);

// Simple sequential operations
const example1 = run(function* (m) {
  console.log('Starting with:', m.context.count); // 0

  m = yield* step(m.increment());
  console.log('After increment:', m.context.count); // 1

  m = yield* step(m.add(5));
  console.log('After add(5):', m.context.count); // 6

  m = yield* step(m.increment());
  console.log('After increment:', m.context.count); // 7

  return m.context.count;
}, counter);

console.log('Example 1 result:', example1); // 7

// =============================================================================
// EXAMPLE 2: Conditional Logic
// =============================================================================

const example2 = run(function* (m) {
  m = yield* step(m.add(12));

  // Use normal if/else
  if (m.context.count > 10) {
    console.log('Count is high, resetting...');
    m = yield* step(m.reset());
  } else {
    m = yield* step(m.add(10));
  }

  return m.context.count;
}, counter);

console.log('Example 2 result:', example2); // 0 (was reset)

// =============================================================================
// EXAMPLE 3: Loops and Accumulation
// =============================================================================

const example3 = run(function* (m) {
  let total = 0;

  // Use a normal for loop
  for (let i = 0; i < 5; i++) {
    m = yield* step(m.increment());
    total += m.context.count;
    console.log(`Iteration ${i + 1}: count = ${m.context.count}, total = ${total}`);
  }

  return { finalCount: m.context.count, sum: total };
}, counter);

console.log('Example 3 result:', example3); // { finalCount: 5, sum: 15 }

// =============================================================================
// EXAMPLE 4: Reusable Flows
// =============================================================================

// Define a reusable flow that increments 3 times
const incrementThrice = createFlow(function* (m: Machine<{ count: number }>) {
  m = yield* step(m.increment());
  m = yield* step(m.increment());
  m = yield* step(m.increment());
  return m;
});

// Use the reusable flow
const example4 = run(function* (m) {
  console.log('Before incrementThrice:', m.context.count); // 0

  m = yield* incrementThrice(m);
  console.log('After incrementThrice:', m.context.count); // 3

  m = yield* step(m.add(10));
  console.log('After add(10):', m.context.count); // 13

  // Use it again
  m = yield* incrementThrice(m);
  console.log('After second incrementThrice:', m.context.count); // 16

  return m;
}, counter);

console.log('Example 4 final count:', example4.context.count); // 16

// =============================================================================
// EXAMPLE 5: Sequential Flow Composition
// =============================================================================

const flow1 = function* (m: Machine<{ count: number }>) {
  console.log('Flow 1: incrementing twice');
  m = yield* step(m.increment());
  m = yield* step(m.increment());
  return m;
};

const flow2 = function* (m: Machine<{ count: number }>) {
  console.log('Flow 2: adding 5');
  m = yield* step(m.add(5));
  return m;
};

const flow3 = function* (m: Machine<{ count: number }>) {
  console.log('Flow 3: incrementing once more');
  m = yield* step(m.increment());
  return m;
};

const example5 = runSequence(counter, [flow1, flow2, flow3]);
console.log('Example 5 result:', example5.context.count); // 8

// =============================================================================
// EXAMPLE 6: Error Handling
// =============================================================================

const riskyCounter = createMachine(
  { count: 0, lastError: null as string | null },
  {
    increment: function() {
      return createMachine({ ...this, count: this.count + 1 }, this);
    },
    riskyOperation: function() {
      if (this.count > 5) {
        throw new Error('Count too high!');
      }
      return createMachine({ ...this, count: this.count * 2 }, this);
    },
    handleError: function(error: Error) {
      return createMachine({ ...this, lastError: error.message }, this);
    }
  }
);

const example6 = run(function* (m) {
  try {
    m = yield* step(m.increment());
    m = yield* step(m.increment());
    m = yield* step(m.riskyOperation()); // count becomes 4

    m = yield* step(m.increment());
    m = yield* step(m.increment());
    m = yield* step(m.increment()); // count becomes 7

    m = yield* step(m.riskyOperation()); // This will throw!
  } catch (error) {
    console.log('Caught error:', (error as Error).message);
    m = yield* step(m.handleError(error as Error));
  }

  return m;
}, riskyCounter);

console.log('Example 6 result:', example6.context);
// { count: 7, lastError: 'Count too high!' }

// =============================================================================
// EXAMPLE 7: Debugging with runWithDebug
// =============================================================================

console.log('\nExample 7: Debug output');
const example7 = runWithDebug(
  function* (m) {
    m = yield* step(m.increment());
    m = yield* step(m.add(5));
    m = yield* step(m.increment());
    return m.context.count;
  },
  counter
);
// Output shows each step's state

// =============================================================================
// EXAMPLE 8: Complex Workflow - Multi-step Form
// =============================================================================

type FormData = {
  name: string;
  email: string;
  age: number;
};

type FormState =
  | { step: 'name'; data: Partial<FormData> }
  | { step: 'email'; data: Partial<FormData> }
  | { step: 'age'; data: Partial<FormData> }
  | { step: 'complete'; data: FormData };

const formMachine = createMachine(
  { step: 'name' as const, data: {} as Partial<FormData> },
  {
    setName: function(name: string) {
      return createMachine(
        { step: 'email' as const, data: { ...this.data, name } },
        this
      );
    },
    setEmail: function(email: string) {
      return createMachine(
        { step: 'age' as const, data: { ...this.data, email } },
        this
      );
    },
    setAge: function(age: number) {
      const data = { ...this.data, age } as FormData;
      return createMachine({ step: 'complete' as const, data }, this);
    },
    back: function() {
      if (this.step === 'email') {
        return createMachine({ step: 'name' as const, data: this.data }, this);
      } else if (this.step === 'age') {
        return createMachine({ step: 'email' as const, data: this.data }, this);
      }
      return this as any;
    }
  }
);

const example8 = run(function* (m) {
  console.log('\n--- Multi-step Form Example ---');

  console.log('Step 1: Enter name');
  m = yield* step(m.setName('Alice'));

  console.log('Step 2: Enter email');
  m = yield* step(m.setEmail('alice@example.com'));

  // Oops, want to change email - go back
  console.log('Going back to edit email...');
  m = yield* step(m.back());

  console.log('Step 2 (corrected): Enter email');
  m = yield* step(m.setEmail('alice.smith@example.com'));

  console.log('Step 3: Enter age');
  m = yield* step(m.setAge(30));

  console.log('Form complete!', m.context.data);

  return m;
}, formMachine);

console.log('Example 8 final state:', example8.context);

// =============================================================================
// EXAMPLE 9: While Loop with Condition
// =============================================================================

const example9 = run(function* (m) {
  console.log('\n--- While Loop Example ---');

  // Increment until we reach 10
  while (m.context.count < 10) {
    console.log('Current count:', m.context.count);
    m = yield* step(m.increment());
  }

  console.log('Reached target:', m.context.count);
  return m.context.count;
}, counter);

console.log('Example 9 result:', example9); // 10

// =============================================================================
// EXAMPLE 10: Nested Generators
// =============================================================================

const doubleIncrement = createFlow(function* (m: Machine<{ count: number }>) {
  m = yield* step(m.increment());
  m = yield* step(m.increment());
  return m;
});

const quadrupleIncrement = createFlow(function* (m: Machine<{ count: number }>) {
  // Call another flow
  m = yield* doubleIncrement(m);
  m = yield* doubleIncrement(m);
  return m;
});

const example10 = run(function* (m) {
  console.log('\n--- Nested Generators Example ---');
  console.log('Start:', m.context.count); // 0

  m = yield* quadrupleIncrement(m);
  console.log('After quadrupleIncrement:', m.context.count); // 4

  m = yield* step(m.add(6));
  console.log('After add(6):', m.context.count); // 10

  return m.context.count;
}, counter);

console.log('Example 10 result:', example10); // 10

// =============================================================================
// Summary
// =============================================================================

console.log('\n=== Generator Composition Examples Complete ===');
console.log('Generator-based composition provides:');
console.log('- Imperative control flow (if/else, loops, try/catch)');
console.log('- Maintained immutability (each step is a new state)');
console.log('- Full type safety');
console.log('- Reusable flow patterns');
console.log('- Easy debugging and testing');
