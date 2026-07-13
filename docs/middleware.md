# State Machine Middleware System

The middleware system provides a powerful, type-safe interception layer for state machines, enabling cross-cutting concerns like logging, analytics, validation, error handling, and debugging without modifying your core machine logic.

## Overview

Middleware in state machines acts as an interception layer that can observe, modify, or prevent transitions. Unlike traditional middleware in web frameworks, state machine middleware operates at the transition level, giving you fine-grained control over state changes.

### Key Benefits

- **Type Safety**: Full TypeScript support with preserved machine types
- **Performance**: Direct property wrapping (3x faster than Proxy-based solutions)
- **Composability**: Mix and match middleware with functional composition
- **Observability**: Built-in history, snapshots, and time-travel debugging
- **Flexibility**: Synchronous and asynchronous operation modes

### Architecture

The middleware system consists of three main layers:

1. **Core Interception** (`createMiddleware`): Wraps machine transitions with hooks
2. **Pre-built Middleware**: Ready-to-use functions for common use cases
3. **Composition System**: Tools for combining and orchestrating middleware

```typescript
// Core interception
const instrumented = createMiddleware(machine, {
  before: (ctx) => console.log('Before:', ctx.transitionName),
  after: (result) => console.log('After:', result.transitionName),
  error: (error) => console.error('Error:', error.error)
});

// Pre-built middleware
const logged = withLogging(instrumented);

// Composition
const fullyInstrumented = compose(
  machine,
  withLogging,
  withAnalytics(trackEvent),
  withErrorReporting(captureError)
);
```

## Core Concepts

### Hooks System

Middleware operates through three types of hooks that intercept different phases of transition execution:

#### Before Hook
Called **before** a transition executes. Can prevent the transition or perform setup.

```typescript
before?: (ctx: MiddlewareContext<C>) => void | typeof CANCEL | Promise<void | typeof CANCEL>
```

#### After Hook
Called **after** a successful transition. Receives both previous and next context.

```typescript
after?: (result: MiddlewareResult<C>) => void | Promise<void>
```

#### Error Hook
Called when a synchronous transition throws or an asynchronous transition rejects. Return a machine, directly or through a promise, to recover with that fallback snapshot. Returning `void` or `null` runs the hook for reporting and then preserves the original failure. Throwing from the hook replaces the failure unless `continueOnError` is enabled.

```typescript
error?: (error: MiddlewareError<C>) => void | null | BaseMachine<C> | Promise<void | null | BaseMachine<C>>
```

### Context Objects

#### MiddlewareContext
Information available to `before` hooks:

```typescript
interface MiddlewareContext<C extends object> {
  transitionName: string;    // Name of the transition being called
  context: Readonly<C>;      // Current machine context
  args: any[];              // Arguments passed to the transition
}
```

#### MiddlewareResult
Information available to `after` hooks:

```typescript
interface MiddlewareResult<C extends object> {
  transitionName: string;    // Name of the transition that executed
  prevContext: Readonly<C>;  // Context before the transition
  nextContext: Readonly<C>;  // Context after the transition
  args: any[];              // Arguments that were passed
}
```

#### MiddlewareError
Information available to `error` hooks:

```typescript
interface MiddlewareError<C extends object> {
  transitionName: string;    // Name of the transition that failed
  context: Readonly<C>;      // Context when the error occurred
  args: any[];              // Arguments that were passed
  error: Error;             // The error that was thrown
}
```

Hooks always observe the snapshot on which a transition was invoked. This matters when calls are chained: the second `before` hook receives the first transition's context, and its `after` hook reports that context as `prevContext`. If a hook returns `CANCEL`, middleware returns that current snapshot unchanged. Both object-literal transitions and methods defined on a class prototype are intercepted.

### Execution Modes

The middleware system supports three execution modes that control how synchronous and asynchronous operations are handled:

#### 'sync' Mode
- All hooks must be synchronous
- Throws if hooks return Promises
- Best performance for sync-only workflows

