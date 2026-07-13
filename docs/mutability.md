# Guide to State Management: Mutability as a First-Class Pattern

A key feature of `@doeixd/machine` is its sophisticated and deliberate support for both **immutable** and **mutable** state management patterns. While many modern libraries enforce immutability, `@doeixd/machine` recognizes that for certain use cases—particularly in non-UI, performance-critical environments—a mutable approach is superior.

This guide provides an in-depth look at how the library purposefully enables mutability, why it's a powerful and "good" pattern in the right context, and how to leverage it effectively.

## How the Library Purposefully Enables Mutability

The ability to use mutable state is not an accident; it is a result of intentional design decisions in the library's core.

1.  **`createMachine` is Agnostic:** The core `createMachine(context, fns)` function does not clone or freeze the `context` object you provide. It uses the exact object reference, giving you full control over its lifecycle. If you pass in a mutable object, it remains mutable.

2.  **`MachineBase` Opts Out of Runtime Freezing:** In the `MachineBase` class, `Object.freeze()` is explicitly commented out. This is a clear signal that the library's author intended to allow property mutation. The `readonly` keyword on the `context` property is a **compile-time safeguard** against *reassignment* (`this.context = ...`), not a runtime block against *mutation* (`this.context.prop = ...`).

3.  **Flexible Transition Signatures:** The library's types require a transition to return a `Machine<C>`. This contract is fulfilled whether you return a `new` machine instance or `this` (the current instance), making both patterns type-safe and valid.

These decisions collectively create a flexible foundation where you, the developer, can choose the optimal state management strategy for your problem.

---

## The Mutable Pattern: A First-Class Approach for Performance and Simplicity

In a mutable pattern, the state machine is a single, long-lived, stateful object. Transitions modify this object's context directly and return a reference to the same object.

### How It Works: The Core Principle

A mutable transition follows two simple rules:
1.  **Mutate the context directly** using standard assignments (e.g., `this.context.count++`).
2.  **Return the same machine instance** by returning `this`.

#### Manual Example: A Mutable Counter

```typescript
import { createMachine } from '@doeixd/machine';

const mutableTransitions = {
  increment(this: { count: number }) {
    this.context.count++; // 1. Mutate context in place
    return this;   // 2. Return the same instance
  },
  add(this: { count: number }, n: number) {
    this.context.count += n;
    return this;
  }
};

const machine = createMachine({ count: 0 }, mutableTransitions);
const machineReference = machine; // Keep a reference to the original object

console.log('Initial count:', machine.context.count); // 0

// The transition mutates the machine in place
const nextState = machine.increment.call(machine);

console.log('Count after increment:', machine.context.count); // 1

// The original reference now points to the mutated state
console.log('Reference count:', machineReference.context.count); // 1

// The returned state is the exact same object in memory
console.log('Are they the same object?', nextState === machine); // true
```

### The Recommended Mutable Pattern: `createMutableMachine`

While the manual approach works, the library provides a more powerful and elegant primitive for this pattern in `src/multi.ts`: **`createMutableMachine`**. This helper is the official, recommended way to build mutable state machines, especially those using the Type-State paradigm.

**`createMutableMachine` works differently and more cleanly:**
-   You define "factories" for each state.
-   Inside these factories, your transitions become **pure functions that return the *next context data***, not a machine instance.
-   The `createMutableMachine` primitive handles the task of mutating the shared context for you.

#### Example 1: Type-State Authentication Flow

```typescript
import { createMutableMachine } from '@doeixd/machine';

type AuthContext =
  | { status: 'loggedOut'; error?: string }
  | { status: 'loggedIn'; username: string };

// 1. Define factories. Transitions are pure functions returning the next context object.
const authFactories = {
  loggedOut: (ctx: AuthContext) => ({
    context: ctx,
    login: (username: string) => ({ status: 'loggedIn', username }),
  }),
  loggedIn: (ctx: AuthContext) => ({
    context: ctx,
    logout: () => ({ status: 'loggedOut' }),
  }),
};

// 2. Create the mutable machine. It holds a single, mutable context object.
const authUser = createMutableMachine(
  { status: 'loggedOut' } as AuthContext, // Initial context
  authFactories,                           // Factories
  (ctx) => ctx.status                      // Discriminant accessor
);

console.log(authUser.status); // 'loggedOut'

// 3. Call a transition. The `authUser` object itself is mutated.
authUser.login('alice');

console.log(authUser.status); // 'loggedIn'
console.log(authUser.username); // 'alice'

// Type-State safety is preserved at runtime. This call would throw an error.
// authUser.login('bob'); // ❌ Throws: "[MutableMachine] Transition "login" is not valid..."
```

