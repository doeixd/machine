/**
 * @file Comprehensive middleware demonstration
 * @description Shows all middleware features with real-world examples
 */

import {
  createMachine,
  createAsyncMachine,
  createMiddleware,
  withLogging,
  withAnalytics,
  withValidation,
  withPermissions,
  withErrorReporting,
  withPerformanceMonitoring,
  withRetry,
  compose,
  createCustomMiddleware
} from '../src/index';

// =============================================================================
// EXAMPLE 1: Basic Middleware Usage
// =============================================================================

console.log('=== EXAMPLE 1: Basic createMiddleware ===\n');

// Simple counter machine
const counter = createMachine({ count: 0 }, {
  increment: function() {
    return createMachine({ count: this.count + 1 }, this);
  },
  decrement: function() {
    return createMachine({ count: this.count - 1 }, this);
  },
  add: function(n: number) {
    return createMachine({ count: this.count + n }, this);
  }
});

// Add basic logging middleware
const loggedCounter = createMiddleware(counter, {
  before: ({ transitionName, args }) => {
    console.log(`→ ${transitionName}`, args);
  },
  after: ({ transitionName, nextContext }) => {
    console.log(`✓ ${transitionName}`, nextContext);
  },
  error: ({ transitionName, error }) => {
    console.error(`✗ ${transitionName}:`, error.message);
  }
});

let state = loggedCounter;
state = state.increment.call(state.context);
state = state.add.call(state.context, 5);
state = state.decrement.call(state.context);

// =============================================================================
// EXAMPLE 2: Built-in Middleware Helpers
// =============================================================================

console.log('\n=== EXAMPLE 2: Built-in Helpers ===\n');

// Logging middleware
const withLogs = withLogging(counter);
let state2 = withLogs;
state2 = state2.increment.call(state2.context);
state2 = state2.add.call(state2.context, 10);

// Analytics middleware
const tracked = withAnalytics(counter, (event, props) => {
  console.log('📊 Analytics:', event, props);
});

let state3 = tracked;
state3 = state3.increment.call(state3.context);

// Validation middleware
const validated = withValidation(counter, ({ transitionName, context }) => {
  if (transitionName === 'decrement' && context.count === 0) {
    throw new Error('Cannot decrement below zero');
  }
});

let state4 = createMachine({ count: 1 }, validated);
state4 = state4.decrement.call(state4.context); // OK: count is 1

try {
  state4 = state4.decrement.call(state4.context); // Error: count would be -1
} catch (err) {
  console.log('Validation caught:', (err as Error).message);
}

// Permission middleware
type User = { role: 'admin' | 'user' };
const currentUser: User = { role: 'user' };

const adminMachine = createMachine({ data: 'sensitive' }, {
  read: function() {
    return this;
  },
  delete: function() {
    return createMachine({ data: 'deleted' }, this);
  }
});

const protectedMachine = withPermissions(adminMachine, ({ transitionName }) => {
  if (transitionName === 'delete' && currentUser.role !== 'admin') {
    return false;
  }
  return true;
});

try {
  protectedMachine.delete.call(protectedMachine.context); // Error: unauthorized
} catch (err) {
  console.log('Permission denied:', (err as Error).message);
}

// Error reporting
const monitored = withErrorReporting(counter, (error, context) => {
  console.log('🚨 Error reported to Sentry:', {
    error: error.message,
    ...context
  });
});

// Performance monitoring
const measured = withPerformanceMonitoring(counter, ({ transitionName, duration }) => {
  if (duration > 100) {
    console.log(`⚠️  Slow transition: ${transitionName} took ${duration.toFixed(2)}ms`);
  }
});

// =============================================================================
// EXAMPLE 3: Composable Middleware Stack
// =============================================================================

console.log('\n=== EXAMPLE 3: Composable Middleware Stack ===\n');

const fullyInstrumented = compose(
  counter,
  (m) => withLogging(m, {
    logger: (msg) => console.log(`[LOG] ${msg}`),
    includeContext: true
  }),
  (m) => withValidation(m, ({ transitionName, context }) => {
    if (transitionName === 'add' && context.count + 100 > 1000) {
      throw new Error('Count would exceed limit');
    }
  }),
  (m) => withPerformanceMonitoring(m, ({ transitionName, duration }) => {
    console.log(`[PERF] ${transitionName}: ${duration.toFixed(2)}ms`);
  })
);

let state5 = fullyInstrumented;
state5 = state5.increment.call(state5.context);
state5 = state5.add.call(state5.context, 5);

// =============================================================================
// EXAMPLE 4: Retry Middleware for Resilient Operations
// =============================================================================