#### 'async' Mode
- Always awaits hooks and transitions
- Supports async validation, logging, etc.
- Slight performance overhead

#### 'auto' Mode (Default)
- Adaptive execution: starts synchronously for zero overhead
- Automatically switches to async if Promises are encountered
- **Recommended** for most use cases

```typescript
const middleware = createMiddleware(machine, hooks, {
  mode: 'auto'  // Default: adaptive performance
});
```

### Cancellation

The `CANCEL` symbol allows `before` hooks to prevent transitions without throwing errors:

```typescript
import { CANCEL } from '@doeixd/machine';

const guarded = createMiddleware(machine, {
  before: ({ transitionName, context }) => {
    if (shouldBlock(context)) {
      return CANCEL;  // Silently prevent transition
    }
  }
});
```

## Basic Usage

### Creating Custom Middleware

```typescript
import { createMiddleware, createMachine } from '@doeixd/machine';

const counter = createMachine({ count: 0 }, (next) => ({
  increment() {
    return next({ count: this.context.count + 1 });
  },
  decrement() {
    return next({ count: this.context.count - 1 });
  }
}));

// Add logging middleware
const loggedCounter = createMiddleware(counter, {
  before: ({ transitionName, args }) => {
    console.log(`→ ${transitionName}`, args);
  },
  after: ({ transitionName, prevContext, nextContext }) => {
    console.log(`✓ ${transitionName}: ${prevContext.count} → ${nextContext.count}`);
  },
  error: ({ transitionName, error }) => {
    console.error(`✗ ${transitionName}:`, error.message);
  }
});

// Usage
const result = loggedCounter.increment();
// Console: "→ increment []"
// Console: "✓ increment: 0 → 1"
```

### Configuration Options

```typescript
const instrumented = createMiddleware(machine, hooks, {
  mode: 'auto',           // 'sync' | 'async' | 'auto'
  exclude: ['context']    // Properties to skip wrapping
});
```

## Pre-built Middleware Library

### withLogging()

Adds console logging for all transitions.

```typescript
import { withLogging } from '@doeixd/machine';

const logged = withLogging(counter, {
  logger: console.log,        // Custom logger function
  includeContext: true,       // Include context in logs (default: true)
  includeArgs: true          // Include arguments in logs (default: true)
});

// Output:
// → increment []
// ✓ increment {"count":1}
```

### withAnalytics()

Tracks state transitions to analytics services.

```typescript
import { withAnalytics } from '@doeixd/machine';

const tracked = withAnalytics(machine, (event, properties) => {
  analytics.track(event, properties);
}, {
  eventPrefix: 'state_transition',  // Default prefix
  includePrevContext: false,         // Include previous context
  includeArgs: true                  // Include transition arguments
});

// Tracks: "state_transition.increment" with context data
```

### withValidation()

Validates transitions before execution.

```typescript
import { withValidation } from '@doeixd/machine';

const validated = withValidation(counter, ({ transitionName, context, args }) => {
  if (transitionName === 'decrement' && context.count <= 0) {
    throw new Error('Cannot decrement below zero');
  }
  // Return false to throw generic error
  // Return true/undefined to allow transition
});

// Throws on invalid transitions
validated.decrement(); // Error: Cannot decrement below zero
```

### withPermissions()

Implements role-based access control.

```typescript
import { withPermissions } from '@doeixd/machine';

const protectedMachine = withPermissions(machine, ({ transitionName, context }) => {
  // Return true to allow, false to deny
  return context.user?.role === 'admin' || transitionName === 'view';
});

// Throws "Unauthorized transition: delete" for non-admins
```

### withErrorReporting()

Sends errors to error tracking services.

```typescript
import { withErrorReporting } from '@doeixd/machine';

const monitored = withErrorReporting(machine, (error, context) => {
  Sentry.captureException(error, { extra: context });
}, {
  includeContext: true,    // Include machine context (default: true)
  includeArgs: true,       // Include transition arguments (default: true)
  mode: 'async'           // Force async for error reporting
});
```

