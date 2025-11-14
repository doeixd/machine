# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`@doeixd/machine` is a minimal, type-safe state machine library for TypeScript built on mathematical foundations and centered around **Type-State Programming**.

**Core Philosophy:**
- **Type-State Programming First**: States are represented as TypeScript types, not strings. The compiler catches invalid state transitions at compile-time, making illegal states unrepresentable.
- **TypeScript as Safety Net**: The type system prevents entire categories of bugs—no runtime checks needed for state validity.
- **Minimal Primitives**: Provide only essential building blocks; everything else is built on top.
- **Flexibility Over Prescription**: Immutability by default but not enforced; supports functional, OOP, and factory patterns.
- Every transition is a pure function that returns a new machine instance (though mutability is technically allowed for flexibility)

## Development Commands

```bash
# Install dependencies
npm install

# Build the library (uses pridepack)
npm run build

# Type checking
npm run type-check

# Watch mode for development
npm run watch

# Run tests
npm test

# Clean build artifacts
npm run clean
```

## Architecture

### Core Module Structure

The codebase is organized into focused, single-purpose modules:

1. **`src/index.ts`** - Core library exports
   - `Machine<C>` and `AsyncMachine<C>` types - fundamental machine shapes
   - `createMachine()` / `createAsyncMachine()` - factory functions for creating machines
   - `runMachine()` - the runtime "interpreter" for async machines with event dispatch
   - `setContext()` - immutably update machine context
   - `overrideTransitions()` / `extendTransitions()` - compose/decorate machines
   - `createMachineBuilder()` - create factory functions from template machines
   - `MachineBase` - optional OOP base class
   - Type utilities: `Context<M>`, `Event<M>`, `Transitions<M>`, etc.

2. **`src/primitives.ts`** - Type-level metadata DSL
   - Annotation functions like `transitionTo()`, `guarded()`, `invoke()`, `action()`, `describe()`
   - These are runtime no-ops but add type-level metadata via branded types
   - Used by static analysis tools to extract formal statecharts
   - The `META_KEY` symbol brands types with `TransitionMeta`

3. **`src/extract.ts`** - Build-time statechart extraction
   - Uses `ts-morph` to perform static analysis on machine source code
   - Reads type-level metadata from primitives to generate JSON statecharts
   - Compatible with Stately Viz and XState tooling
   - Run with: `npx ts-node src/extract.ts > chart.json`

4. **`src/utils.ts`** - High-level utilities
   - `isState()` - type-safe state checking guard
   - `createEvent()` - type-safe event factory for `runMachine`
   - `mergeContext()` - shallow merge context updates
   - `pipeTransitions()` - compose multiple transitions sequentially
   - `logState()` - debugging helper ("tap" function)

5. **`src/react.ts`** - React integration (draft)
   - `useMachine()` hook for React integration
   - Connects machine state changes to React re-renders

6. **`src/devtools.ts`** - Browser DevTools integration (draft)
   - `connectToDevTools()` - connects to browser extension
   - Sends state changes and events to visualization tools

7. **`src/generators.ts`** - Generator-based composition
   - `run()` - Execute generator-based state flows
   - `step()` - Yield state and receive next
   - `runSequence()`, `createFlow()`, `runWithDebug()` - Composition utilities
   - `runAsync()`, `stepAsync()` - Async generator support
   - Enables imperative-style code while maintaining immutability
   - Useful for complex multi-step workflows and testing

8. **`src/solid.ts`** - Solid.js integration
   - `createMachine()` - Signal-based reactive machines
   - `createMachineStore()` - Store-based with fine-grained reactivity
   - `createAsyncMachine()` - Async machines with signals
   - `createMachineContext()` - Context-only store
   - `createMachineSelector()` - Memoized derivations
   - `createMachineEffect()`, `createMachineValueEffect()` - Lifecycle effects
   - Integrates state machines with Solid's fine-grained reactivity

### Key Design Patterns

#### Type-State Programming (THE CORE PARADIGM)

