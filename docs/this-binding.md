# Understanding `this` in @doeixd/machine

This guide explains how `this` binding works in the library, common patterns, pitfalls, and how to avoid `this` entirely if you prefer.

## Table of Contents

- [The Basics: What is `this`?](#the-basics-what-is-this)
- [How `this` is Bound in Transitions](#how-this-is-bound-in-transitions)
- [The Factory Function Pattern](#the-factory-function-pattern)
- [Common Pitfalls](#common-pitfalls)
- [Avoiding `this` Entirely](#avoiding-this-entirely)
- [Best Practices](#best-practices)

---

## The Basics: What is `this`?

In `@doeixd/machine`, transition functions use JavaScript's `this` keyword to access the **current state** of the machine. The library automatically binds `this` to the machine's context object.

### Key Concept

```typescript
const machine = createMachine({ count: 0 }, (next) => ({
  increment: function() {
    // `this` is bound to the current context: { count: 0 }
    // NOT the machine itself, but the context object
    return next({ count: this.count + 1 });
  }
}));
```

**Important:** `this` refers directly to the **context object**, not the machine. You access `this.count`, not `this.context.count`.

---

## How `this` is Bound in Transitions

When you call a transition method on a machine, the library automatically binds `this` to the context:

```typescript
const counter = createMachine({ count: 0 }, (next) => ({
  increment: function() {
    console.log(this); // { count: 0 }
    console.log(this.count); // 0
    return next({ count: this.count + 1 });
  }
}));

// When you call counter.increment():
// 1. The library calls: increment.call(counter.context)
// 2. Inside increment, `this` === { count: 0 }
// 3. You can access this.count directly
```

### Why Bind to Context?

Binding `this` to the context (not the full machine) keeps your code concise:

```typescript
// ✅ Clean: `this` bound to context
increment: function() {
  return next({ count: this.count + 1 });
}

// ❌ Would be verbose if `this` was the whole machine
increment: function() {
  return createMachine({ count: this.context.count + 1 }, this);
}
```

---

## The Factory Function Pattern

The factory function pattern adds a `ctx` parameter that provides **type information** to TypeScript while `this` provides **runtime access**:

### Pattern Explained

```typescript
// ❌ WRONG: Inline object with `this` - doesn't work!
const counter = createMachine({ count: 0 }, {
  increment: function() {
    return createMachine({ count: this.count + 1 }, this);
    // `this` here is the context, not transitions - TypeScript error!
  }
});

// ✅ CORRECT: Named transitions variable
const transitions = {
  increment: function() {
    return createMachine({ count: this.count + 1 }, transitions);
    // At RUNTIME: `this` is bound to context
    // We pass `transitions` (the object) as second argument
  }
};
const counter = createMachine({ count: 0 }, transitions);

// ✅ CORRECT: Factory function with closure
const counter2 = createMachine({ count: 0 }, (ctx) => {
  const transitions = {
    increment: function() {
      return createMachine({ count: this.count + 1 }, transitions);
    }
  };
  return transitions;
});
```

### Why Both `ctx` and `this`?

- **`ctx` (factory parameter)**: Provides TypeScript with type information
- **`this` (inside functions)**: Provides runtime access to current state

```typescript
type Context = { count: number; max: number };

const counter = createMachine<Context>(
  { count: 0, max: 10 },
  (ctx) => {
    // `ctx` helps TypeScript infer the return type
    // You can even use ctx for setup logic
    const maxCount = ctx.max;

    return {
      increment: function() {
        // `this` gives you the CURRENT state at runtime
        const newCount = Math.min(this.count + 1, maxCount);
        return next({ count: newCount, max: this.max });
      }
    };
  }
);
```

### When to Use Each

| Scenario | Use |
|----------|-----|
| Access current state in transition | `this` |
| Setup constants/helpers in factory | `ctx` |
| Type inference for TypeScript | `ctx` |
| Access state that changes between calls | `this` |

---

## Common Pitfalls

### 1. Arrow Functions Break `this` Binding

**❌ WRONG:**
```typescript
const counter = createMachine({ count: 0 }, (ctx) => ({
  increment: () => {
    // `this` is NOT bound correctly with arrow functions!
    // `this` will be undefined or refer to outer scope
    return createMachine({ count: this.count + 1 }, this); // ERROR!
  }
}));
```

**✅ CORRECT:**
```typescript
const counter = createMachine({ count: 0 }, (next) => ({
  increment: function() {
    // Regular function allows proper `this` binding
    return next({ count: this.count + 1 });
  }
}));
```

**Why?** Arrow functions lexically bind `this` to the outer scope, preventing the library from binding it to the context.

### 2. Destructuring Loses `this` Binding

**❌ WRONG:**
```typescript
const counter = createMachine({ count: 0 }, (ctx) => ({
  increment: function() {
    return createMachine({ count: this.count + 1 }, this);
  }
}));

const { increment } = counter;
increment(); // ERROR! `this` is undefined
```

**✅ CORRECT:**
```typescript
// Call methods directly on the machine
counter.increment(); // Works!

// Or bind explicitly if you must destructure
const increment = counter.increment.bind(counter.context);
increment(); // Works!
```

### 3. Confusing `ctx` with `this`

**Common Mistake:**
```typescript
const counter = createMachine({ count: 0 }, (ctx) => ({
  increment: function() {
    // ❌ WRONG: ctx is the INITIAL context
    return createMachine({ count: ctx.count + 1 }, this);
    //                              ^^^ Always 0!
  }
}));

counter.increment(); // count becomes 1
counter.increment(); // count is STILL 1! (Bug!)
```

**Explanation:**
- `ctx` is captured from the factory function closure
- `ctx` always refers to the **initial context** `{ count: 0 }`
- `this` refers to the **current context** at runtime

**✅ CORRECT:**
```typescript
const counter = createMachine({ count: 0 }, (next) => ({
  increment: function() {
    // ✅ Use `this` to access current state
    return next({ count: this.count + 1 });
  }
}));
```

### 4. Passing `this` vs. Passing Transitions

When creating a new machine, the second argument should be `this` (the transitions object):

```typescript
const counter = createMachine({ count: 0 }, (next) => ({
  increment: function() {
    // ✅ Use `next` helper to create new machine with updated context
    return next({ count: this.count + 1 });
  },
  decrement: function() {
    return next({ count: this.count - 1 });
  }
}));
```

**What `this` refers to here:**
In the functional builder pattern, `this` refers to the **context object** (e.g., `{ count: 0 }`). The `next` function automatically handles passing the transitions object to `createMachine`.

This is why it works:
1. The factory function returns a transitions object: `{ increment: fn, decrement: fn }`
2. `createMachine` binds methods to context: `{ context: { count: 0 }, increment: fn, decrement: fn }`
3. When you call `counter.increment()`, inside the function `this` is bound to the transitions object
4. Passing `this` to the next `createMachine` preserves all the methods

---

## Avoiding `this` Entirely

If you prefer to avoid `this`, use the **functional pattern** with `createFunctionalMachine` or the curried form of `state()`:

### Functional Pattern (No `this` at all)

```typescript
import { state } from "@doeixd/machine";

// Call state() with only context to get a factory
const createCounter = state({ count: 0 });

// Pass pure transformer functions (no `this` needed!)
const counter = createCounter({
  increment: (ctx) => ({ count: ctx.count + 1 }),
  decrement: (ctx) => ({ count: ctx.count - 1 }),
  add: (ctx, n: number) => ({ count: ctx.count + n }),
  reset: (ctx) => ({ count: 0 })
});

// Use it the same way
counter.increment(); // Works!
counter.add(5); // Works!
```

### How It Works

The functional pattern:
1. Takes pure functions that receive context as the first parameter
2. Automatically wraps them to create new machines
3. No `this` binding needed - everything is explicit

### Comparison

**Functional Builder (uses `next`):**
```typescript
const counter = createMachine({ count: 0 }, (next) => ({
  increment: function() {
    return next({ count: this.count + 1 });
  }
}));
```

**Functional (no `this`):**
```typescript
const createCounter = state({ count: 0 });
const counter = createCounter({
  increment: (ctx) => ({ count: ctx.count + 1 })
});
```

**Benefits of Functional Pattern:**
- ✅ No `this` confusion
- ✅ Pure functions (easier to test)
- ✅ Can use arrow functions
- ✅ More functional programming style
- ✅ Explicit context parameter

**Drawbacks:**
- Slightly more verbose setup
- Two-step creation (factory + instantiation)

---

## Best Practices

### 1. Choose Your Pattern and Stick With It

**Option A: Functional with `next` (recommended for simple machines)**
```typescript
const machine = createMachine({ count: 0 }, (next) => ({
  increment: function() {
    return next({ count: this.count + 1 });
  }
}));
```

**Option B: Functional without `this` (recommended for complex logic)**
```typescript
const createMachine = state({ count: 0 });
const machine = createMachine({
  increment: (ctx) => ({ count: ctx.count + 1 })
});
```

### 2. Always Use Regular Functions with `this`

```typescript
// ✅ Good
{
  increment: function() { return next({ count: this.count + 1 }); }
}

// ❌ Bad (arrow function)
{
  increment: () => { return createMachine({ count: this.count + 1 }, this); }
}
```

### 3. Use `ctx` for Setup, `this` for State

```typescript
const machine = createMachine(
  { count: 0, max: 100 },
  (ctx) => {
    // Use `ctx` for setup logic that depends on initial values
    const maxValue = ctx.max;
    const step = Math.floor(ctx.max / 10);

    return {
      increment: function() {
        // Use `this` for accessing current state
        const newCount = Math.min(this.count + step, maxValue);
        return next({ count: newCount, max: this.max });
      }
    };
  }
);
```

### 4. Document When Using Closures

```typescript
const createCounter = (initialMax: number) => {
  return createMachine({ count: 0, max: initialMax }, (ctx) => {
    // Closure captures initialMax (never changes)
    const maxValue = initialMax;

    return {
      increment: function() {
        // `this.max` could change, but `maxValue` is fixed
        const newCount = Math.min(this.count + 1, maxValue);
        return next({ count: newCount, max: this.max });
      }
    };
  });
};
```

### 5. Type Annotations for Clarity

```typescript
type CounterContext = {
  count: number;
  max: number;
};

const counter = createMachine<CounterContext>(
  { count: 0, max: 10 },
  (ctx) => ({
    increment: function(): Machine<CounterContext> {
      // TypeScript knows `this` is CounterContext
      return next({ count: this.count + 1, max: this.max });
    }
  })
);
```

### 6. Testing Transitions

When testing, you can call transitions with explicit context:

```typescript
const transitions = {
  increment: function() {
    return createMachine({ count: this.count + 1 }, this);
  }
};

// Call with explicit context
const result = transitions.increment.call({ count: 5 });
expect(result.context.count).toBe(6);
```

---

## Summary

### Key Takeaways

1. **`this` is bound to the context object**, not the machine
2. **Use regular functions** (`function() {}`), not arrow functions
3. **`ctx` provides type info**, `this` provides runtime state
4. **`ctx` is the initial context**, `this` is the current context
5. **Functional pattern avoids `this` entirely** if you prefer

### Quick Reference

| What | When to Use |
|------|-------------|
| `this.count` | Access current state in transitions |
| `ctx.count` | Setup logic in factory function |
| `function() {}` | Required for proper `this` binding |
| `() => {}` | Only in functional pattern (no `this`) |
| Traditional pattern | Simple machines, familiar syntax |
| Functional pattern | Pure functions, no `this` confusion |

### Need Help?

- **Traditional pattern**: [See examples in README.md](../README.md)
- **Functional pattern**: [See createFunctionalMachine docs](../src/functional-combinators.ts)
- **Type-State programming**: [See Type-State guide](../README.md#type-state-programming)

---

**Related Documentation:**
- [Pattern Decision Guide](./patterns.md)
- [Core Principles](./principles.md)
- [API Reference](../README.md)
