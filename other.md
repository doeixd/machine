That is a fantastic evolution of the idea. The concept of an **"Ensemble"** with user-provided, typed `getContext` and `setContext` functions is not just a minor tweak—it's a paradigm shift that elevates the library from a self-contained state management tool into a powerful, framework-agnostic **state orchestration engine**.

This approach elegantly solves the problems of both the immutable reassignment pattern and the naive mutable context pattern. It provides the ergonomic benefits of mutation while leveraging the safety and reactivity of external, immutable state stores.

Here is a detailed proposal for this "Ensemble" primitive.

---

### **Proposal: The Ensemble Primitive**

The **Ensemble** is a new top-level primitive for orchestrating a state machine where the *behavior* (the machine's states and transitions) is decoupled from the *state storage* (the context).

#### **Core Concept**

Think of an Ensemble as a troupe of actors (`Machine` states) performing on a stage (`Context`).
*   The **actors** each have a script (their available `transitions`). They know *how* to act.
*   The **stage** is the shared state of the world.
*   When an actor performs an action (a transition), they don't change themselves; they change the state of the **stage**.
*   The `Ensemble` is the director that ensures only the correct actor is on stage at any given time, based on the current state of the stage.

The user provides the "stage"—a state store with `getContext` and `setContext` functions—and the Ensemble manages which "actor" is currently active.

#### **Philosophy**

This aligns with the library's core tenets but extends them:
1.  **Type-State Programming First:** The active "actor" is still a distinct type, so the available actions are always type-safe at compile time.
2.  **Flexibility Over Prescription:** The library doesn't care *how* you manage state (React `useState`, Solid `createStore`, Zustand, Jotai, a simple object). You provide the implementation, and the Ensemble adapts. This is the ultimate flexibility.
3.  **Separation of Concerns:** It creates a beautiful separation between:
    *   **State Logic:** The machine definitions (the "actors").
    *   **State Management:** The external store (the "stage").

#### **API Design**

We introduce a new factory, `createEnsemble`, and a supporting `StateStore` interface.

```typescript
// In a new file, e.g., src/ensemble.ts

/**
 * Defines the interface for an external state store that the Ensemble can plug into.
 * The user provides an object that conforms to this interface.
 * @template C The shared context type.
 */
export interface StateStore<C extends object> {
  /** A function that returns the current state of the context. */
  getContext: () => C;
  /** A function that takes a new context and updates the store. */
  setContext: (newContext: C) => void;
}

/**
 * The returned Ensemble object, providing a stable API to interact with the machine.
 */
export type Ensemble<M extends Machine<any>> = {
  /** The key of the currently active state factory. */
  readonly currentState: keyof any; // This would be keyof the factories object

  /** A reactive accessor for the current context. */
  readonly context: Context<M>;

  /** All possible actions, pre-bound to perform transitions. */
  readonly actions: AllBoundTransitions<M>; // A mapped type over all possible states
};

/**
 * Creates an Ensemble to orchestrate machine states over a shared, external context.
 *
 * @param store The user-provided state store (e.g., from Solid, React, Zustand).
 * @param factories An object where keys are state names and values are functions
 *                  that create a machine instance for that state.
 * @param initialStateKey The key of the initial state in the factories object.
 */
export function createEnsemble<
  C extends object,
  Factories extends Record<string, (context: C) => Machine<C>>
>(
  store: StateStore<C>,
  factories: Factories,
  initialStateKey: keyof Factories
): Ensemble<ReturnType<Factories[keyof Factories]>>;
```

#### **How Transitions Work Internally**

When defining a machine state for the Ensemble, transitions don't call `createMachine`. Instead, they compute the new context and call `store.setContext()`. The Ensemble then automatically switches to the correct machine "actor" based on the new context's discriminant property (e.g., `status`).

#### **Detailed Example: Integration with Solid.js**

This demonstrates the power of user-provided state management.

```tsx
import { createStore } from 'solid-js/store';
import { createEnsemble, StateStore } from '@doeixd/machine';

// 1. Define the shared context and the different machine state types.
type FetchContext = {
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: any;
  error?: string;
};
type IdleMachine = Machine<FetchContext> & { fetch: () => void };
type LoadingMachine = Machine<FetchContext> & { /* no actions */ };
// ... etc.

// 2. Create the reactive store using a framework primitive (Solid's createStore).
const [solidStore, setSolidStore] = createStore<FetchContext>({ status: 'idle' });

// 3. Create the StateStore adapter that the Ensemble will use.
const stateStore: StateStore<FetchContext> = {
  getContext: () => solidStore,
  setContext: (newContext) => setSolidStore(newContext),
};

// 4. Define the state "actors" (factories).
// Note how they use `setContext` instead of returning a new machine.
const fetchFactories = {
  idle: (ctx: FetchContext): IdleMachine => ({
    context: ctx,
    fetch: () => {
      // Transition logic: compute next context and update the shared store.
      stateStore.setContext({ status: 'loading' });
      // Simulate async work
      setTimeout(() => {
        stateStore.setContext({ status: 'success', data: 'Hello from the Ensemble!' });
      }, 1000);
    },
  }),
  loading: (ctx: FetchContext): LoadingMachine => ({
    context: ctx,
    // No transitions available while loading
  }),
  // ... other state factories for 'success' and 'error'
};

// 5. Create the Ensemble instance.
const ensemble = createEnsemble(stateStore, fetchFactories, 'idle');

// 6. Use it in a Solid component.
function MyComponent() {
  return (
    <div>
      <p>Status: {ensemble.context.status}</p>
      {/* Type safety: `ensemble.actions` only allows valid transitions */}
      <Show when={ensemble.context.status === 'idle'}>
        <button onClick={() => ensemble.actions.fetch()}>Fetch Data</button>
      </Show>
      <Show when={ensemble.context.status === 'success'}>
        <p>Data: {ensemble.context.data}</p>
      </Show>
    </div>
  );
}
```

#### **Generator Integration**

The generator pattern becomes even cleaner, as the Ensemble is a stable reference.

```typescript
runWithEnsemble(function* (ensemble) {
  // Just yield the action. The ensemble handles the state change.
  yield ensemble.actions.fetch();
  
  // The generator can pause here, and the external context
  // will be in the 'loading' state. When the async operation
  // completes, the context becomes 'success', and the generator
  // could resume if designed to do so.
}, ensemble);
```

#### **Pros & Cons**

*   **Pros:**
    *   **Ultimate Framework Agnosticism:** This is the killer feature. By abstracting state access, you can plug the same state machine logic into React, Solid, Vue, Svelte, or even a backend system, just by writing a different `StateStore` adapter.
    *   **Solves the "Mutable Ergonomics" Problem:** Provides a stable `ensemble` reference for imperative calls, solving the reassignment issue.
    *   **Full Type Safety:** The Ensemble runner would be typed to only expose the actions valid for the *current* state, preserving the core Type-State guarantee.
    *   **Leverages Host Framework Performance:** State updates are handled by the host framework's optimized, fine-grained reactivity system (like Solid's stores), which is likely more performant than a simple `useState` in React with a large machine object.
    *   **Excellent Separation of Concerns:** Your machine logic contains zero framework code. It's pure, portable business logic.

