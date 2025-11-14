# Transition Binding Strategies

This document explains the two approaches for binding machine transitions to their context in generator-based flows.

## Problem

State machines require transitions to be called with the correct `this` context. When transitions are methods that expect `this: ContextType`, calling them directly on the machine fails because the bound `this` becomes the machine object (with `{ context, ...transitions }`), not the raw context.

```typescript
type CounterContext = { count: number };

const counter = createMachine({ count: 0 }, {
  increment(this: CounterContext) {
    return createCounter(this.count + 1);
  }
});

// ❌ Type error: this is the machine, not CounterContext
m.increment();

// ✅ Workaround: explicit .call() binding
m.increment.call(m.context);
```

## Solution 1: `bindTransitions()` - Proxy-based

A lightweight Proxy wrapper that auto-binds transitions to context. **Now includes recursive re-wrapping** for seamless chaining.

### Usage

```typescript
import { bindTransitions } from '@doeixd/machine';

const counter = bindTransitions(createCounter(0));

const result = run(function* (m) {
  m = yield* step(m.increment());  // ✅ No .call() needed
  m = yield* step(m.add(5));       // ✅ Binding maintained
  return m.context.count;
}, counter);
```

### Advantages

- **Minimal syntax** - Just call transitions directly
- **Low overhead** - Simple Proxy wrapper with no extra objects
- **Backward compatible** - Transparent drop-in wrapper
- **Auto re-wrapping** - Returned machines are automatically re-wrapped

### Disadvantages

- **Type safety** - TypeScript can't verify the binding (Proxy limitation). IDE may show errors despite working at runtime.
- **Less IDE support** - Reduced autocompletion and hover information due to Proxy's type erasure

### Implementation Detail

The Proxy intercepts property access and:
1. Checks if the property is a function (transition method)
2. Wraps it to call `.apply(target.context, args)`
3. Recursively re-wraps any returned machines to maintain binding across chains
4. Returns non-function properties unchanged

```typescript
export function bindTransitions<M extends { context: any }>(machine: M): M {
  return new Proxy(machine, {
    get(target, prop) {
      const value = target[prop as keyof M];
      
      if (typeof value === 'function') {
        return function(...args: any[]) {
          const result = value.apply(target.context, args);
          // Recursively wrap returned machines
          if (result && typeof result === 'object' && 'context' in result) {
            return bindTransitions(result);
          }
          return result;
        };
      }
      
      return value;
    },
  }) as M;
}
```

## Solution 2: `BoundMachine<M>` - Class-based

A strongly-typed wrapper class that preserves full TypeScript type safety while providing the same auto-binding functionality.

### Usage

```typescript
import { BoundMachine } from '@doeixd/machine';

const counter = new BoundMachine(createCounter(0));

const result = run(function* (m) {
  m = yield* step(m.increment());  // ✅ Full type safety!
  m = yield* step(m.add(5));       // ✅ IDE autocompletion works
  return m.context.count;
}, counter);
```

### Advantages

- **Full type safety** - TypeScript verifies binding correctness
- **Better IDE support** - Autocompletion and hover information preserved
- **Auto re-wrapping** - Returned machines are automatically re-wrapped
- **Explicit** - Clear that you're using a wrapper

### Disadvantages

- **Verbose** - Requires `new BoundMachine(m)` instead of function call
- **Not transparent** - Technically a different object type (though Proxy-ified)
- **Slightly more overhead** - Creates a class instance + Proxy

### Implementation Detail

Uses a Proxy inside the constructor to intercept property access:

```typescript
export class BoundMachine<M extends { context: any }> {
  private readonly wrappedMachine: M;
  [key: string | symbol]: any;

  constructor(machine: M) {
    this.wrappedMachine = machine;

    return new Proxy(this, {
      get: (target, prop) => {
        if (prop === 'wrappedMachine' || prop === 'context') {
          return Reflect.get(target, prop);
        }

        const value = this.wrappedMachine[prop as keyof M];

        if (typeof value === 'function') {
          return (...args: any[]) => {
            const result = value.apply(this.wrappedMachine.context, args);
            if (result && typeof result === 'object' && 'context' in result) {
              return new BoundMachine(result);
            }
            return result;
          };
        }

        return value;
      },
    }) as any;
  }

  get context(): M extends { context: infer C } ? C : never {
    return this.wrappedMachine.context;
  }
}
```

## Comparison

| Feature | `bindTransitions()` | `BoundMachine<M>` |
|---------|-------------------|------------------|
| Syntax | Function call | Class constructor |
| Type Safety | Proxy-limited | Full TypeScript support |
| IDE Support | Reduced | Full autocompletion |
| Re-wrapping | ✅ Automatic | ✅ Automatic |
| Overhead | Minimal | Class + Proxy |
| Transparency | ✅ Drop-in wrapper | ❌ Different type |
| Return Type | `M as M` | `BoundMachine<M>` |

## Recommendation

- **Use `bindTransitions()`** if you prefer minimal syntax and can ignore type warnings
- **Use `BoundMachine<M>`** if you value type safety and IDE support

Both implement recursive re-wrapping, so chaining works seamlessly in either case.

## See Also

- The `call()` utility function for explicit context binding without wrapping
- Generator-based flows in `src/generators.ts`
