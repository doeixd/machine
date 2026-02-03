# Tagged Helpers & Utilities

This library provides a set of lightweight utilities for working with tagged unions and state machines. These helpers are available in both the main library and the `@doeixd/machine/minimal` module.

## `tag()`

The `tag` function is a helper for creating tagged objects. It ensures that the `tag` property is correctly treated as a literal type by TypeScript, which is essential for pattern matching and state narrowing.

### Basic Tagging
```typescript
import { tag } from "@doeixd/machine";

const state = tag('idle'); 
// { tag: 'idle' }
```

### With Data
```typescript
const state = tag('loading', { url: '/api' });
// { tag: 'loading', url: '/api' }
```

### From Object
You can also use it to ensure an existing object is treated as a literal tag.
```typescript
const state = tag({ tag: 'success', data: 'ok' });
```

### `tag.factory()`

Creates a reusable factory for a specific tagged state. This is highly ergonomic when you need to create the same state multiple times, particularly inside machine transitions.

```typescript
import { tag, type States } from "@doeixd/machine";

// 1. Define your states
type AppState = States<{
  idle: { count: number };
  active: { count: number; user: string };
}>;

// 2. Create factories (using the curried version for unions)
const idle = tag.factory<AppState>()('idle');
const active = tag.factory<AppState>()('active');

// 3. Use in transitions
const nextState = idle({ count: 10 }); 
// { tag: 'idle', count: 10 }
```

---

## `isState()`

A type guard for checking the current state of a machine or tagged object. It narrows the type within the conditional block.

```typescript
import { isState } from "@doeixd/machine";

if (isState(machine, 'loading')) {
  // TypeScript knows machine is { tag: 'loading', url: string }
  console.log(machine.url);
}
```

---

## `freeze()`

Recursively freezes an object and all of its properties. Useful for ensuring immutability of context or machines.

```typescript
import { freeze } from "@doeixd/machine";

const ctx = freeze({ 
  user: { id: 1, name: 'Alice' } 
});

// ctx.user.name = 'Bob'; // ❌ Throws error in strict mode
```

---

## Type Utilities

### `Context<M>`
Extracts the context type from a machine. Works with both regular `Machine` and minimal `Machine`.
```typescript
import { type Context } from "@doeixd/machine";
type MyContext = Context<typeof myMachine>;
```

### `Transitions<M>`
Extracts the transition signatures from a machine.
```typescript
import { type Transitions } from "@doeixd/machine";
type MyTransitions = Transitions<typeof myMachine>;
```

### `InferMachine<F>` / `MachineOf<F>`
Extracts the return type from a machine factory.
```typescript
import { type MachineOf } from "@doeixd/machine";
type MyMachine = MachineOf<typeof createMyMachine>;
```

### `UnionOf<F>` (Minimal only)
Extracts the union of all possible states from a `union` factory.
```typescript
import { union, type UnionOf } from "@doeixd/machine/minimal";

const auth = union<State>()({ ... });
type AuthMachine = UnionOf<typeof auth>;
```

### `States<M>`
A powerful utility to define a tagged union from a mapping of tags to data objects. This is much more ergonomic than writing unions manually.

```typescript
import { type States } from "@doeixd/machine";

type PickMode = States<{
  idle: {},
  active: { isCloseMode: boolean; timeoutId: number }
}>;

// Explicit union for comparison:
// type PickMode = 
//   | { readonly tag: "idle" }
//   | { readonly tag: "active"; isCloseMode: boolean; timeoutId: number };
```