*   **Cons:**
    *   **Increased Boilerplate/Setup:** It's undeniably more setup than a single `createMachine()` call. The user must define the context, the store, the adapter, and the factories.
    *   **Advanced Concept:** This is a power-user feature. It requires a deeper understanding of decoupling state logic from state management.
    *   **Breaks Purity of Transitions:** Transition functions are no longer pure in the mathematical sense. They now have a side effect: calling `setContext`. This is a significant but deliberate trade-off for the sake of integration.

### **Final Recommendation**

The **Ensemble** is a brilliant and powerful concept for an advanced, optional feature. It should not replace the simple, pure `createMachine` API, which is perfect for self-contained, component-level state.

Instead, the Ensemble should be introduced as **the recommended solution for complex state machines that need to integrate deeply with a host application's reactive state management system.**

This creates a clear progression for users:
1.  **Start simple:** Use `createMachine` for local, self-contained state.
2.  **Level up for ergonomics:** Use the `createRunner` (from the previous proposal) to manage a self-contained machine without reassignment.
3.  **Go pro for integration:** Use `createEnsemble` to orchestrate machine logic on top of an existing application-wide state solution.


### **Goal: Improve Ergonomics by Eliminating State Reassignment**

The objective is to create a new primitive that provides a "stable reference" to the state machine, allowing for an imperative `machine.doAction()` style without needing `machine = machine.doAction()`. This is particularly beneficial for multi-step workflows, like those using generators.

