# From First Principles: A Pure FSM Core

This library is built on a simple, powerful idea: **a state machine is just a state object and a set of functions that produce the next state.** This isn't an abstraction; it's a direct implementation of the mathematical definition of a Finite State Machine (FSM). By adhering to this pure, minimal model, we gain tremendous power and simplicity.

Let's map our core API directly to the formal FSM tenets:

| Formal Tenet | `@doeixd/machine` Implementation |
| :--- | :--- |
| **S** (Finite States) | The machine's `context` object, often combined with its TypeScript `type`. `S` is the set of all possible `context` values or the union of all machine types. |
| **s₀** (Initial State) | The initial `context` object passed to `createMachine()`. |
| **Σ** (Input Alphabet) | The **method names** on the machine object (e.g., `'increment'`, `'login'`). The arguments to these methods are the input's payload. |
| **δ** (Transition Function) | **Each method itself is a transition function**. It takes the current state (`this.context`) and an input (arguments) and returns the next state (`Machine<C>`). |
| **Markov Property** | Transitions are pure functions that only depend on the current state (`this.context`) and input (`...args`), not on history. This is naturally enforced. |

### Why This Simplicity is Powerful

This "first principles" approach allows us to avoid many complex concepts and boilerplate found in other libraries, providing a more direct and ergonomic experience for the 80% of common use cases.

#### 1. No Magic Strings, Just Typed Functions

Many state machine libraries rely on string-based events and message passing:

```typescript
// ❌ The "stringly-typed" approach
interpreter.send({ type: "INCREMENT", value: 1 });
```

This pattern can lead to typos, makes refactoring difficult, and breaks IDE autocompletion. Our approach avoids this entirely:

```typescript
// ✅ Direct, type-safe method calls
const next = machine.increment(1);
```

**Transitions are just method calls.** This means:
- **Full Type Safety:** The TypeScript compiler knows if `increment` exists and what arguments it expects.
- **Effortless Refactoring:** Renaming a transition method automatically updates all call sites.
- **Superior Autocomplete:** Your IDE knows exactly which transitions are valid for the current state.

#### 2. Less Ceremony, More Flexibility

Concepts like *Guards*, *Actions*, and *Services* are not special primitives in our core API because they don't need to be. You can implement them with plain TypeScript, giving you full control:

- **A Guard is an `if` statement:**
  ```typescript
  adminAction: function() {
    if (!this.user.isAdmin) {
      return this; // Stay in the same state
    }
    return createAdminMachine();
  }
  ```
- **An Action is a function call:**
  ```typescript
  login: function(user) {
    analytics.track("login"); // Your action
    return createLoggedInMachine(user);
  }
  ```

By not building these concepts into the core, the library remains minimal, unopinionated, and flexible. You use the full power of TypeScript to model your logic, not a limited DSL.

### The Trade-Off: Static Analysis

This lean, function-based approach comes with one primary trade-off: **it's harder to statically analyze.**

Because your transitions are defined as imperative code inside functions, it's difficult for an automated tool to inspect your machine and generate a complete statechart diagram. A declarative configuration object (like in XState) is essentially data, making it trivial for a tool to read. Code is not data.

**This is a deliberate design choice.** We prioritize developer ergonomics, type safety, and flexibility for the most common scenarios.

For the 20% of cases where you *do* need formal statechart generation for visualization or analysis, we provide an escape hatch: the **type-level metadata primitives** in `@doeixd/machine/primitives`. This advanced feature lets you annotate your transitions with metadata that our static analysis script (`src/extract.ts`) can read, giving you the best of both worlds without complicating the core API.

In summary, `@doeixd/machine` provides a pure, pragmatic, and type-safe FSM implementation that gives you exactly what you need for most tasks, and nothing you don't.