# Minimal API

The `@doeixd/machine/minimal` submodule provides the most lightweight and high-performance way to build state machines in TypeScript. It is specifically designed for **Type-State Programming**, where states are represented by distinct types.

## Key Features

### 1. Magic Type Inference
The library provides perfect type inference through its factory utilities. While the core `machine()` primitive uses `any` in its internal feedback loop to break recursion, the higher-level `factory()` and `union()` utilities implement a named recursive pattern that ensures transitions return the exact machine type—**no `any` in your transition chains.**

---

## Choosing your Tool: `machine()` vs `factory()` vs `union()`

- **`machine()`**: The 10-line primitive. Great for one-off machines where you don't need to chain transitions or where `any` in the return type is acceptable.
- **`factory()`**: The recommended way to build **Single-State** machines. Provides perfect inference for chained transitions.
- **`union()`**: The recommended way to build **Multi-State** machines. Provides perfect inference across all states.

---

## 🔬 Full Type-Safe Example

The following example shows how to build a multi-state machine with perfect type safety using `union()` and `States`.

```typescript
import { union, tag, type States, match, type UnionOf } from "@doeixd/machine/minimal";

// 1. Define Contexts
type State = States<{
  idle: {},
  loading: { url: string },
  success: { data: string }
}>;

// 2. Define the Machine Blueprint
// Transitions are perfectly typed! No 'any' here.
const fetchFlow = union<State>()({
  idle: (ctx, next) => ({
    fetch: (url: string) => next(tag('loading', { url }))
  }),
  loading: (ctx, next) => ({
    succeed: (data: string) => next(tag('success', { data })),
    fail: () => next(tag('idle'))
  }),
  success: (ctx, next) => ({
    reset: () => next(tag('idle'))
  })
});

// 3. Perfect Inference in Action
const m = fetchFlow(tag('idle'));

// m.fetch() returns a Machine of the 'loading' type.
// You can chain transitions without losing type safety.
const end = m.fetch('/api').succeed('Done').reset();
console.log(end.tag); // 'idle'
```

## Perfect Single-State Inference

For simple machines, use `factory()` to avoid `any` in your transitions.

```typescript
import { factory } from "@doeixd/machine/minimal";

const counterFactory = factory<{ count: number }>()((ctx, next) => ({
  inc: () => next({ count: ctx.count + 1 }),
  noop: () => next(ctx)
}));

const counter = counterFactory({ count: 0 });

// Perfect chaining!
const val = counter.inc().inc().noop().count; // 2
```

## Pattern Matching

The minimal submodule includes a lightweight `match` utility for exhaustive checking of tagged unions.

```typescript
import { match } from "@doeixd/machine/minimal";

const message = match(currentMachine, {
  idle: () => "Ready",
  loading: (s) => `Fetching ${s.url}...`,
  success: (s) => `Got ${s.data}`
});
```
