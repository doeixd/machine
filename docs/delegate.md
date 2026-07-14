# Machine Delegation

The `@doeixd/machine/delegate` submodule provides utilities for composing complex machines by forwarding child machine transitions to the parent level. This enables a "flat" composition style where children act like local sub-states.

## Why Delegation?

Traditionally, child machines are either namespaced (e.g., `parent.child.inc()`) or managed manually. Delegation allows you to surface child transitions directly on the parent (e.g., `parent.inc()`) while automatically handling the state update of both the child and the parent.

## Core API: `delegate()`

The `delegate` function is designed to be used inside a machine factory's spread operator.

```typescript
import { machine } from "@doeixd/machine/minimal";
import { delegate } from "@doeixd/machine/delegate";

// A reused child machine
const counter = (ctx: { count: number }) => machine(ctx, (c, next) => ({
  inc: () => next({ count: c.count + 1 })
}));

// Parent machine delegating to the child
const parent = machine({ 
  name: 'App', 
  child: counter({ count: 0 }) 
}, (ctx, next) => ({
  // Forward all 'child' transitions to the parent level
  ...delegate(ctx, 'child', next),
  
  rename: (name: string) => next({ ...ctx, name })
}));

// 'inc' is now available directly on the parent!
const nextParent = parent.inc();
console.log(nextParent.child.count); // 1
```

## Selective Delegation

You can pick, omit, or rename transitions to avoid collisions or hide implementation details.

### Picking
```typescript
// Only delegate 'inc', not 'dec'
...delegate(ctx, 'child', next, { pick: ['inc'] })
```

### Omitting
```typescript
// Delegate everything EXCEPT 'reset'
...delegate(ctx, 'child', next, { omit: ['reset'] })
```

### Renaming
```typescript
// Delegate 'inc' as 'incrementChild'
...delegate(ctx, 'child', next, { rename: { inc: 'incrementChild' } })
```

### Delegation with typestate children

Delegation correctly replaces a child when its transition produces another typestate. However, one parent factory still has one statically inferred transition shape: delegation does not automatically derive a new parent API from the returned child's branch. If the parent API must narrow with the child, define the parent as a corresponding typestate union and use `delegate` as the runtime wiring in each branch.

```typescript
import { machine, union, tag } from "@doeixd/machine/minimal";
import { delegate } from "@doeixd/machine/delegate";

// Define a multi-state child
type ChildState = { tag: 'idle' } | { tag: 'active'; count: number };
const childFlow = union<ChildState>()({
  idle: (c, next) => ({ activate: () => next(tag('active', { count: 0 })) }),
  active: (c, next) => ({ inc: () => next(tag('active', { count: c.count + 1 })) })
});

// Parent delegating to the union machine
const parent = machine({ 
  child: childFlow(tag('idle')) 
}, (ctx, next) => ({
  ...delegate(ctx, 'child', next)
}));

// Runtime replacement works: the returned parent contains the active child.
const activeParent = parent.activate();
console.log(activeParent.child.tag); // active
```

## Universal Compatibility

The `delegate` module is **shape-agnostic**. It works perfectly with:
- `createMachine()` from the main library.
- `machine()` from the minimal library.
- Even hybrid projects that use both!

## Utilities

### `createDelegate`
Creates a bound helper to reduce repetition when delegating several properties.

```typescript
const d = createDelegate(ctx, next);
return {
  ...d('auth'),
  ...d('counter', { rename: { increment: 'incrementCounter' } }),
  ...d('form', { omit: ['reset'] })
};
```

### `delegateAll`
Delegates transitions from multiple keys at once.

```typescript
// Prefixes transitions with key name (e.g. counter_inc)
...delegateAll(ctx, ['counter', 'timer'], next, true)
```

Prefer prefix mode when child transition names may overlap. Without prefixes, a later child silently replaces an earlier transition with the same name.
