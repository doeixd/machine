# Minimal API

The `@doeixd/machine/minimal` submodule provides the most lightweight and high-performance way to build state machines in TypeScript. It is specifically designed for **Type-State Programming**, where states are represented by distinct types.

## Key Features

- **Perfect Inference**: No manual generic type parameters required. Everything is derived from your code.
- **Zero Boilerplate**: Minimal surface area with just one core factory.
- **High Performance**: Flat objects with no runtime interpretation overhead.
- **Immutable by Design**: Pure transitions return new states.

---

## Choosing your Tool: `machine()` vs `union()`

- **`machine()`** is for **Single-State** shapes. Use it when your machine has a consistent set of data and transitions throughout its life (like a simple Counter).
- **`union()`** is for **Multi-State** shapes. Use it when different states have different data and different transitions (like a Fetch Flow or Auth Flow).

---

## 🔬 Full Lifecycle Example

The following example demonstrates the complete journey: from defining the state mapping to instantiating with `union()`, performing transitions, and finally consuming the state with `match()`.

```typescript
import { union, tag, type States, match, type UnionOf } from "@doeixd/machine/minimal";

// 1. Define States (the mapping)
type State = States<{
  idle: {},
  loading: { url: string },
  success: { data: string }
}>;

// 2. Define the Machine Blueprint
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

// 3. Instantiate
// Pass the initial context to the union factory to get your machine instance
const machine = fetchFlow(tag('idle'));

// 4. Transition
const loadingMachine = machine.fetch('/api/data');
console.log(loadingMachine.tag); // 'loading'

// 5. Match (Consume)
const ui = match(loadingMachine, {
  idle: () => "Ready",
  loading: (s) => `Loading ${s.url}...`,
  success: (s) => `Data: ${s.data}`
});

// 6. Type Utility: UnionOf<F>
// AuthMachine is the union of all possible machine shapes returned by the factory.
// It is NOT a union of contexts; it's a union of (Context & Transitions).
type FetchMachine = UnionOf<typeof fetchFlow>;
```

## Reusable Factories

Use the `factory` utility to create reusable machine blueprints.

```typescript
import { factory } from "@doeixd/machine/minimal";

const counterFactory = factory<{ count: number }>()((ctx, next) => ({
  inc: () => next({ count: ctx.count + 1 }),
  reset: () => next({ count: 0 })
}));

const a = counterFactory({ count: 10 });
const b = counterFactory({ count: 100 });
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
