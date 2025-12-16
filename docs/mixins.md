# Machine Mixins: Composition & Transformation

The `@doeixd/machine` library provides powerful utilities for composing state machines significantly beyond simple inheritance. With `MachineUnion` and `MachineExclude`, you can mathematically combine or subtract functionality, enabling true modular state management.

## Why Mixins?

Traditional class inheritance allows for `is-a` relationships (a `Counter` is a `Machine`). However, simpler inheritance struggles with:
1.  **Multiple Capabilities**: A machine might need to be a `Counter` AND a `Logger` AND a `NetworkRequest`. TypeScript/JavaScript does not support multiple inheritance.
2.  **Role-Based Views**: You might want a "Guest" machine that is exactly like the "Admin" machine but *without* the `deleteUser` method.
3.  **Modular Features**: You want to develop features in isolation (Auth, Navigation, Data) and snap them together into an App machine.

## API Overview

| Utility | Type | Description |
| :--- | :--- | :--- |
| `MachineUnion(...classes)` | Class Mixin | Merges multiple machine classes into one. |
| `MachineExclude(Source, Excluded)` | Class Mixin | Removes methods defined in `Excluded` from `Source`. |
| `machineUnion(...instances)` | Helper | Functional wrapper to combine instances directly. |
| `machineExclude(source, ...excl)` | Helper | Functional wrapper to restrict an instance. |

---

## 1. MachineUnion: Combining Capabilities

`MachineUnion` implements true **multiple inheritance** for state machines. It merges the **Context** (state data) and **Transitions** (methods) of all provided classes.

### When to use it
- Composing a large "App" machine from smaller "Feature" machines.
- Adding cross-cutting concerns (e.g., a `Logger` machine mixed into every machine).
- Splitting complex logic into manageable, strict-domain files.

### Simple Example

```typescript
import { MachineBase, MachineUnion } from '@doeixd/machine';

// Feature 1: Counting
class Counter extends MachineBase<{ count: number }> {
  inc() { return new Counter({ count: this.context.count + 1 }); }
}

// Feature 2: Toggling
class Toggler extends MachineBase<{ active: boolean }> {
  toggle() { return new Toggler({ active: !this.context.active }); }
}

// Combine them!
// The new class has context: { count: number } & { active: boolean }
class AppMachine extends MachineUnion(Counter, Toggler) {}

const app = new AppMachine({ count: 0, active: false });

app.inc();    // Available!
app.toggle(); // Available!
```

### Advanced: Fluent Chaining

A common problem with mixins is that inherited methods usually return the parent type, breaking method chaining.
`MachineUnion` solves this with **Runtime Method Wrapping**.

```typescript
// Even though 'inc' is defined in Counter, calling it on AppMachine
// returns an AppMachine instance, not a Counter instance.
app
  .inc()      // Returns AppMachine
  .toggle()   // Returns AppMachine
  .inc();     // Works!
```

---

## 2. MachineExclude: Subtracting Capabilities

`MachineExclude` allows you to create a **Restricted View** of a machine. It takes a `Source` machine and removes any methods that exist on the `Excluded` machines.

### When to use it
- **Role-Based Access Control (RBAC)**: Create an `Admin` machine, then subtract dangerous methods for a `Guest`.
- **Feature Flagging**: Dynamically remove features that shouldn't be accessible.
- **Simplification**: Hiding internal or complexity methods from a public API surface.

### Example: Role-Based Access

```typescript
import { MachineUnion, MachineExclude } from '@doeixd/machine';

// Define capabilities
class Viewer { view() { /*...*/ } }
class Editor { edit() { /*...*/ } }
class Admin  { delete() { /*...*/ } }

// The Super User has everything
class SuperUser extends MachineUnion(Viewer, Editor, Admin) {}

// A Guest user is a SuperUser MINUS Edit and Admin capabilities
class Guest extends MachineExclude(SuperUser, Editor, Admin) {}

const guest = new Guest({ ... });
guest.view();   // OK
// guest.edit();   // Compile-time Error!
// guest.delete(); // Compile-time Error!
```