### withPerformanceMonitoring()

Tracks transition execution time.

```typescript
import { withPerformanceMonitoring } from '@doeixd/machine';

const monitored = withPerformanceMonitoring(machine, ({ transitionName, duration, context }) => {
  if (duration > 100) {
    console.warn(`Slow transition: ${transitionName} took ${duration}ms`);
  }
  metrics.timing(`transition.${transitionName}`, duration);
});
```

### withRetry()

Automatically retries failed transitions.

```typescript
import { withRetry } from '@doeixd/machine';

const resilient = withRetry(asyncMachine, {
  maxRetries: 3,                    // Maximum retry attempts
  delay: 1000,                      // Initial delay in ms
  backoffMultiplier: 2,             // Exponential backoff
  shouldRetry: (error) => {         // Custom retry condition
    return error.message.includes('network');
  },
  onRetry: (attempt, error) => {    // Retry callback
    console.log(`Retry ${attempt} after error:`, error.message);
  }
});
```

### withGuards()

Implements FSM guard conditions that prevent invalid transitions.

```typescript
import { withGuards } from '@doeixd/machine';

const guarded = withGuards(counter, {
  decrement: {
    guard: ({ context }) => context.count > 0,
    onFail: 'throw'  // 'throw' | 'ignore'
  },
  reset: {
    guard: ({ context }) => context.user?.isAdmin === true
  }
});

// Guards prevent transitions when conditions aren't met
guarded.decrement(); // Throws if count <= 0
```

### Conditional Middleware

Apply middleware only to specific transitions or contexts.

```typescript
import { createConditionalMiddleware, createStateMiddleware } from '@doeixd/machine';

// Only log sensitive operations
const selectiveLogging = createConditionalMiddleware(counter, {
  only: ['delete', 'reset'],  // Only these transitions
  hooks: {
    before: ({ transitionName }) => auditLog(transitionName)
  }
});

// Log only when in debug mode
const debugLogging = createStateMiddleware(counter, {
  when: (ctx) => ctx.debugMode === true,
  hooks: {
    before: (ctx) => console.log('Debug:', ctx)
  }
});
```

## Composition & Advanced Patterns

### Basic Composition

```typescript
import { compose } from '@doeixd/machine';

const instrumented = compose(
  counter,
  withLogging,
  withValidation(validate),
  withErrorReporting(captureError)
);
```

### Type-Safe Composition

```typescript
import { composeTyped } from '@doeixd/machine';

const enhanced = composeTyped(
  counter,
  withHistory(),
  withSnapshot(),
  withTimeTravel()
);
// TypeScript knows about history, snapshots, and replayFrom
```

### Pipeline with Error Handling

```typescript
import { createPipeline } from '@doeixd/machine';

const pipeline = createPipeline({
  continueOnError: true,    // Continue if middleware fails
  logErrors: true,          // Log errors to console
  onError: (error, name) => // Custom error handler
    reportError(error, name)
});

const result = pipeline(counter,
  withHistory(),
  failingMiddleware,    // Won't stop pipeline
  withSnapshot()
);

if (!result.success) {
  console.log('Pipeline completed with errors:', result.errors);
}
```

### Middleware Registry

```typescript
import { createMiddlewareRegistry } from '@doeixd/machine';

const registry = createMiddlewareRegistry()
  .register('logging', withLogging(), 'Console logging')
  .register('analytics', withAnalytics(track), 'Analytics tracking', 10)
  .register('history', withHistory(), 'Transition history', 20);

// Apply by name
const instrumented = registry.apply(counter, ['logging', 'analytics']);

// Apply all (in priority order)
const fullyInstrumented = registry.applyAll(counter);
```

### Conditional Helpers