**This is the most important concept in the library.** See README.md for comprehensive documentation on Type-State Programming, including:
- Why Type-State vs. runtime string checks
- 5 categories of bugs TypeScript catches (invalid transitions, data access, pattern matching, type narrowing, event safety)
- Comparison table: Type-State vs. String-Based State
- When to use Type-State vs. simple context-based state
- Full network request state machine example

The library's most powerful feature is using TypeScript types to represent finite states. Different states are represented as different machine types with different available methods:

```typescript
type LoggedOutMachine = Machine<{ status: "loggedOut" }> & {
  login: (username: string) => LoggedInMachine;
};

type LoggedInMachine = Machine<{ status: "loggedIn"; username: string }> & {
  logout: () => LoggedOutMachine;
};
```

This prevents calling `logout()` on a `LoggedOutMachine` or `login()` on a `LoggedInMachine` at compile time.

#### Immutable Updates
Every transition must return a new machine instance. The context is readonly. Use `createMachine()` or `setContext()` to create the next state:

```typescript
increment: function() {
  return createMachine({ count: this.count + 1 }, this);
  // OR
  return setContext(this, (ctx) => ({ count: ctx.count + 1 }));
}
```

#### Function vs. Class Approach
Machines can be created two ways:

1. **Functional** (recommended for simple machines): Use `createMachine()` with inline transition functions
2. **Class-based** (better for complex machines): Extend `MachineBase<C>` and use `createMachineBuilder()` for factory pattern

#### Event-Driven Runtime
For async machines, use `runMachine()` to get a managed runtime:
- Provides `dispatch()` for type-safe event dispatch
- Provides `state` getter for current context
- Handles async transition resolution
- Calls `onChange` callback after each transition

### Type System Architecture

The library heavily uses TypeScript's advanced type features:

- **Branded Types**: `WithMeta<F, M>` intersects functions with metadata for static analysis
- **Type Introspection**: `Context<M>`, `Transitions<M>`, `Event<M>` extract information from machine types
- **Discriminated Unions**: `Event<M>` generates a union of all possible events with correct argument types
- **Conditional Types**: Used throughout for type inference and validation

### Build System

Uses **pridepack** as the build tool, which is a zero-config bundler for TypeScript libraries. The build outputs to `dist/` with:
- ESM modules
- Type declarations (`.d.ts`)
- Source maps

## Common Patterns

### Creating a Simple Machine
```typescript
const counter = createMachine({ count: 0 }, {
  increment: function() {
    return createMachine({ count: this.count + 1 }, this);
  }
});
```

### Creating a Type-State Machine
Define types first, then create factory functions that return those types.

### Adding Metadata for Static Analysis
Wrap transitions with primitives:
```typescript
login = transitionTo(LoggedInMachine, (username) => new LoggedInMachine({ username }));
```

### Testing Machines
Use `overrideTransitions()` to mock transitions in tests.

## Important Notes

- The `context` property should always be treated as readonly (though mutability is technically allowed for flexibility)
- Transition functions receive context as `this` binding
- `runMachine()` is only for async machines; sync machines are called directly
- The primitives module (`transitionTo`, etc.) doesn't change runtime behavior—only adds type metadata
- `src/test.ts` contains an older version with different types—refer to `src/index.ts` for current implementation
- See README.md for comprehensive documentation with formal FSM theory and all API details

## New Utilities Added

### Core Functions
- `next<C>(machine, update)` - Simpler version of setContext
- `matchMachine<M, K, R>(machine, key, handlers)` - Type-safe pattern matching on discriminated unions
- `hasState<M, K, V>(machine, key, value)` - Type guard for state checking with type narrowing
- `createMachineFactory<C>()` - Higher-order function for creating machines with pure context transformers

### Type Utilities
- `BaseMachine<C>` - Base type that both Machine and AsyncMachine extend
- `TransitionNames<M>` - Extracts transition names as string union
- `DeepReadonly<T>` - Makes types deeply immutable
- `InferMachine<F>` - Extracts machine type from factory functions
- `MachineLike<C>` - Machine or Promise<Machine> (for functions that can return either)
- `MachineResult<C>` - Machine or [Machine, cleanup] (for transitions with cleanup effects)
