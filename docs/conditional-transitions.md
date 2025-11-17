# A Deep Dive into Conditional Transitions (Guards)

## Introduction

Imagine you're building a content management system with a "publish" button that should only be available to administrators. How do you represent this conditional logic in a way that's both safe and clear?

The core challenge is balancing three competing priorities:
1. **Runtime Safety**: Preventing invalid operations at runtime
2. **Compile-Time Safety**: Catching bugs before they reach production
3. **Developer Experience**: Writing code that's readable and maintainable

`@doeixd/machine` provides three complementary patterns for conditional transitions, each optimized for different use cases:

| Pattern | Best For | Safety Level |
| :--- | :--- | :--- |
| 1. Type Narrowing | Most use cases; simple, clear logic. | **Compile-Time** |
| 2. `guard()` Primitive | Ergonomics; complex runtime checks. | **Runtime** |
| 3. Generic State Classes | Critical paths; proving outcomes at compile time. | **Advanced Compile-Time** |

## Technical Foundation: Static vs Runtime Analysis

Before diving into the patterns, it's important to understand how `@doeixd/machine` provides both **static analysis** (build-time) and **runtime extraction** for generating formal statechart definitions.

### Static Analysis (Build-Time)
- **When:** During compilation/build
- **How:** Uses `ts-morph` to parse TypeScript source code AST
- **Input:** Your `.ts` source files
- **Output:** XState-compatible JSON with resolved class names
- **Use Case:** CI/CD, documentation, static tooling

```typescript
// Your source code
login = transitionTo(LoggedInMachine, (user) => new LoggedInMachine({ user }));

// Static extractor generates:
{
  "states": {
    "LoggedOut": {
      "on": {
        "login": {
          "target": "LoggedInMachine",  // ← Resolved from AST
          "description": "..."
        }
      }
    }
  }
}
```

### Runtime Extraction (Runtime)
- **When:** While your app is running
- **How:** Uses JavaScript Symbols to read metadata from function objects
- **Input:** Running machine instances
- **Output:** XState-compatible JSON with runtime-resolved data
- **Use Case:** Debugging, DevTools, dynamic statechart generation

```typescript
// Functions have metadata attached at runtime
login[RUNTIME_META] = {
  target: "LoggedInMachine",
  description: "User login transition"
};

// Runtime extractor reads this and generates JSON
const chart = generateStatechart({
  LoggedOut: loggedOutInstance,
  LoggedIn: loggedInInstance
}, { id: 'auth', initial: 'LoggedOut' });
```

## Understanding the Guard Primitives

The library provides three guard-related primitives with different purposes:

### `guarded()` - **DEPRECATED** (Static Analysis Only)
```typescript
// ❌ DEPRECATED - Use guard() or guardSync() instead

delete = guarded(
  { name: "isAdmin", description: "Check admin permissions" },
  transitionTo(DeletedMachine, () => new DeletedMachine())
);
```

- **Runtime Protection:** ❌ None (identity function)
- **Static Analysis:** ✅ Adds metadata for statechart extraction
- **Safety:** Zero runtime protection
- **Why Deprecated:** Split responsibility - separate code for runtime vs analysis

### `guard()` - **Runtime Protection + Static Analysis**
```typescript
delete = guard(
  (ctx) => ctx.isAdmin,  // ← Runtime condition check
  transitionTo(DeletedMachine, () => new DeletedMachine()), // ← Success transition
  {
    onFail: 'throw',     // ← Failure handling
    description: 'Delete item if user is admin' // ← For static analysis
  }
);
```

- **Runtime Protection:** ✅ Full runtime safety
- **Static Analysis:** ✅ Metadata for statechart extraction
- **Async Support:** ✅ Returns `Promise`
- **Use Case:** Async conditions or transitions

### `guardSync()` - **Synchronous Runtime Protection + Static Analysis**
```typescript
withdraw = guardSync(
  (ctx, amount) => ctx.balance >= amount, // ← Sync condition
  function(amount: number) {             // ← Sync transition
    return createMachine({ balance: this.balance - amount }, this);
  },
  {
    onFail: 'throw',
    description: 'Withdraw if sufficient balance'
  }
);
```

- **Runtime Protection:** ✅ Full runtime safety
- **Static Analysis:** ✅ Metadata for statechart extraction
- **Async Support:** ❌ Synchronous only (better performance)
- **Use Case:** Purely synchronous machines

## Section 1: The Standard Pattern - Type Narrowing with Discriminated Unions (The Default Choice)

**Philosophy:** "Make invalid states unrepresentable."

The most idiomatic approach in Type-State programming is to use discriminated unions in your context to represent different states, then use type narrowing to provide compile-time safety.