```typescript
import { when, inDevelopment, whenContext, combine, branch } from '@doeixd/machine';

// Apply only in development
const devOnly = inDevelopment(withTimeTravel());

// Apply based on context
const debugOnly = whenContext('mode', 'debug', withLogging());

// Combine multiple middlewares
const combined = combine(withHistory(), withSnapshot());

// Branch based on conditions
const smartMiddleware = branch([
  [(m) => m.context.env === 'development', withTimeTravel()],
  [(m) => m.context.env === 'production', withAnalytics(track)]
]);
```

## History, Snapshots & Time Travel

### withHistory()

Records all transition calls for debugging and replay.

```typescript
import { withHistory } from '@doeixd/machine';

const tracked = withHistory(counter, {
  maxSize: 100,                    // Maximum entries to keep
  serializer: {                    // Optional serialization
    serialize: (args) => JSON.stringify(args),
    deserialize: (str) => JSON.parse(str)
  },
  filter: (name, args) =>          // Filter transitions
    !name.startsWith('_'),
  onEntry: (entry) =>              // Callback for new entries
    console.log('Transition:', entry.transitionName)
});

tracked.increment();
tracked.add(5);

console.log(tracked.history);
// [
//   { id: 'entry-0', transitionName: 'increment', args: [], timestamp: 123456 },
//   { id: 'entry-1', transitionName: 'add', args: [5], timestamp: 123457 }
// ]

tracked.clearHistory(); // Clear all entries
```

### withSnapshot()

Records context changes before and after each transition.

```typescript
import { withSnapshot } from '@doeixd/machine';

const tracked = withSnapshot(counter, {
  maxSize: 50,
  serializer: {
    serialize: (ctx) => JSON.stringify(ctx),
    deserialize: (str) => JSON.parse(str)
  },
  captureSnapshot: (before, after) => ({
    changed: JSON.stringify(before) !== JSON.stringify(after)
  }),
  onlyOnChange: true // Skip snapshots when the context is unchanged
});

tracked.increment();

console.log(tracked.snapshots);
// [{
//   id: 'snapshot-0',
//   transitionName: 'increment',
//   before: { count: 0 },
//   after: { count: 1 },
//   timestamp: 123456,
//   diff: { changed: true }
// }]

// Time travel
const restored = tracked.restoreSnapshot(tracked.snapshots[0].before);
console.log(restored.context.count); // 0

tracked.clearSnapshots();
```

### withTimeTravel()

Combines history and snapshots with replay functionality.

```typescript
import { withTimeTravel } from '@doeixd/machine';

const tracker = withTimeTravel(counter, {
  maxSize: 100,
  serializer: {
    serialize: (data) => JSON.stringify(data),
    deserialize: (str) => JSON.parse(str)
  },
  onRecord: (type, data) => {
    console.log(`Recorded ${type}:`, data.transitionName);
  }
});

tracker.increment();
tracker.add(5);

// Access both history and snapshots
console.log(tracker.history.length);    // 2
console.log(tracker.snapshots.length);  // 2

// Replay from a specific point
const replayed = tracker.replayFrom(0); // Replays all transitions from snapshot 0
console.log(replayed.context.count);    // 6

// Restore to specific state
const restored = tracker.restoreSnapshot(tracker.snapshots[0].before);

// Clear everything
tracker.clearTimeTravel();
```

## Examples

### E-commerce Shopping Cart

```typescript
import { createMachine, compose, withAnalytics, withValidation, withErrorReporting } from '@doeixd/machine';

const cart = createMachine({
  items: [],
  total: 0,
  user: null
}, (next) => ({
  addItem(item) {
    return next({
      items: [...this.context.items, item],
      total: this.context.total + item.price,
      user: this.context.user
    });
  },
  removeItem(itemId) {
    const item = this.context.items.find(i => i.id === itemId);
    return next({
      items: this.context.items.filter(i => i.id !== itemId),
      total: this.context.total - (item?.price || 0),
      user: this.context.user
    });
  },
  checkout() {
    if (this.context.items.length === 0) {
      throw new Error('Cart is empty');
    }
    // Process payment...
    return next({
      items: [],
      total: 0,
      user: this.context.user,
      lastOrder: { items: this.context.items, total: this.context.total }
    });
  }
});

const instrumentedCart = compose(
  cart,
  withAnalytics((event, props) => {
    analytics.track(event, props);
  }),
  withValidation(({ transitionName, context }) => {
    if (transitionName === 'checkout' && context.items.length === 0) {
      throw new Error('Cannot checkout empty cart');
    }
  }),
  withErrorReporting((error, context) => {
    Sentry.captureException(error, { extra: context });
  })
);
```