console.log('\n=== EXAMPLE 4: Retry Middleware ===\n');

let attemptCount = 0;

const flakyMachine = createAsyncMachine({ status: 'idle' }, {
  fetchData: async function() {
    attemptCount++;
    console.log(`Attempt #${attemptCount}`);

    if (attemptCount < 3) {
      throw new Error('Network timeout');
    }

    return createAsyncMachine({ status: 'success' }, this);
  }
});

const resilient = withRetry(flakyMachine, {
  maxRetries: 3,
  delay: 100,
  backoffMultiplier: 2,
  onRetry: (attempt, error) => {
    console.log(`Retrying (${attempt}/3): ${error.message}`);
  }
});

(async () => {
  try {
    const result = await resilient.fetchData.call(resilient.context);
    console.log('Success after retries!', result.context);
  } catch (err) {
    console.log('Failed after all retries:', (err as Error).message);
  }
})();

// =============================================================================
// EXAMPLE 5: Custom Middleware
// =============================================================================

console.log('\n=== EXAMPLE 5: Custom Middleware ===\n');

// Create a custom middleware for state change notifications
const withNotifications = createCustomMiddleware({
  after: ({ transitionName, prevContext, nextContext }) => {
    // Check if state actually changed
    if (JSON.stringify(prevContext) !== JSON.stringify(nextContext)) {
      console.log(`🔔 State changed in ${transitionName}`);
      console.log(`   Before:`, prevContext);
      console.log(`   After:`, nextContext);
    }
  }
});

// Create a custom middleware for timing out slow operations
const withTimeout = (timeoutMs: number) => createCustomMiddleware({
  before: async ({ transitionName }) => {
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${transitionName} timed out`)), timeoutMs);
    });

    // This would need to be combined with the actual transition somehow
    // This is a simplified example
  }
});

// Apply custom middleware
const notified = withNotifications(counter);
let state6 = notified;
state6 = state6.increment.call(state6.context);
state6 = state6.add.call(state6.context, 0); // No change
state6 = state6.add.call(state6.context, 5); // Changed

// =============================================================================
// EXAMPLE 6: Real-World Use Case - Shopping Cart
// =============================================================================

console.log('\n=== EXAMPLE 6: Real-World Shopping Cart ===\n');

type CartItem = { id: string; name: string; price: number; quantity: number };
type CartContext = { items: CartItem[]; total: number };

const cart = createMachine<CartContext>({ items: [], total: 0 }, {
  addItem: function(item: CartItem) {
    const existingItem = this.items.find(i => i.id === item.id);
    const items = existingItem
      ? this.items.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)
      : [...this.items, item];
    const total = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    return createMachine({ items, total }, this);
  },

  removeItem: function(itemId: string) {
    const items = this.items.filter(i => i.id !== itemId);
    const total = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
    return createMachine({ items, total }, this);
  },

  checkout: function() {
    return createMachine({ items: [], total: 0 }, this);
  }
});

// Apply comprehensive middleware stack
const productionCart = compose(
  cart,
  // Log all cart operations
  (m) => withLogging(m, {
    logger: (msg) => console.log(`[CART] ${msg}`)
  }),
  // Validate cart operations
  (m) => withValidation(m, ({ transitionName, context }) => {
    if (transitionName === 'checkout' && context.items.length === 0) {
      throw new Error('Cannot checkout with empty cart');
    }
    if (transitionName === 'checkout' && context.total < 0) {
      throw new Error('Invalid cart total');
    }
  }),
  // Track analytics
  (m) => withAnalytics(m, (event, props) => {
    console.log(`[ANALYTICS] ${event}`, {
      itemCount: props.to.items?.length || 0,
      total: props.to.total
    });
  }),
  // Report errors
  (m) => withErrorReporting(m, (error, context) => {
    console.error(`[SENTRY] Cart error:`, {
      error: error.message,
      transition: context.transition,
      cartState: context.context
    });
  })
);

// Use the cart
let cartState = productionCart;

console.log('\nAdding items to cart...');
cartState = cartState.addItem.call(cartState.context, {
  id: '1',
  name: 'Widget',
  price: 19.99,
  quantity: 1
});

cartState = cartState.addItem.call(cartState.context, {
  id: '2',
  name: 'Gadget',
  price: 29.99,
  quantity: 1
});

console.log('\nAttempting checkout...');
try {
  cartState = cartState.checkout.call(cartState.context);
  console.log('✓ Checkout successful!');
} catch (err) {
  console.log('✗ Checkout failed:', (err as Error).message);
}

console.log('\n=== All Examples Complete ===\n');

export {};