### Before: Boolean Flags (Runtime-Only Safety)

```typescript
import { createMachine } from '@doeixd/machine';

type DocumentContext = {
  content: string;
  isEditable: boolean;  // ❌ Runtime-only flag
};

const machine = createMachine({ content: 'Hello', isEditable: true }, {
  edit: function(newContent: string) {
    if (!this.isEditable) {
      throw new Error('Cannot edit: document is locked');
    }
    return createMachine({
      content: newContent,
      isEditable: this.isEditable
    }, this);
  }
});

// ❌ Runtime error possible
machine.edit('New content'); // Might throw!
```

### After: Discriminated Union (Compile-Time Safety)

```typescript
import { createMachine } from '@doeixd/machine';

type EditableDoc = {
  content: string;
  status: 'editable';
};

type LockedDoc = {
  content: string;
  status: 'locked';
};

type DocumentContext = EditableDoc | LockedDoc;

const editableMachine = createMachine({ content: 'Hello', status: 'editable' as const }, {
  edit: function(newContent: string) {
    return createMachine({
      content: newContent,
      status: 'editable' as const
    }, this);
  },
  lock: function() {
    return createMachine({
      content: this.content,
      status: 'locked' as const
    }, this);
  }
});

const lockedMachine = createMachine({ content: 'Hello', status: 'locked' as const }, {
  unlock: function() {
    return createMachine({
      content: this.content,
      status: 'editable' as const
    }, this);
  }
});

// ✅ Compile-time safety
if (editableMachine.context.status === 'editable') {
  editableMachine.edit('New content'); // ✅ Guaranteed to work
  // editableMachine.unlock(); // ❌ TypeScript error: unlock doesn't exist
}

if (lockedMachine.context.status === 'locked') {
  // lockedMachine.edit('New content'); // ❌ TypeScript error: edit doesn't exist
  lockedMachine.unlock(); // ✅ Guaranteed to work
}
```

**Summary:** This pattern forces callers to handle both possible outcomes at compile time, making invalid state transitions impossible. It's the most robust approach for most situations and should be your default choice.

## Section 2: The Ergonomic Pattern - The `guard()` Primitive for Runtime Safety

**Philosophy:** "Cleanly express runtime rules without boilerplate."

When you need complex runtime checks that can't be expressed as discriminated unions, the `guard()` primitive provides ergonomic runtime protection with excellent developer experience.

### Basic Usage

```typescript
import { createMachine, guard } from '@doeixd/machine';

const machine = createMachine({ balance: 100 }, {
  withdraw: guard(
    (ctx, amount) => ctx.balance >= amount,
    function(amount: number) {
      return createMachine({ balance: this.balance - amount }, this);
    },
    {
      onFail: 'throw',
      errorMessage: 'Insufficient funds',
      description: 'Withdraw money if balance allows'
    }
  )
});

await machine.withdraw(50); // ✅ Works
await machine.withdraw(200); // ❌ Throws "Insufficient funds"
```

### Failure Handling Options

**Throw on Failure:**
```typescript
guard(
  condition,
  transition,
  { onFail: 'throw', errorMessage: 'Custom error message' }
)
// Throws an Error with the specified message when condition fails
```

**Ignore Failure:**
```typescript
guard(
  condition,
  transition,
  { onFail: 'ignore' }
)
// Returns the current machine unchanged when condition fails
```

**Custom Fallback Function:**
```typescript
guard(
  condition,
  transition,
  {
    onFail: function() {
      return createMachine({ ...this.context, error: 'Unauthorized' }, this);
    }
  }
)
// Executes custom logic when condition fails
```

### Fluent API for Complex Branching

For the most readable conditional transitions, use the fluent `whenGuard()` API:

```typescript
import { createMachine, whenGuard } from '@doeixd/machine';

const machine = createMachine({ isAdmin: false, userId: 123 }, {
  deleteUser: whenGuard((ctx) => ctx.isAdmin)
    .do(function(targetUserId: number) {
      return createMachine({
        ...this.context,
        deletedUserId: targetUserId
      }, this);
    })
    .else(function() {
      return createMachine({
        ...this.context,
        error: 'Unauthorized: Admin access required'
      }, this);
    })
});

// Usage
const adminMachine = createMachine({ isAdmin: true, userId: 123 }, machine.transitions);
await adminMachine.deleteUser(456); // ✅ Success path

const userMachine = createMachine({ isAdmin: false, userId: 123 }, machine.transitions);
await userMachine.deleteUser(456); // ❌ Error path
```

### Integration with Tooling

Because `guard()` uses `attachRuntimeMeta()`, it's fully compatible with the runtime statechart extractor:

