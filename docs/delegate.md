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

### 1. Delegation with `union()`
Delegation works perfectly with multi-state machines. When the child state changes, the parent's reference to the child is updated, and the parent machine is automatically narrowed to the transitions of the new child state.

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

// Transitions flow through automatically!
const s1 = parent.activate(); // Parent is now in 'active' child state
const s2 = s1.inc();          // parent.child.count is 1
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
  ...d('counter', { prefix: 'cnt' }),
  ...d('form', { omit: ['reset'] })
};
```

### `delegateAll`
Delegates transitions from multiple keys at once.

```typescript
// Prefixes transitions with key name (e.g. counter_inc)
...delegateAll(ctx, ['counter', 'timer'], next, true)
```
