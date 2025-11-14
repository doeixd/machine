# vs. The Classic "State" Design Pattern

If you have a background in classic object-oriented programming, you might notice that the architecture of `@doeixd/machine` strongly resembles the **State design pattern**, as cataloged in the influential "Gang of Four" book, *Design Patterns: Elements of Reusable Object-Oriented Software*.

This is not a coincidence—it's a foundational design choice. Our library embraces this time-tested pattern for its clarity and separation of concerns. However, it also evolves it significantly by leveraging the power of the TypeScript compiler.

This document explains what the State pattern is, how this library is a modern implementation of it, and—most importantly—the crucial improvements that make our approach uniquely safe and powerful.

### What is the Classic State Pattern?

The State pattern is a solution for managing an object whose behavior changes based on its internal state. Instead of using large, hard-to-maintain conditional blocks (`if/else` or `switch`) within a single class, the pattern delegates state-specific logic to a family of separate objects.

**The Key Components:**
1.  **Context:** The main object whose state is being managed (e.g., a `Document`). It holds a reference to its current `State` object.
2.  **State Interface:** An interface that all state objects implement (e.g., `DocumentState` with methods like `render()` and `publish()`).
3.  **Concrete States:** A separate class for each possible state (e.g., `DraftState`, `PublishedState`). Each class implements the behavior for *its own state* and determines the next state after an action.

When an action is performed on the `Context`, it doesn't handle the logic itself. Instead, it **delegates the call to its current `State` object.** The `State` object then performs the action and can return a new `State` object for the `Context` to transition into.

This elegantly decouples the `Context` from the implementation of its state-dependent behaviors.

### How `@doeixd/machine` Implements This Pattern

Our library provides the structure to implement this pattern in a clean and formal way. The mapping is direct:

| GoF State Pattern Concept | `@doeixd/machine` Implementation |
| :--- | :--- |
| **`Context` Object** | The variable holding your current machine instance. |
| **`State Interface`** | The implicit contract defined by `MachineBase` or the `Machine<C>` type. |
| **`Concrete State` Class** | A **`Machine` Class** (e.g., `DraftMachine`). |
| **Behavior Method** | A **Transition Method** on the machine class (e.g., `publish()`). |
| **Transition Logic** | A method that returns a **new machine instance** (`return new PublishedMachine(...)`). |

The person who says, *"This is just the State design pattern,"* is correct. We've built on this proven foundation because it provides an excellent structure for organizing complex state logic.

### The Evolution: What Makes `@doeixd/machine` Different

The real innovation of this library lies in how it enhances the classic pattern with modern programming principles and the power of TypeScript.

#### 1. Immutability and Functional Principles

The classic State pattern often involves the `Context` object *mutating* its internal state (`this.state = newState`). This approach is challenging to manage in modern declarative UI frameworks like React, which rely on immutable data to detect changes.

`@doeixd/machine` promotes a functional, immutable approach. A transition doesn't modify the current machine; it returns a **brand new, immutable instance** that represents the next state.

```typescript
// Classic mutation: the object's internal property changes
document.publish();

// @doeixd/machine immutable update: a new object is returned
publishedDoc = draftDoc.publish();
```

This makes state changes explicit, predictable, and compatible with modern reactive architectures.

#### 2. The Compiler as Your Safety Net: Type-State Programming

This is the most significant and powerful evolution of the pattern.

In the classic implementation, the `Context` variable (e.g., `document`) *always* has the same type, regardless of its internal state. This means you could attempt to call a method that only makes sense in a `PublishedState` (like `archive()`) while the document is still a `DraftState`. You would only discover this logic error at **runtime**.

`@doeixd/machine` elevates the state from a hidden implementation detail to a core part of the object's **public type signature.** This is **Type-State Programming.**

Consider a `Document` that can be a `DraftMachine` or a `PublishedMachine`.

```typescript
// A variable that can hold either state
let doc: DraftMachine | PublishedMachine;

// We start in the Draft state
doc = new DraftMachine({ content: "Hello" });

// At this point, the TypeScript compiler knows the specific type of `doc` is `DraftMachine`.

// The `archive()` method only exists on `PublishedMachine`.
// Attempting to call it here is a COMPILE-TIME ERROR. Your code won't even compile.
doc.archive();
// ❌ Error: Property 'archive' does not exist on type 'DraftMachine'.

// The only valid way forward is through a defined transition.
doc = doc.publish();
// Now, the compiler knows the specific type of `doc` is `PublishedMachine`.

// This call is now perfectly valid and type-safe!
doc.archive(); // ✅
```

The classic State pattern provides **runtime polymorphism**. `@doeixd/machine` provides **compile-time correctness**. It takes the proven organizational benefits of the State pattern and adds a layer of static analysis that guarantees you cannot even write the code for an invalid state transition.

### Conclusion

`@doeixd/machine` is a thoughtful and modern implementation of the classic State pattern. By integrating it with functional principles and a sophisticated type system, it transforms a behavioral runtime pattern into a structural, compile-time guarantee of correctness.

This approach allows you to model complex state logic in a way that is not only well-organized and maintainable but also **provably correct** by the TypeScript compiler before it ever runs.