### Safety Note
`MachineExclude` performs both **Compile-time** (TypeScript `Omit`) and **Runtime** (prototype property deletion) removal. It also wraps remaining methods to ensure they return the *Restricted* type, preventing a user from "breaking out" of the restriction by calling a method that returns the full `SuperUser` instance.

---

## 3. Functional Helpers

For users who prefer working with instances rather than classes, or need to compose machines dynamically at runtime.

### `machineUnion(...instances)`

Automatically extracts constructors, merges contexts, and returns a combined instance.

```typescript
import { machineUnion } from '@doeixd/machine';

const counter = new Counter({ count: 0 });
const logger = new Logger({ logs: [] });

// Combined instance with merged state: { count: 0, logs: [] }
const app = machineUnion(counter, logger); 
```

### `machineExclude(source, ...excluded)`

Creates a restricted instance from a source instance.

```typescript
import { machineExclude } from '@doeixd/machine';

const fullApp = new AppMachine({ ... });
const readOnly = machineExclude(fullApp, new Editor({}), new Admin({}));
```

---

## 4. Deep Dive: Common Questions & Gotchas

Using mixins is powerful but introduces some complexity. Here are the answers to common questions.

### How are naming conflicts handled?

**Last-One-Wins**. If multiple mixed-in classes define a method with the same name (e.g., `reset()`), the method from the **last** class in the argument list will be used.

```typescript
class A { reset() { return 'A'; } }
class B { reset() { return 'B'; } }

const U = MachineUnion(A, B);
new U({}).reset(); // Returns 'B'
```

> **Tip**: If you need to access both, manually compose them in a wrapper class before mixing, or rename methods in your feature classes (e.g., `resetCounter`, `resetAuth`).

### Can I use `super`?

**No**. Be careful. Because the prototype chain is dynamically constructed, calls to `super.method()` inside a mixed-in class will likely not behave as expected or might point to `MachineBase`. Mixin methods should generally depend only on `this.context` and `this` (for other methods), not `super`.

### How does `instanceof` work?

`instanceof` works for the **Combined Class** but **not** for the original mixin classes.

```typescript
const app = new AppMachine({});
console.log(app instanceof AppMachine); // true
console.log(app instanceof Counter);    // FALSE!
```

> **Why?** JavaScript's `instanceof` checks the prototype chain. `MachineUnion` copies methods onto a *new* prototype; it does not set up a prototype chain that inherits from `Counter` and `Toggler` simultaneously (which is impossible in JS).

### What about private properties?

TypeScript `private` properties are erased at runtime, but trying to access a private property of `Counter` inside `AppMachine` (or vice versa) works if the type system allows it. However, avoid using private fields (`#field`) as they are scoped to the original class declaration and won't be accessible on the mixed-in instance. Use standard `private` or `protected` typescript modifiers.

### Performance Considerations

`MachineUnion` and `MachineExclude` perform **prototype copying** and **method wrapping** at **Class Creation Time** (when you define `class X extends MachineUnion(...)`).

- **Creation Cost**: There is a one-time cost when the module loads and the class is defined.
- **Instantiation Cost**: Creating instances (`new AppMachine()`) is very fast—almost the same as a regular class.
- **Runtime Cost**: Calling a method involves a lightweight wrapper function that checks the return value. This overhead is negligible for almost all applications (tens of nanoseconds).

### Order of Arguments Matters

The order of arguments in `MachineUnion(A, B, C)` determines:
1.  **Conflict Resolution**: `C` overrides `B`, which overrides `A`.
2.  **Base Class**: The internal inheritance chain starts from `A`. This rarely matters unless you are relying on side-effects of `A`'s constructor.

### Does it work with Async Machines?

**Yes**. Because Async Machines in this library are simply machines where methods return `Promise<Machine>`, the method wrapping logic handles this transparently. If a method returns a Promise, the wrapper awaits it (or returns a Promise that resolves to the wrapped instance).

*Note: Check `AsyncMachine` specific tests for exact behavior on method chaining with Promises.*