#### Example 2: Game State Management

This is a perfect use case for mutability. Creating new objects every frame (60 times per second) for player state would cause significant garbage collection pressure. A mutable machine is far more performant.

```typescript
import { createMutableMachine } from '@doeixd/machine';

type PlayerContext = {
  state: 'idle' | 'walking' | 'attacking';
  hp: number;
  position: { x: number; y: number };
};

const playerFactories = {
  idle: (ctx: PlayerContext) => ({
    context: ctx,
    walk: (dx: number, dy: number) => ({ ...ctx, state: 'walking', position: { x: ctx.position.x + dx, y: ctx.position.y + dy } }),
    attack: () => ({ ...ctx, state: 'attacking' }),
    takeDamage: (amount: number) => ({ ...ctx, hp: Math.max(0, ctx.hp - amount) }),
  }),
  walking: (ctx: PlayerContext) => ({
    context: ctx,
    stop: () => ({ ...ctx, state: 'idle' }),
  }),
  attacking: (ctx: PlayerContext) => ({
    context: ctx,
    finishAttack: () => ({ ...ctx, state: 'idle' }),
  }),
};

const player = createMutableMachine(
  { state: 'idle', hp: 100, position: { x: 0, y: 0 } },
  playerFactories,
  (ctx) => ctx.state
);

// Simulate a game loop where the `player` object is passed around or accessed globally.
function gameTick(input: 'move_right' | 'attack' | null) {
  if (player.state === 'idle') {
    if (input === 'move_right') player.walk(1, 0);
    if (input === 'attack') player.attack();
  } else if (player.state === 'attacking') {
    player.finishAttack();
  }

  // The player object reference never changes, but its properties are updated.
  console.log(`State: ${player.state}, HP: ${player.hp}, Pos: (${player.position.x}, ${player.position.y})`);
}

gameTick('move_right'); // State: walking, HP: 100, Pos: (1, 0)
gameTick(null);         // State: walking, HP: 100, Pos: (1, 0) (no change)
player.stop();
gameTick('attack');     // State: attacking, HP: 100, Pos: (1, 0)
gameTick(null);         // State: idle, HP: 100, Pos: (1, 0)
```

### Why the Mutable Pattern is "Good"

Choosing mutability is not a compromise; it's a powerful architectural choice with distinct advantages.

1.  **Peak Performance:** By mutating state in place, transitions avoid creating new objects. This results in **zero allocations** and **no garbage collection pressure**, which is critical in performance-sensitive hot paths like game loops, data stream processing, or high-frequency server logic.

2.  **Stable Object Reference:** This is a major architectural benefit. A single, stable object can be:
    -   Passed once to different parts of a system (e.g., physics, rendering, AI).
    -   Used easily with dependency injection frameworks.
    -   Referenced in event buses or callback systems without worrying about stale closures.
    -   Easier to integrate with legacy or OOP-style codebases that expect stateful objects.

3.  **Simplicity and Directness:** For many algorithms and stateful processes, direct mutation is the most natural and readable way to express the logic. It avoids the ceremony of functional updates (`{ ...state, prop: newValue }`) when you simply want to change a value.

### How Mutability Interacts with Library Features

-   **Type-State Programming**: Works perfectly. `createMutableMachine` performs runtime checks to ensure only valid transitions for the current state can be called. With TypeScript's `if` or `switch` narrowing, you get compile-time safety on top of that. You get the safety of Type-State with the performance of mutation.

-   **DSL Primitives (`describe`, `guarded`, etc.)**: These primitives preserve the wrapped function while attaching non-enumerable runtime metadata. This allows you to leverage the **runtime extraction** tools (`extractFromInstance`) to generate a statechart diagram from a live, mutable machine instance for debugging or documentation.

### Summary: Choosing Your Pattern

`@doeixd/machine` empowers you to choose the best strategy for your context.

| Feature | Immutable Pattern | Mutable Pattern |
| :--- | :--- | :--- |
| **Primary Domain** | **UI Frameworks**, General Apps | **Backend**, Game Loops, Scripts |
| **Core Action** | Returns a **new** instance | Mutates the **same** instance |
| **Performance** | Good (minor GC overhead) | **Excellent** (zero allocation) |
| **Object Reference**| Changes every transition | Stable and persistent |
| **Recommended Tool** | `createMachine`, `setContext` | `createMutableMachine` |

-   **Use the immutable pattern** for any front-end application involving a UI.
-   **Embrace the mutable pattern** for performance-critical, non-UI logic where a stable, stateful object simplifies your architecture.