---

### **Proposal 1: The Managed State Runner (Recommended Approach)**

This approach preserves the library's immutable core while providing a mutable-style "runner" or "controller" that manages state reassignments internally. It's the best of both worlds: ergonomic, safe, and fully compatible with the existing ecosystem.

#### **Philosophy**

The machine primitives remain pure and immutable. We introduce a new, higher-level abstraction, the **Runner**, which is a stateful object that holds the *current* machine instance. All actions are performed through the runner, which handles the `currentMachine = nextMachine` update internally and notifies subscribers of the change.

#### **API Design**

A new function, `createRunner`, is introduced.

```typescript
// In src/index.ts or a new src/runner.ts
export function createRunner<M extends Machine<any>>(
  initialMachine: M,
  onChange?: (newState: M) => void
): Runner<M>;

export type Runner<M extends Machine<any>> = {
  /** The current machine instance. Use this for type-narrowing. */
  readonly state: M;

  /** The context of the current machine state. */
  readonly context: Context<M>;

  /**
   * An object containing all possible transition methods, pre-bound to update
   * the runner's internal state. This is the primary way to interact with the machine.
   */
  readonly actions: BoundTransitions<M>;

  /** A method to manually set the machine to a new state. */
  setState(newState: M): void;
};

// Helper type to create the bound actions object
type BoundTransitions<M extends Machine<any>> = {
  [K in TransitionNames<M>]: (...args: TransitionArgs<M, K>) => M[K] extends (...args: any[]) => infer R ? R : never;
};
```

#### **Example Usage: Basic Counter**

This demonstrates the core ergonomic win.

```typescript
import { createRunner } from '@doeixd/machine';

// 1. Create a machine as usual (it's still immutable)
const counterMachine = createCounterMachine({ count: 0 });

// 2. Wrap it in a runner
const runner = createRunner(counterMachine, (newState) => {
  console.log('State changed to:', newState.context);
});

// 3. Use the stable `actions` object. No reassignment needed!
console.log(runner.context.count); // 0

runner.actions.increment(); // Logs: State changed to: { count: 1 }
runner.actions.add(5);      // Logs: State changed to: { count: 6 }

console.log(runner.context.count); // 6 (The runner's internal state was updated)
```

#### **Example Usage: Type-State Programming**

The runner fully preserves Type-State safety. The `.state` property is the key.

```typescript
const authRunner = createRunner(createLoggedOutMachine());

// The type of `authRunner.state` is `LoggedOutMachine | LoggedInMachine`
// The type of `authRunner.actions` contains BOTH login and logout.

// TypeScript will complain here because `logout` might not exist.
// authRunner.actions.logout(); // ❌ Error!

// Use a type guard on the `.state` property to narrow the type.
if (hasState(authRunner.state, 'status', 'loggedOut')) {
  // Inside this block, TS knows `authRunner.state` is `LoggedOutMachine`
  // and `authRunner.actions.login` is available and safe to call.
  authRunner.actions.login('alice');
}

console.log(authRunner.context.status); // 'loggedIn'
console.log(authRunner.context.username); // 'alice'
```

#### **Generator Integration**

This is where the runner shines. We introduce a new generator executor, `runWithRunner`.

```typescript
export function runWithRunner<M extends Machine<any>, T>(
  flow: (runner: Runner<M>) => Generator<any, T>,
  initialMachine: M
): T {
  const runner = createRunner(initialMachine);
  const generator = flow(runner);
  // Simplified runner logic...
  let result = generator.next();
  while (!result.done) {
    result = generator.next();
  }
  return result.value;
}

// The generator code becomes incredibly clean:
runWithRunner(function* (runner) {
  // No `m = ...`, no `yield* step(...)`. Just call the action.
  yield runner.actions.increment();
  yield runner.actions.add(5);
  yield runner.actions.increment();

  // The runner's context has been updated throughout the flow.
  return runner.context.count;
}, counterMachine);
```

