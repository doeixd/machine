# Advanced Pattern: Modeling Parallel States

In statechart terminology, **parallel (or orthogonal) states** are states that are active at the same time and are largely independent of each other. A common example is a text editor where font weight (`bold`/`normal`) and text decoration (`underline`/`none`) can be changed independently.

`@doeixd/machine` does not have a built-in primitive for parallel states, but its flexible foundation allows you to model them in a few different ways. This guide will walk you through the patterns, from the naive to the advanced, and help you understand the trade-offs of each.

### The Challenge: Combinatorial Explosion

The core philosophy of this library is "Type-State Programming," where every unique state is a unique type. If we apply this principle naively to parallel states, we run into a major problem: a combinatorial explosion of states.

Consider the text editor example. We have two parallel regions:
1.  **Font Weight:** `NormalWeight` | `BoldWeight` (2 states)
2.  **Text Decoration:** `NoDecoration` | `UnderlineDecoration` (2 states)

A pure Type-State approach would require us to define a unique machine type for every possible *combination*:

1.  `NormalNoDecorationMachine`
2.  `BoldNoDecorationMachine`
3.  `NormalUnderlineMachine`
4.  `BoldUnderlineMachine`

This is already 4 machine types. If we add a third parallel region for alignment (`left`/`center`/`right`), we would need `4 * 3 = 12` machine types. This is clearly not scalable or maintainable.

So, how do we solve this?

### Pattern 1: The Pragmatic Approach (Recommended for Most Cases)

For most use cases, the simplest and most effective way to model parallel states is to represent them as **properties within a single machine's context**.

This approach is a deliberate trade-off: you sacrifice the strict Type-State guarantee for those specific properties in exchange for simplicity and scalability.

**Example: An `EditorMachine`**
```typescript
import { MachineBase, setContext } from '@doeixd/machine';

interface EditorContext {
  fontWeight: 'normal' | 'bold';
  textDecoration: 'none' | 'underline';
}

export class EditorMachine extends MachineBase<EditorContext> {
  constructor() {
    super({ fontWeight: 'normal', textDecoration: 'none' });
  }

  toggleBold() {
    // Logic is handled inside the method
    const newWeight = this.context.fontWeight === 'normal' ? 'bold' : 'normal';
    return setContext(this, { ...this.context, fontWeight: newWeight });
  }

  toggleUnderline() {
    const newDecoration = this.context.textDecoration === 'none' ? 'underline' : 'none';
    return setContext(this, { ...this.context, textDecoration: newDecoration });
  }
}
```

**Pros:**
*   ✅ **Simple & Scalable:** Easy to understand and add new parallel regions.
*   ✅ **Orthogonal Logic:** The `toggleBold` logic is completely independent of the `toggleUnderline` logic.
*   ✅ **Compatible with Tooling:** The statechart extractor will see this as a single `EditorMachine` state with self-transitions, which is a valid (though not detailed) representation.

**Cons:**
*   ❌ **Not True Type-State:** The type of your variable is always `EditorMachine`. The compiler can't stop you from calling a hypothetical `unbold()` method when `fontWeight` is already `'normal'`. This check must happen at runtime inside the method.

> **Recommendation:** Start with this pattern. It provides the best balance of safety, simplicity, and maintainability for modeling parallel states.

---

### Pattern 2: The Advanced Composition Approach

For situations where you need to compose pre-existing, independent machines or require the absolute strictest compile-time safety, you can use a more advanced pattern built on type composition.

This pattern involves a higher-level primitive, `createParallelMachine`, that merges two machines into a single entity with a fully inferred union type.

**(Note: The `createParallelMachine` primitive is an advanced pattern you would build yourself, not a part of the core library. An implementation is shown in the library's source for reference.)**

**Example: Composing Two Independent Machines**

First, define your independent machines:

```typescript
// fontWeightMachine.ts
class NormalWeight extends MachineBase<{ fontWeight: 'normal' }> {
  bold = () => new BoldWeight();
}
class BoldWeight extends MachineBase<{ fontWeight: 'bold' }> {
  unbold = () => new NormalWeight();
}

// textDecorationMachine.ts
class NoDecoration extends MachineBase<{ textDecoration: 'none' }> {
  underline = () => new UnderlineState();
}
class UnderlineState extends MachineBase<{ textDecoration: 'underline' }> {
  removeUnderline = () => new NoDecoration();
}
```

Now, compose them using the `createParallelMachine` primitive:

```typescript
import { createParallelMachine, ParallelMachine } from './parallel-primitive';

// Create the composed machine
const editor = createParallelMachine(
  new NormalWeight(),
  new NoDecoration()
);
// The type of `editor` is inferred as:
// ParallelMachine<NormalWeight, NoDecoration>
```

**How It Provides Type-Safety**

The `ParallelMachine` type uses advanced generics to understand the composition. When you call a transition, TypeScript infers the new, combined state perfectly.

```typescript
// 1. Transition the font weight
const boldEditor = editor.bold();
// `boldEditor`'s type is now `ParallelMachine<BoldWeight, NoDecoration>`

// The compiler knows that `bold` is no longer a valid action.
// This is a COMPILE-TIME ERROR!
boldEditor.bold();
// ❌ Error: Property 'bold' does not exist on type...

// But `unbold` (from BoldWeight) and `underline` (from NoDecoration) are valid.
const boldAndUnderlinedEditor = boldEditor.underline();
// `boldAndUnderlinedEditor`'s type is now `ParallelMachine<BoldWeight, UnderlineState>`

// The compiler knows the available transitions are `unbold` and `removeUnderline`.
boldAndUnderlinedEditor.unbold(); // ✅
boldAndUnderlinedEditor.removeUnderline(); // ✅
```

**Pros:**
*   ✅ **Maximum Compile-Time Safety:** It fully embraces the Type-State philosophy, making invalid transition sequences impossible to write.
*   ✅ **Excellent for Composition:** Perfect for combining existing, independent machines without rewriting them.

**Cons:**
*   ❌ **High Complexity:** The underlying types are very advanced. Error messages can be cryptic, and it raises the knowledge barrier for the team.
*   ❌ **Tooling Incompatibility:** The static statechart extractor cannot understand this complex, dynamically generated type. **You will lose the ability to visualize your parallel states.**
*   ❌ **Risk of Name Collisions:** This pattern requires that the composed machines do not have any transition methods with the same name.

### Summary: Which Pattern Should You Use?

| | **Pattern 1: Context Properties** | **Pattern 2: Advanced Composition** |
| :--- | :--- | :--- |
| **When to Use** | **Most of the time.** When you are defining a new machine with parallel regions. | **Rarely.** When you need to compose existing, independent machines. |
| **Safety** | Good (Type-safe context access) | **Excellent** (Compile-time transition safety) |
| **Simplicity** | **Excellent** | Poor (High complexity) |
| **Tooling** | **Good** (Renders as a single state) | Poor (Cannot be visualized) |
| **Recommendation** | ✅ **The recommended, pragmatic choice.** | ⚠️ **Use with caution as an expert-level tool.** |

For parallel states, **favor the simplicity and tooling compatibility of the context-based approach.** The advanced composition pattern is a powerful demonstration of TypeScript's capabilities but is often an over-engineering for most real-world problems.