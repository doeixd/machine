# The Evolution of Machine: Type-State Programming

This document outlines the major refinements and new features introduced to the `@doeixd/machine` library. These changes focus on achieving **perfect type safety**, **zero boilerplate**, and **universal compatibility**.

## 🎯 The "Why" - Core Philosophy

The primary driver behind these updates is the shift towards **Type-State Programming**. 

In traditional state machine libraries (including earlier versions of this one), states are often treated as data. In Type-State Programming, **states are represented as distinct types**.

- **Impossible States are Unrepresentable**: If a property only exists in a `loading` state, TypeScript will prevent you from accessing it in an `idle` state.
- **Impossible Transitions are Immutable**: If a `login` transition only belongs to the `unauthenticated` state, the compiler won't even show you that method when you're in the `authenticated` state.

---

## ⚡ New Features & Submodules

### 1. Minimal API (`@doeixd/machine/minimal`)
A high-performance core optimized for Type-State Programming.
- **Rationale**: The main library is powerful but can be heavy for simple components. Minimal provides "magic" inference where the entire state machine signature is derived from your implementation.
- **Key Primitives**: `machine()`, `factory()`, `union()`.

### 2. State Mapping (`States<M>`)
The most ergonomic way to define tagged unions.
- **Rationale**: Writing unions manually (`| { tag: 'a' } | { tag: 'b' }`) is repetitive and error-prone. `States` allows you to define a mapping from tags to data objects.
- **Example**:
  ```typescript
  type AppState = States<{ idle: {}, active: { id: string } }>;
  ```

### 3. Tagging Ergonomics (`tag`, `tag.factory`)
- **Rationale**: Creating tagged objects manually is tedious. `tag()` ensures literal narrowing. `tag.factory()` provides pre-bound, curried factories that integrate perfectly with `States`.
- **Benefit**: No more magic strings in your transitions.

### 4. Universal Delegation (`@doeixd/machine/delegate`)
- **Rationale**: Composition is often the hardest part of state machines. `delegate()` allows child machine transitions to be surfaced directly on the parent.
- **Improvement**: We refactored delegation to be "shape-agnostic," meaning it works with both the main library and the minimal module.

### 5. Multi-State Dispatch (`union`)
- **Rationale**: Building branching logic within a single factory often leads to complex `if/else` or `switch` blocks. `union()` provides a declarative way to route transitions to specific sub-factories based on the state tag.

## 🔄 Before & After: The Shift in Ergonomics

The following comparisons show how the new utilities significantly reduce boilerplate while improving type safety.

### 1. Defining States
The `States<M>` utility converts a flat mapping into a strict tagged union, making the intent much clearer.

````carousel
```typescript
// ❌ BEFORE: Manual Union Boilerplate
type AuthState = 
  | { readonly tag: "out" }
  | { readonly tag: "in"; user: string; role: 'admin' | 'user' }
  | { readonly tag: "error"; message: string };
```
<!-- slide -->
```typescript
// ✅ AFTER: Ergonomic Mapping
type AuthState = States<{
  out: {},
  in: { user: string; role: 'admin' | 'user' },
  error: { message: string }
}>;
```
````

### 2. Creating State Objects
`tag.factory` removes the need for magic strings and manual property spreading in your transitions.

````carousel
```typescript
// ❌ BEFORE: Manual Tagging
login: (user: string) => next({ 
  tag: 'in', 
  user, 
  role: 'user' 
})
```
<!-- slide -->
```typescript
// ✅ AFTER: Semantic Factories
const authenticated = tag.factory<AuthState>()('in');

login: (user: string) => next(authenticated({ 
  user, 
  role: 'user' 
}))
```
````

### 3. Multi-State Branching
The `union` factory replaces manual routing logic with a declarative, narrowed structure.

````carousel
```typescript
// ❌ BEFORE: Manual Routing
const fetch = machine(ctx, (c, next) => {
  if (isState(c, 'idle')) {
    return { run: () => next(...) };
  }
  if (isState(c, 'loading')) {
    return { stop: () => next(...) };
  }
  return {};
});
```
<!-- slide -->
```typescript
// ✅ AFTER: Declarative Union
const fetch = union<State>()({
  idle: (c, next) => ({ 
    run: () => next(...) 
  }),
  loading: (c, next) => ({ 
    stop: () => next(...) 
  })
});
```
````

---

## 📊 Comparison: Main vs. Minimal

| Feature | Main Library (`@doeixd/machine`) | Minimal API (`.../minimal`) |
| :--- | :--- | :--- |
| **Primary Goal** | Feature-rich, established, object-based | High-performance, type-state focused |
| **Inference** | Strong, but may need hints | "Magic" (Zero manual generics) |
| **Boilerplate** | Low | Near Zero |
| **Performance** | Excellent | Optimal (Flat objects) |
| **Overhead** | Minimal | Zero (Direct function calls) |
| **Best For** | Complex app-level machines | Component states, local flows |

---

## 🛠 Centralization and Type Safety

We consolidated the foundations into `src/types.ts`. This ensures:
1. **Consistency**: `isState(m, 'tag')` works regardless of which module you use.
2. **Maintenance**: Core tagging logic is in one place.
3. **Safety**: Every utility now supports literal narrowing by default.

This architecture ensures that as the library grows, the core remains lightweight and the specialized submodules remain perfectly compatible.