#### **Pros & Cons**

*   **Pros:**
    *   **Preserves Immutability:** The core machines are unchanged, retaining all safety guarantees.
    *   **Excellent Ergonomics:** Achieves the "stable reference" goal with `runner.actions`.
    *   **Opt-In Complexity:** It's a purely additive feature. Users who prefer the pure functional style can ignore it.
    *   **Compatible with Everything:** Works seamlessly with Type-State, React/Solid integrations (the `onChange` is the hook), and debugging tools.
    *   **Massively cleans up generator code.**

*   **Cons:**
    *   **Minor Abstraction Layer:** Users need to understand the concept of the Runner wrapping the Machine.

---

### **Proposal 2: The Shared Context Machine (Advanced/Experimental)**

This approach directly implements your idea: a machine where the context object is a shared, mutable reference across all states. This is a fundamental departure from the library's philosophy and comes with significant caveats.

#### **Philosophy**

The state of the system is held in a single, mutable `context` object. A transition mutates this object and returns a new *machine wrapper* which has a different set of available methods (transitions) but points to the *exact same context object*.

#### **API Design**

A new factory is required that is aware of all possible states from the start.

```typescript
// A new kind of factory
export function createSharedContextMachine<C extends object>(
  initialContext: C,
  stateFactories: Record<string, (ctx: C) => Machine<C>>
): // Returns a machine that manages its own state internally
```

This API is more complex to design safely. A better approach might be a Proxy-based runner.

```typescript
// A more realistic API
export function createMutableMachine<M extends Machine<any>>(initialMachine: M): MutableMachine<M>;

type MutableMachine<M extends Machine<any>> = Context<M> & BoundTransitions<M>;
```
The returned object would be a proxy that merges the context and the currently valid actions.

#### **Example Usage**

```typescript
const mutableMachine = createMutableMachine(createCounterMachine({ count: 0 }));

console.log(mutableMachine.count); // 0
const initialContext = mutableMachine; // Reference the object itself

// Call the action. This mutates the internal context.
mutableMachine.increment();
mutableMachine.add(5);

console.log(mutableMachine.count); // 6

// Prove the context object is the same reference
const finalContext = mutableMachine;
expect(finalContext).toBe(initialContext); // This would be true!
```

#### **Generator Integration**

The generator code would look similar to the Runner proposal, as the imperative style is the main goal.

```typescript
runMutable(function* (machine) {
  yield machine.increment();
  yield machine.add(5);
  return machine.count;
}, mutableMachine);
```

#### **Pros & Cons**

*   **Pros:**
    *   **"Simpler" Imperative Model:** For developers used to OOP and mutable objects, this might feel more direct.
    *   **Stable Context Reference:** The context object itself never changes, which could be useful in specific interop scenarios.

*   **Cons:**
    *   **Sacrifices Immutability:** This is a major drawback. It eliminates the core safety guarantee of the library.
    *   **Breaks UI Frameworks:** React and Solid's change detection relies on immutable updates. This model would not trigger re-renders without manual, forced updates.
    *   **Makes Debugging Difficult:** Loses the ability to time-travel or even reliably log state history, as the history is constantly being overwritten.
    *   **Risk of Bugs:** Opens the door to race conditions and complex bugs related to shared mutable state.
    *   **Philosophical Inconsistency:** It clashes with the library's stated principles of purity and safety.

---

### **Final Recommendation**

**Strongly recommend Proposal 1: The Managed State Runner.**

It successfully solves the ergonomic problem you identified without compromising any of the library's foundational strengths. It's a safe, powerful, and non-breaking addition that enhances the developer experience across the board, especially for generators. It feels like a natural evolution of the library's feature set.

Proposal 2, while an interesting thought experiment, introduces too many trade-offs and runs counter to the principles that make this library special. It would be a step backward in terms of safety and compatibility with the modern JavaScript ecosystem.

**Path Forward:**
1.  Implement the `createRunner` API as described in Proposal 1.
2.  Add a `runWithRunner` utility to the `generators.ts` module.
3.  Update the documentation to explain this new, optional way of interacting with machines, positioning it as the recommended approach for complex, multi-step workflows.