```typescript
const machine = createMachine({ count: 0 }, {
  increment: guard(
    (ctx) => ctx.count < 10,
    function() {
      return createMachine({ count: this.count + 1 }, this);
    },
    { description: 'Increment counter if under limit' }
  )
});

// Generates statechart JSON with:
// {
//   "on": {
//     "increment": {
//       "target": "LimitedMachine",
//       "description": "Increment counter if under limit",
//       "cond": "runtime_guard"
//     }
//   }
// }
```

## Section 3: The Advanced Pattern - Compile-Time Guards with Generics

**Philosophy:** "Prove the outcome of a transition to the compiler."

For maximum safety in critical paths, use generic state classes that encode permissions directly in the type system. This pattern proves transition outcomes to the compiler before you even call the method.

### The Complete Generic State Class Example

```typescript
import { createMachine, MachineBase, transitionTo } from '@doeixd/machine';

// Define permission levels as literal types
type Permission = 'read' | 'write' | 'admin';

// Generic state class encoding permissions in the type
class DocumentMachine<P extends Permission> extends MachineBase<{
  content: string;
  permissions: P;
}> {
  constructor(content: string, permissions: P) {
    super();
    this.context = { content, permissions };
  }

  // Only available if we have 'write' or 'admin' permissions
  edit = transitionTo(DocumentMachine<'write' | 'admin'>, (newContent: string) =>
    new DocumentMachine(newContent, this.context.permissions)
  );

  // Only available if we have 'admin' permissions
  delete = transitionTo(DocumentMachine<'admin'>, () =>
    new DocumentMachine('', 'admin' as const)
  );

  // Always available - reading doesn't require special permissions
  read = transitionTo(DocumentMachine<P>, () =>
    new DocumentMachine(this.context.content, this.context.permissions)
  );

  // The crucial bridge: runtime check that refines compile-time types
  private assertPermissions<T extends Permission>(
    required: T
  ): this is DocumentMachine<P & T> {
    return this.context.permissions === required ||
           (this.context.permissions === 'admin' && required !== 'admin');
  }
}

// Factory functions creating machines with specific permission types
function createReadOnlyDoc(content: string): DocumentMachine<'read'> {
  return new DocumentMachine(content, 'read');
}

function createEditableDoc(content: string): DocumentMachine<'write'> {
  return new DocumentMachine(content, 'write');
}

function createAdminDoc(content: string): DocumentMachine<'admin'> {
  return new DocumentMachine(content, 'admin');
}
```

### Developer Experience

**Success Path (Guaranteed Outcomes):**
```typescript
const editable = createEditableDoc('Hello World');
const result = editable.edit('Hello Universe');
// ✅ TypeScript knows result is DocumentMachine<'write' | 'admin'>
// ✅ Compiler guarantees the edit succeeded
```

**Failure Path (Compile-Time Errors):**
```typescript
const readOnly = createReadOnlyDoc('Hello World');
// readOnly.edit('New content'); // ❌ TypeScript error: Property 'edit' does not exist
// readOnly.delete(); // ❌ TypeScript error: Property 'delete' does not exist
readOnly.read(); // ✅ Works - reading is always available
```

### The Role of `assertPermissions()`

The `assertPermissions()` method serves as the critical bridge between runtime reality and compile-time types. It uses TypeScript's type predicates (`this is DocumentMachine<P & T>`) to tell the compiler about the refined type after a runtime check.

**Why `as any` is Safe Here:**
The method uses `as any` internally because TypeScript cannot track the complex relationship between generic constraints and runtime checks. However, this is safe because:

1. The runtime check ensures the condition is actually met
2. The type predicate provides compile-time proof of the refinement
3. The method is private and only used internally for type safety

### Advanced: Conditional Return Types

You can encode permission hierarchies directly in conditional return types:

```typescript
// Define a permission hierarchy
type ReadPermission = 'read';
type WritePermission = ReadPermission | 'write';
type AdminPermission = WritePermission | 'admin';

class SecureMachine<P extends Permission> extends MachineBase<{
  data: string;
  level: P;
}> {
  // This method only exists if P extends WritePermission
  save = (P extends WritePermission ?
    transitionTo(SecureMachine<P>, (data: string) =>
      new SecureMachine(data, this.context.level)
    ) : never
  );

  // This method only exists if P extends AdminPermission
  destroy = (P extends AdminPermission ?
    transitionTo(SecureMachine<P>, () =>
      new SecureMachine('', this.context.level)
    ) : never
  );
}
```

**Summary:** This pattern represents the ultimate expression of Type-State programming. Use it when you need absolute certainty about a transition's outcome before you even call it - perfect for critical security paths or complex business logic where runtime failures would be catastrophic.