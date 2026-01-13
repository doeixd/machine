# Machine Creation Patterns Guide

This comprehensive guide explains all the different patterns and overloads for creating state machines in `@doeixd/machine`. Learn when to use each approach, their tradeoffs, and how to choose the right pattern for your use case.

## Table of Contents

- [Quick Start](#quick-start)
- [`createMachine` Patterns](#createmachine-patterns)
  - [Functional Builder Pattern (Recommended)](#functional-builder-pattern-recommended)
  - [Traditional Pattern](#traditional-pattern)
  - [Factory Function Pattern](#factory-function-pattern)
- [`createAsyncMachine` Patterns](#createasyncmachine-patterns)
  - [Functional Builder Pattern (Recommended)](#functional-builder-pattern-recommended-1)
  - [Traditional Pattern](#traditional-pattern-1)
- [`createMachineFactory` Patterns](#createmachinefactory-patterns)
  - [Pure Functions Pattern](#pure-functions-pattern)
- [`state()` Smart Constructor](#state-smart-constructor)
- [Pattern Comparison Matrix](#pattern-comparison-matrix)
- [Migration Guide](#migration-guide)
- [Common Pitfalls](#common-pitfalls)
- [Performance Considerations](#performance-considerations)
- [Testing Strategies](#testing-strategies)
- [FAQ](#faq)

## Quick Start

**For most use cases, start here:**

```typescript
// ✅ Simple synchronous machine
const counter = createMachine({ count: 0 }, (next) => ({
  increment() { return next({ count: this.context.count + 1 }); },
  decrement() { return next({ count: this.context.count - 1 }); }
}));

// ✅ Simple async machine
const fetcher = createAsyncMachine({ status: 'idle', data: null }, (next) => ({
  async fetch() {
    const data = await api.getData();
    return next({ status: 'success', data });
  }
}));

// ✅ Pure functional transformations
const calculator = createMachineFactory<{ value: number }>()({
  add: (ctx, n) => ({ value: ctx.value + n }),
  multiply: (ctx, n) => ({ value: ctx.value * n })
});
```

**Need help choosing?** Skip to [When to Use Each Pattern](#when-to-use-each-pattern).

## `createMachine` Patterns

### Functional Builder Pattern (Recommended)

```typescript
const machine = createMachine({ count: 0 }, (next) => ({
  increment() {
    return next({ count: this.context.count + 1 });
  },
  add(n: number) {
    return next({ count: this.context.count + n });
  }
}));
```

**Strengths:**
- ✅ **Best type safety** - `this` is automatically typed as the current context
- ✅ **Automatic binding** - No need to manually bind `this` context
- ✅ **Immutable by default** - `next()` helper ensures proper state transitions
- ✅ **Clean syntax** - No repetitive `createMachine` calls in transitions
- ✅ **IDE support** - Full autocomplete and refactoring support

**Capabilities:**
- Access current context via `this`
- Return new context via `next()`
- Type-safe transitions that stay within the same machine type

**Tradeoffs:**
- Only works for machines that maintain the same type (single-state machines)
- Cannot transition to different machine types (use traditional pattern for type-state)

**Best for:** Single-state machines, counters, forms, data transformations.

### Traditional Pattern

```typescript
const transitions = {
  increment: function() {
    return createMachine({ count: this.context.count + 1 }, transitions);
  }
};

const machine = createMachine({ count: 0 }, transitions);
```

**Strengths:**
- ✅ **Type-state programming** - Can transition between different machine types
- ✅ **Flexible** - Can return any machine type from transitions
- ✅ **Explicit** - Clear about what `createMachine` calls are doing

**Capabilities:**
- Transitions can return different machine types (type-state programming)
- Full control over machine creation and transitions

**Tradeoffs:**
- ❌ **Verbose** - Must repeat `createMachine` calls and pass `transitions`
- ❌ **Type safety issues** - `this` typing can be problematic in some contexts
- ❌ **Repetitive** - Same `transitions` object passed to every `createMachine` call

**Best for:** Type-state machines where different states have different types.

### Factory Function Pattern

```typescript
const machine = createMachine({ count: 0, max: 10 }, (ctx) => {
  const maxCount = ctx.max; // Access initial context for setup

  return (next) => ({
    increment() {
      const newCount = Math.min(this.context.count + 1, maxCount);
      return next({ count: newCount, max: this.context.max });
    }
  });
});
```

**Strengths:**
- ✅ **Setup logic** - Can perform initialization using the `ctx` parameter
- ✅ **Complex transitions** - Access to both initial context and current context
- ✅ **Type-safe setup** - `ctx` parameter provides type information for setup

**Capabilities:**
- Access initial context via `ctx` parameter for configuration/setup
- Access current context via `this` for state-dependent logic
- Return transition functions that use both

**Tradeoffs:**
- More complex than functional builder pattern
- Requires understanding of both `ctx` and `this` binding

**Best for:** Machines that need initialization logic or complex setup.

## `createAsyncMachine` Patterns

### Functional Builder Pattern (Recommended)

```typescript
const machine = createAsyncMachine({ status: 'idle', data: null }, (next) => ({
  async fetch() {
    try {
      const data = await api.getData();
      return next({ status: 'success', data });
    } catch (error) {
      return next({ status: 'error', data: null });
    }
  }
}));
```

**Strengths:**
- ✅ **Best type safety** - Same benefits as sync functional builder
- ✅ **Clean async handling** - No need to manually create new machines in async code
- ✅ **Automatic error handling** - Can return promises that resolve to new contexts
- ✅ **Consistent with sync** - Same pattern as `createMachine` functional builder

**Capabilities:**
- Async transitions that return promises resolving to new contexts
- Access current context via `this`
- Automatic promise resolution and context updates

**Tradeoffs:**
- Only works for machines that maintain the same type
- Cannot transition to different machine types in async code

**Best for:** Async operations in single-state machines (API calls, data fetching).

### Traditional Pattern

```typescript
const machine = createAsyncMachine({ status: 'idle', data: null }, {
  async fetch: async function() {
    try {
      const data = await api.getData();
      return createAsyncMachine({ status: 'success', data }, this);
    } catch (error) {
      return createAsyncMachine({ status: 'error', data: null }, this);
    }
  }
});
```

**Strengths:**
- ✅ **Type-state with async** - Can transition between different machine types asynchronously
- ✅ **Full control** - Explicit about async machine creation

**Capabilities:**
- Async transitions that can return different machine types
- Full control over async state transitions

**Tradeoffs:**
- ❌ **Verbose** - Must manually create `createAsyncMachine` instances
- ❌ **Repetitive** - Same pattern as sync traditional but with async complexity
- ❌ **Type safety issues** - Same issues as sync traditional pattern

**Best for:** Type-state machines with async transitions.

## `createMachineFactory` Patterns

### Pure Functions Pattern

```typescript
const createCounter = createMachineFactory<{ count: number }>()({
  increment: (ctx) => ({ count: ctx.count + 1 }),
  add: (ctx, n: number) => ({ count: ctx.count + n }),
  reset: (ctx) => ({ count: 0 })
});

const counter = createCounter({ count: 10 });
const next = counter.add(5); // { count: 15 }
```

**Strengths:**
- ✅ **Pure functions** - No side effects, easy to test
- ✅ **Declarative** - Clear mapping of inputs to outputs
- ✅ **Reusable** - Factory can be reused with different initial contexts
- ✅ **Simple** - No `this` binding complexity

**Capabilities:**
- Pure context transformations
- Factory pattern for reusable machine creation
- Type-safe context operations

**Tradeoffs:**
- ❌ **No access to current state** - Only operates on input context
- ❌ **Stateless** - Cannot maintain internal state between calls
- ❌ **Limited** - Cannot express complex state-dependent logic

**Best for:** Simple state transformations, calculators, pure business logic.

## `state()` Smart Constructor

The `state()` function automatically chooses between traditional and functional patterns based on how you call it.

### Traditional Pattern (with transitions object)

```typescript
const machine = state({ count: 0 }, {
  increment() { return createMachine({ count: this.context.count + 1 }, this); },
  decrement() { return createMachine({ count: this.context.count - 1 }, this); }
});
```

### Functional Pattern (curried with transformers)

```typescript
const createCounter = state({ count: 0 });
const machine = createCounter({
  increment: ctx => ({ count: ctx.count + 1 }),
  add: (ctx, n: number) => ({ count: ctx.count + n }),
  reset: ctx => ({ count: 0 })
});
```

**Strengths:**
- ✅ **Smart detection** - Automatically chooses between `createMachine` and `createFunctionalMachine`
- ✅ **Unified API** - Single function for different patterns
- ✅ **Backwards compatible** - Works with existing code
- ✅ **Type-safe** - Maintains full type safety in both modes

**Capabilities:**
- **Two-argument call**: Uses traditional `createMachine` pattern
- **One-argument call**: Returns factory function for functional pattern
- **Auto-detection**: Intelligently chooses based on arguments

**Tradeoffs:**
- Less explicit about which underlying pattern is used
- May be confusing for developers unfamiliar with the dual behavior

**Best for:** Getting started quickly, migrating between patterns, when you want simple API.

## Pattern Comparison Matrix

| Pattern | Type Safety | Complexity | Flexibility | Performance | Testing | Best For |
|---------|-------------|------------|-------------|-------------|----------|----------|
| `createMachine` (Functional Builder) | ⭐⭐⭐⭐⭐ | Low | Single-state | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Most sync machines |
| `createMachine` (Traditional) | ⭐⭐⭐ | Medium | Multi-state | ⭐⭐⭐⭐ | ⭐⭐⭐ | Type-state programming |
| `createMachine` (Factory Function) | ⭐⭐⭐⭐ | Medium | Single-state + setup | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Machines with initialization |
| `createAsyncMachine` (Functional Builder) | ⭐⭐⭐⭐⭐ | Low | Single-state async | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Most async machines |
| `createAsyncMachine` (Traditional) | ⭐⭐⭐ | Medium | Multi-state async | ⭐⭐⭐ | ⭐⭐⭐ | Type-state with async |
| `createMachineFactory` | ⭐⭐⭐⭐ | Low | Pure functions | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Simple transformations |
| `state()` | ⭐⭐⭐⭐ | Low | Auto-detect | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Getting started |

### Legend
- **Type Safety**: How well the pattern prevents runtime errors at compile time
- **Complexity**: How much boilerplate and conceptual overhead
- **Flexibility**: How many different use cases the pattern supports
- **Performance**: Runtime performance characteristics
- **Testing**: How easy it is to unit test machines using this pattern

## When to Use Each Pattern

### Use Functional Builder Patterns When:
- ✅ You have a **single-state machine** (same type throughout)
- ✅ You want **maximum type safety**
- ✅ You prefer **clean, readable code**
- ✅ You're doing **async operations** in single-state machines

### Use Traditional Patterns When:
- ✅ You need **type-state programming** (different types for different states)
- ✅ You're building **complex state machines** with multiple distinct states
- ✅ You need **maximum flexibility** in state transitions

### Use `createMachineFactory` When:
- ✅ Your transitions are **pure functions** (no side effects)
- ✅ You need **reusable factories**
- ✅ You're doing **simple state transformations**
- ✅ You want **easy testability**

### Use `state()` When:
- ✅ You're **getting started** and want the library to choose
- ✅ You're **migrating existing code**
- ✅ You want a **unified API** for different patterns

### Quick Decision Guide:

**Q: Do your transitions return the same machine type?**
- ✅ **Yes** → Use Functional Builder (`createMachine(context, (next) => ({ ... }))`)
- ❌ **No** → Use Traditional Pattern (`createMachine(context, { ... })`)

**Q: Do you need async operations?**
- ✅ **Yes** → Use `createAsyncMachine` with Functional Builder

**Q: Are your transitions pure functions?**
- ✅ **Yes** → Consider `createMachineFactory`

**Q: Do you want the library to decide?**
- ✅ **Yes** → Use `state()`

## Migration Guide

### From Traditional to Functional Builder

**Before:**
```typescript
const transitions = {
  increment: function() {
    return createMachine({ count: this.context.count + 1 }, transitions);
  }
};
const machine = createMachine({ count: 0 }, transitions);
```

**After:**
```typescript
const machine = createMachine({ count: 0 }, (next) => ({
  increment() {
    return next({ count: this.context.count + 1 });
  }
}));
```

**Migration Steps:**
1. Replace `transitions` object with `(next) => ({ ... })` wrapper
2. Remove `createMachine` calls from transitions, use `next()` instead
3. Remove the separate `transitions` variable
4. Change function declarations to method syntax

### From Functional Builder to Factory

**Before:**
```typescript
const machine = createMachine({ count: 0 }, (next) => ({
  increment() { return next({ count: this.context.count + 1 }); }
}));
```

**After:**
```typescript
const createCounter = createMachineFactory<{ count: number }>()({
  increment: ctx => ({ count: ctx.count + 1 })
});
const machine = createCounter({ count: 0 });
```

**Migration Steps:**
1. Replace `(next) => ({ ... })` with pure functions
2. Use `ctx` parameter instead of `this`
3. Return plain context objects instead of calling `next()`

## Common Pitfalls

### ❌ Using `this` in Arrow Functions

```typescript
// WRONG - arrow functions don't bind `this`
const machine = createMachine({ count: 0 }, (next) => ({
  increment: () => next({ count: this.context.count + 1 }) // `this` is undefined!
}));
```

```typescript
// RIGHT - use function declarations or method syntax
const machine = createMachine({ count: 0 }, (next) => ({
  increment() { return next({ count: this.context.count + 1 }); }
}));
```

### ❌ Passing `this` Incorrectly

```typescript
// WRONG - `this` in inline object doesn't work
const machine = createMachine({ count: 0 }, {
  increment: () => next({ count: this.context.count + 1 }) // `this` refers to wrong context
});
```

```typescript
// RIGHT - use named transitions object
const transitions = {
  increment: function() { return createMachine({ count: this.context.count + 1 }, transitions); }
};
const machine = createMachine({ count: 0 }, transitions);
```

### ❌ Mixing Context Access Patterns

```typescript
// WRONG - confusing `ctx` and `this`
const machine = createMachine({ count: 0 }, (ctx) => (next) => ({
  increment() {
    // `ctx` is initial context, `this` is current context
    return next({ count: ctx.count + 1 }); // Bug: always uses initial count!
  }
}));
```

## Performance Considerations

### Memory Usage
- **Functional Builder**: Minimal memory overhead, no closure captures
- **Traditional Pattern**: Higher memory usage due to repeated `transitions` object references
- **Factory Pattern**: Lowest memory usage, pure functions with no state

### Runtime Performance
- **Functional Builder**: Fastest at runtime, direct function calls
- **Traditional Pattern**: Slight overhead from repeated object creation
- **Factory Pattern**: Fastest for simple transformations

### Bundle Size Impact
- All patterns have similar bundle size impact
- `createMachineFactory` may enable better tree-shaking for unused transitions

### Development Performance
- **Type checking**: Functional Builder provides fastest TypeScript compilation
- **IDE support**: All patterns have excellent IDE support
- **Hot reloading**: Factory pattern may have slight edge in hot reload scenarios

## Testing Strategies

### Unit Testing Transitions

**Functional Builder:**
```typescript
describe('counter transitions', () => {
  it('should increment count', () => {
    const machine = createMachine({ count: 5 }, (next) => ({
      increment() { return next({ count: this.context.count + 1 }); }
    }));

    const result = machine.increment();
    expect(result.context.count).toBe(6);
  });
});
```

**Factory Pattern:**
```typescript
describe('counter transformations', () => {
  const createCounter = createMachineFactory<{ count: number }>()({
    increment: ctx => ({ count: ctx.count + 1 })
  });

  it('should increment count', () => {
    const result = createCounter({ count: 5 }).increment();
    expect(result.context.count).toBe(6);
  });
});
```

### Testing Async Machines

```typescript
describe('async fetcher', () => {
  it('should handle successful fetch', async () => {
    const mockApi = { getData: vi.fn().mockResolvedValue('data') };

    const machine = createAsyncMachine({ status: 'idle', data: null }, (next) => ({
      async fetch() {
        const data = await mockApi.getData();
        return next({ status: 'success', data });
      }
    }));

    const result = await machine.fetch();
    expect(result.context.status).toBe('success');
    expect(result.context.data).toBe('data');
  });
});
```

### Mocking Strategies

- **Dependency injection**: Pass dependencies through context
- **Factory functions**: Create machines with mock dependencies
- **Middleware**: Use middleware for cross-cutting concerns like logging

## FAQ

### Q: When should I use type-state programming?

**A:** Use type-state when you have distinct machine types that represent different states. For example, `LoggedInMachine` and `LoggedOutMachine` are fundamentally different types with different capabilities.

### Q: Can I mix patterns in the same application?

**A:** Yes! Different parts of your application can use different patterns based on their needs. For example, use Functional Builder for UI components and Traditional Pattern for complex business logic.

### Q: How do I handle side effects?

**A:** For side effects in Functional Builder, you can return promises or use middleware. For complex side effects, consider the Traditional Pattern which gives you more control.

### Q: What's the difference between `createMachine` and `createFunctionalMachine`?

**A:** `createMachine` supports both traditional and functional builder patterns. `createFunctionalMachine` is the internal implementation for the pure functional pattern used by `createMachineFactory`.

### Q: Can I change patterns later?

**A:** Yes, the patterns are generally interchangeable. The migration guides above show how to convert between them. Start with the simplest pattern that works, then refactor as needed.

### Q: How do I debug machine state?

**A:** All patterns support the same debugging techniques: logging middleware, devtools integration, and inspecting the `context` property. The Functional Builder pattern often provides the best debugging experience due to clearer code.

### Q: Are there any performance differences between patterns?

**A:** Generally minimal at runtime. The Factory pattern may have slight performance advantages for simple transformations, while the Functional Builder is optimized for general use cases.</content>
<parameter name="filePath">docs/patterns-guide.md