### API Client with Resilience

```typescript
import { createAsyncMachine, compose, withRetry, withPerformanceMonitoring } from '@doeixd/machine';

const apiClient = createAsyncMachine({
  status: 'idle',
  data: null,
  error: null
}, (next) => ({
  async fetchData: async function(endpoint) {
    try {
      const response = await fetch(endpoint);
      const data = await response.json();
      return next({
        status: 'success',
        data,
        error: null
      });
    } catch (error) {
      return next({
        status: 'error',
        data: null,
        error: error.message
      });
    }
  }
});

const resilientClient = compose(
  apiClient,
  withRetry({
    maxRetries: 3,
    delay: 1000,
    backoffMultiplier: 2,
    shouldRetry: (error) => error.name === 'NetworkError'
  }),
  withPerformanceMonitoring((metric) => {
    if (metric.duration > 5000) {
      console.warn(`Slow API call: ${metric.duration}ms`);
    }
  })
);
```

### Form Validation with Guards

```typescript
import { createMachine, compose, withGuards, withHistory } from '@doeixd/machine';

const form = createMachine({
  values: { email: '', password: '' },
  errors: {},
  submitted: false
}, (next) => ({
  updateField(field, value) {
    return next({
      values: { ...this.context.values, [field]: value },
      errors: { ...this.context.errors, [field]: undefined },
      submitted: false
    });
  },
  validate() {
    const errors = {};
    if (!this.context.values.email.includes('@')) {
      errors.email = 'Invalid email';
    }
    if (this.context.values.password.length < 8) {
      errors.password = 'Password too short';
    }
    return next({
      values: this.context.values,
      errors,
      submitted: false
    });
  },
  submit() {
    return next({
      values: this.context.values,
      errors: {},
      submitted: true
    });
  }
}));

const validatedForm = compose(
  form,
  withGuards({
    submit: {
      guard: ({ context }) => Object.keys(context.errors).length === 0,
      onFail: 'ignore'  // Don't throw, just prevent submission
    }
  }),
  withHistory()  // Track form interactions
);
```

## API Reference

### Core Functions

#### createMiddleware<M extends BaseMachine<any>>(machine: M, hooks: MiddlewareHooks<Context<M>>, options?: MiddlewareOptions): M

Wraps a machine with middleware hooks.

**Parameters:**
- `machine`: The machine to wrap
- `hooks`: Middleware hooks configuration
- `options`: Configuration options

**Returns:** A new machine with middleware applied

#### compose<M extends BaseMachine<any>>(machine: M, ...middlewares: Array<(m: M) => M>): M

Composes multiple middleware functions left-to-right.

#### composeTyped<M, Ms>(machine: M, ...middlewares: Ms): ComposedType

Type-safe middleware composition with better TypeScript inference.

### Pre-built Middleware

#### withLogging<M>(machine: M, options?): M
#### withAnalytics<M>(machine: M, track, options?): M
#### withValidation<M>(machine: M, validate, options?): M
#### withPermissions<M>(machine: M, canPerform, options?): M
#### withErrorReporting<M>(machine: M, captureError, options?): M
#### withPerformanceMonitoring<M>(machine: M, onMetric): M
#### withRetry<M>(machine: M, options?): M
#### withGuards<M>(machine: M, guards, options?): M
#### withHistory<M>(machine: M, options?): WithHistory<M>
#### withSnapshot<M>(machine: M, options?): WithSnapshot<M>
#### withTimeTravel<M>(machine: M, options?): WithTimeTravel<M>

