# Minimal API

The `@doeixd/machine/minimal` submodule provides the most lightweight and high-performance way to build state machines in TypeScript. It is specifically designed for **Type-State Programming**, where states are represented by distinct types.

## Key Features

- **Perfect Inference**: No manual generic type parameters required. Everything is derived from your code.
- **Zero Boilerplate**: Minimal surface area with just one core factory.
- **High Performance**: Flat objects with no runtime interpretation overhead.
- **Immutable by Design**: Pure transitions return new states.

## Basic Usage

The core of the minimal API is the `machine` factory.

```typescript
import { machine } from "@doeixd/machine/minimal";

const counter = machine({ count: 0 }, (ctx, next) => ({
  inc: () => next({ count: ctx.count + 1 }),
  dec: () => next({ count: ctx.count - 1 }),
  add: (n: number) => next({ count: ctx.count + n })
}));

// Transitions are perfectly inferred on the resulting machine
const result = counter.inc().add(5);
console.log(result.count); // 6
```

## Type-State Programming (Multi-State Machines)

The `union` function is the primary tool for building multi-state machines. It routes to different transition factories based on the `tag` of the context, and provides a recursive `next` function that can transition to any state in the union.

```typescript
import { union, tag, type States } from "@doeixd/machine/minimal";

// 1. Define your States (ergonomic mapping)
type State = States<{
  idle: {},
  loading: { url: string },
  success: { data: string }
}>;

// 2. Create factories
const idle = tag.factory<State>()('idle');
const loading = tag.factory<State>()('loading');
const success = tag.factory<State>()('success');

// 3. Create the Union Factory
const fetchFlow = union<State>()({
  idle: (ctx, next) => ({
    fetch: (url: string) => next(loading({ url }))
  }),
  loading: (ctx, next) => ({
    succeed: (data: string) => next(success({ data })),
    fail: () => next(idle({}))
  }),
  success: (ctx, next) => ({
    reset: () => next(idle({}))
  })
});

// 4. Usage - Transitions are perfectly narrowed
const s1 = fetchFlow(idle({}));
const s2 = s1.fetch('/api'); 
const s3 = s2.succeed('result');
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
