# Understanding `this` in @doeixd/machine

The library now binds every transition function to the **machine instance**. That means `this` gives you full access to the machine (including `this.context` and every other transition), no matter whether you authored the machine with plain objects, functional builders, or helper factories. This guide explains what that means in practice, how the runtime keeps bindings consistent, and how to avoid the few remaining pitfalls.

## Table of Contents

- [1. The Short Version](#1-the-short-version)
- [2. How Binding Works](#2-how-binding-works)
- [3. Factory & Builder Patterns](#3-factory--builder-patterns)
- [4. Context Helpers (`setContext`, `next`)](#4-context-helpers-setcontext-next)
- [5. Common Pitfalls](#5-common-pitfalls)
- [6. Testing & Manual Invocation](#6-testing--manual-invocation)
- [7. Best Practices](#7-best-practices)

---

## 1. The Short Version

```ts
const counter = createMachine({ count: 0 }, (next) => ({
  increment() {
    // `this` === the current machine (not just the raw context object)
    console.log(this.context.count); // 0
    const after = next({ count: this.context.count + 1 });
    // You can immediately call other transitions
    return after;
  },
  reset() {
    return next({ count: 0 });
  }
}));

counter.increment().reset();
```

- You always read data through `this.context`.
- You can safely call `this.otherTransition()` because `this` is the machine.
- Helper functions like `setContext`/`next` keep those bindings intact when they clone machines.

---

## 2. How Binding Works

When a machine is created, the runtime stores the original transition map and binds every function to the machine object. Whenever a helper needs to clone the machine (e.g. `setContext`, `next`, `createMachine(newContext, machine)`), it reuses that same transition map so the new instance behaves exactly like the previous one.

### Invocation Lifecycle

1. You call `machine.transition(args)`.
2. The library invokes the transition with `fn.apply(machine, args)`.
3. Inside the function, `this === machine`, so `this.context` is the live state and `this.otherTransition` is callable.
4. Returning a new machine (via `createMachine`, `next`, or helper factories) automatically keeps the same binding model.

Because `this` is the machine, you never have to worry about whether a transition was authored using a closure-based builder or a simple object literal—everything behaves the same at runtime.

---

## 3. Factory & Builder Patterns

The builder/factory APIs still exist to give TypeScript strong inference, but they no longer change the `this` semantics.

```ts
const createCounter = createMachineFactory<{ count: number }>()({
  increment(ctx) {
    return { count: ctx.count + 1 };
  }
});

const counter = createCounter({ count: 0 });
counter.increment(); // `this` is the machine, increment uses ctx for typing
```

- **`ctx` arguments** (from factory callbacks) are a *type-time* construct. They help TypeScript infer shapes but do not replace `this`.
- **`this.context`** is always the runtime truth. If context changes, `this.context` reflects the latest data.
- **Calling other transitions** is supported in every pattern because `this` always has the transition methods attached.

---

## 4. Context Helpers (`setContext`, `next`)

`setContext` and `next` create new machine instances. Before the binding overhaul, these helpers could accidentally freeze builder-style machines to the old context because their transitions were already bound. The runtime now stores the canonical transition map, so both helpers behave consistently.

```ts
const counter = createMachine({ count: 1 }, (next) => ({
  increment() {
    return next({ count: this.context.count + 1 });
  },
}));

const updated = setContext(counter, { count: 10 });
updated.increment().context.count; // 11

const iced = next(counter, (ctx) => ({ count: ctx.count + 5 }));
iced.increment().context.count; // 7
```

You can rely on these helpers to keep transitions usable regardless of how the machine was authored.

---

## 5. Common Pitfalls

| Pitfall | Why It Happens | Fix |
|--------|----------------|-----|
| **Arrow functions for transitions** | Arrow functions capture `this` lexically, preventing the runtime from rebinding it to the machine. | Use `function () { ... }` declarations for transitions. |
| **Manually binding to raw contexts** | Calling `fn.call(machine.context)` bypasses the binding system. | Use the machine instance (`fn.call(machine, …)`) or helper utilities (`call`, `bindTransitions`, `callWithContext`). |
| **Mutating `this.context` directly** | You’ll mutate the current instance but still return a new one, leading to confusing state. | Prefer immutable helpers (`next`, `setContext`) unless you intentionally return `this` for a mutable pattern. |

---

## 6. Testing & Manual Invocation

In tests you sometimes need to call a transition with a custom context or machine. The recommended tools are:

```ts
import { call, bindTransitions, callWithContext } from '@doeixd/machine';

call(machine.increment, machine);              // Bind to machine
callWithContext(machine, 'increment');         // Legacy helper for context-only binding
const bound = bindTransitions(createMachine(...));
bound.increment();                             // Proxy that auto-binds everything
```

`callWithContext` keeps backward compatibility for older code that expects `this === { context }`, but new code should prefer passing the machine.

---

## 7. Best Practices

1. **Use `function` declarations for transitions** so the runtime can bind `this`.
2. **Read state through `this.context`**, not through captured variables that might become stale.
3. **Call other transitions via `this.otherTransition()`** when it makes the intent clearer—this now works everywhere.
4. **Use `next`/`setContext`/`createMachine(newContext, machine)`** for immutable updates. They keep the transition set intact.
5. **Reach for builder/factory helpers for type inference**, not for different runtime semantics.
6. **Use `bindTransitions` or `call` in tests** when you need to invoke transitions manually.

With these rules, every machine—simple or complex—behaves the same way: `this` is the machine, `this.context` holds the current state, and binding stays consistent across clones.