### Composition Utilities

#### createPipeline(config?): PipelineFunction
#### createMiddlewareRegistry(): Registry
#### createConditionalMiddleware<M>(machine: M, config): M
#### createStateMiddleware<M>(machine: M, config): M
#### createCustomMiddleware<M>(hooks, options?): (machine: M) => M

### Types

#### MiddlewareHooks<C>
```typescript
interface MiddlewareHooks<C extends object> {
  before?: (ctx: MiddlewareContext<C>) => void | typeof CANCEL | Promise<void | typeof CANCEL>;
  after?: (result: MiddlewareResult<C>) => void | Promise<void>;
  error?: (error: MiddlewareError<C>) => void | null | BaseMachine<C> | Promise<void | null | BaseMachine<C>>;
}
```

#### MiddlewareOptions
```typescript
interface MiddlewareOptions {
  mode?: 'sync' | 'async' | 'auto';
  exclude?: string[];
}
```

#### Augmented Types
```typescript
type WithHistory<M, C> = M & { history: HistoryEntry<C>[]; clearHistory(): void };
type WithSnapshot<M, C> = M & { snapshots: ContextSnapshot<C>[]; clearSnapshots(): void; restoreSnapshot(context: C): M };
type WithTimeTravel<M, C> = M & { /* history + snapshots + replay */ };
```

## Best Practices

### Performance

- Use `'auto'` mode for optimal performance (default)
- Exclude unnecessary properties with `exclude` option
- Use `withGuards` for simple validation (faster than `withValidation`)
- Limit history/snapshot sizes in production

### Error Handling

- Use `error` hooks for reporting or explicit fallback-state recovery
- Prefer `before` hooks for validation over `error` hooks
- Use `CANCEL` for silent prevention, `throw` for errors
- A logging-only error hook still rethrows the original transition error
- Recovered fallback machines retain middleware across subsequent transitions

### Type Safety

- Leverage `composeTyped` for better type inference
- Use conditional middleware to avoid type conflicts
- Test middleware-wrapped machines thoroughly

### Memory Management

- Set `maxSize` limits for history and snapshots
- Clear tracking data when no longer needed
- Use serialization for persistence without memory bloat

### Testing

```typescript
// Test middleware behavior
const mockTrack = vi.fn();
const tracked = withAnalytics(machine, mockTrack);

tracked.transition();
expect(mockTrack).toHaveBeenCalledWith('state_transition.transition', expect.any(Object));

// Test fallback recovery
const recoveredMachine = createMiddleware(machine, {
  error: () => fallbackMachine
});
expect(recoveredMachine.failingTransition()).toBe(fallbackMachine);

// Reporting without a fallback preserves the failure
const reportedMachine = createMiddleware(machine, { error: vi.fn() });
expect(() => reportedMachine.failingTransition()).toThrow();
```

## Migration Guide

### From Manual Logging

```typescript
// Before
const machine = createMachine(context, {
  transition: function() {
    console.log('Transitioning...');
    // logic
  }
});

// After
const machine = createMachine(context, {
  transition: function() {
    // logic
  }
});
const logged = withLogging(machine);
```

### From Basic Machines

```typescript
// Before: Direct machine usage
const result = machine.transition();

// After: Middleware-wrapped
const instrumented = compose(machine, withLogging, withValidation);
const result = instrumented.transition();
```

### Common Pitfalls

- **Infinite loops**: Don't call middleware-wrapped methods in hooks
- **Async confusion**: Match middleware mode to machine type
- **Type loss**: Use `composeTyped` for complex compositions
- **Memory leaks**: Always set size limits for tracking middleware

The middleware system transforms state machines from simple state containers into observable, debuggable, and resilient systems while maintaining full type safety and optimal performance.
