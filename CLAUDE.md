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

9. **`src/primitives.ts`** - Type-level metadata DSL
   - Annotation functions: `transitionTo()`, `guarded()`, `invoke()`, `action()`, `describe()`, `metadata()`
   - These are runtime **identity functions** (zero overhead) that add type-level metadata
   - The `META_KEY` symbol brands types with `TransitionMeta` for static analysis
   - Used by the extraction tool to generate formal statecharts
   - See "Type-Level Metadata DSL" section below for details

10. **`src/extract.ts`** - Statechart extraction engine
    - Build-time static analysis tool using ts-morph (TypeScript Compiler API)
    - Generates XState-compatible JSON from TypeScript machine definitions
    - **AST-based extraction** - parses source code directly, not type system
    - Core functions:
      - `extractMachine()` - Extract a single machine configuration
      - `extractMachines()` - Extract multiple machines from config
      - `extractMetaFromMember()` - Parse DSL primitive calls from AST
      - `extractFromCallExpression()` - Recursively extract nested metadata
    - Supports all DSL primitives (transitionTo, describe, guarded, action, invoke)
    - See "Statechart Extraction Architecture" section below

11. **`scripts/extract-statechart.ts`** - CLI tool for extraction
    - Commander-based CLI with full argument parsing
    - Config file support (.statechart.config.ts or .json)
    - Watch mode with chokidar for development workflow
    - Output formats: JSON, Mermaid (planned)
    - Schema validation against XState JSON schema
    - Cross-platform file URL handling for Windows

12. **`.statechart.config.ts`** - Extraction configuration
    - TypeScript-based config with type safety
    - Defines which machines to extract and output paths
    - Supports multiple machines in one extraction pass

13. **`schemas/xstate-schema.json`** - XState v5 JSON schema
    - Validation schema for generated statecharts
    - Ensures compatibility with Stately Viz and XState tooling

### Statechart Extraction Architecture

#### Overview

The statechart extraction system provides **two complementary approaches** for generating formal statechart definitions (JSON):

1. **Static Extraction (Build-Time)** - AST-based analysis using ts-morph
2. **Runtime Extraction** - Symbol-based metadata collection from running instances

Both generate XState-compatible JSON for use with Stately Viz and XState tooling.

#### Static Extraction (AST-Based)

#### Why AST-Based Extraction?

**Problem**: TypeScript's type system doesn't preserve concrete generic type instantiations.

When using branded intersection types like `WithMeta<F, M>`, the type checker resolves:
- Generic constraint: `M extends TransitionMeta`
- NOT the concrete value: `{ target: LoggedInMachine, description: "..." }`

**Original Approach (Failed)**:
```typescript
// Tried to extract metadata from type system
const metaType = type.getProperty(META_KEY);
// Result: TypeScript sees "M extends TransitionMeta", not the actual metadata
```

**Current Approach (AST-Based)**:
```typescript
// Parse the actual source code AST instead
login = describe(
  "Start login",  // ← Extract this string literal from AST
  transitionTo(LoggedInMachine, ...)  // ← Extract this class identifier from AST
)
```

This is the **proven approach** used by XState's `@xstate/machine-extractor`.

#### Extraction Pipeline

```
TypeScript Source
    ↓
ts-morph (Parse to AST)
    ↓
Find Class Declarations
    ↓
Analyze Instance Members
    ↓
extractMetaFromMember()
    ↓
extractFromCallExpression() [Recursive]
    ↓
Parse DSL Primitives:
  - transitionTo → target
  - describe → description
  - guarded → guards/cond
  - action → actions array
  - invoke → invoke services
    ↓
Aggregate Metadata
    ↓
Build State Nodes
    ↓
Assemble Chart
    ↓
XState-Compatible JSON
```

#### Key Functions (src/extract.ts)

**`extractMetaFromMember(member, verbose)`**
- Entry point for extracting metadata from a class member
- Checks if member is a PropertyDeclaration with CallExpression initializer
- Returns metadata object or null

**`extractFromCallExpression(call, verbose)`**
- Recursively parses nested DSL primitive calls
- Switches on function name (transitionTo, describe, guarded, etc.)
- Extracts arguments and composes metadata
- Returns aggregated metadata object

**`resolveClassName(node)`**
- Resolves class name identifiers from AST nodes
- Handles both `Identifier` and `TypeOfExpression` nodes

**`parseObjectLiteral(obj)`**
- Parses object literal expressions to plain JavaScript objects
- Handles string, number, boolean literals
- Recursively parses nested objects

**`parseInvokeService(obj)`**
- Specialized parser for invoke service metadata
- Resolves onDone/onError to class names

**`analyzeStateNode(classSymbol, verbose)`**
- Analyzes all instance members of a class
- Separates invoke metadata from on transitions
- Builds state node object: `{ on: {...}, invoke: [...] }`

**`extractMachine(config, project, verbose)`**
- Orchestrates extraction for a single machine
- Loads source file, finds classes, calls analyzeStateNode
- Returns complete statechart object

**`extractMachines(config)`**
- Extracts multiple machines from configuration
- Creates ts-morph Project, processes all machines
- Returns array of statecharts

---

#### Runtime Extraction (Symbol-Based)

**NEW**: Runtime metadata collection system that complements static extraction.

##### Architecture

Runtime extraction uses JavaScript Symbols to attach metadata directly to function objects at runtime:

```typescript
// When DSL primitive is called
transitionTo(TargetState, implFn)
  ↓
attachRuntimeMeta(implFn, { target: "TargetState" })
  ↓
Object.defineProperty(implFn, RUNTIME_META, {
  value: metadata,
  enumerable: false,    // Invisible to iteration
  configurable: true    // Allows composition
})
  ↓
implFn[RUNTIME_META] = { target: "TargetState" }
```

##### Key Design Decisions

1. **Symbol-based storage** - Unique, non-enumerable, no naming conflicts
2. **Mutation with constraints** - Non-enumerable, immutable value, but configurable for composition
3. **Metadata merging** - Nested DSL calls accumulate metadata on same function
4. **Zero runtime cost** - Metadata only accessed during extraction, not execution

##### Core Module (src/runtime-extract.ts)

**`RUNTIME_META: Symbol`** - Non-enumerable symbol for metadata storage

**`attachRuntimeMeta(fn, metadata)`** - Internal helper (not exported)
- Reads existing `fn[RUNTIME_META]`
- Merges with new metadata (smart merging for arrays)
- Redefines property with merged value

**`extractFunctionMetadata(fn)`** - Public API
- Returns `fn[RUNTIME_META]` or null
- Used for inspecting individual transitions

**`extractStateNode(instance)`** - Public API
- Iterates over instance properties
- Filters for functions with metadata
- Separates invoke services from transitions
- Returns XState-compatible state node

**`generateStatechart(states, config)`** - Public API
- Takes object mapping state names to instances
- Calls `extractStateNode()` for each
- Assembles complete XState JSON

**`extractFromInstance(instance, config)`** - Public API
- Convenience wrapper for single-state extraction
- Uses `constructor.name` as state name

##### DSL Primitive Updates

All DSL primitives in `src/primitives.ts` now call `attachRuntimeMeta()`:

- `transitionTo()` → attaches `{ target: className }`
- `describe()` → attaches `{ description: string }`
- `guarded()` → attaches `{ guards: [guard] }` (mergeable)
- `action()` → attaches `{ actions: [action] }` (mergeable)
- `invoke()` → attaches `{ invoke: { src, onDone, onError } }`

##### Comparison: Static vs Runtime

| Feature | Static Extraction | Runtime Extraction |
|---------|------------------|-------------------|
| When | Build time | Runtime |
| Input | TypeScript source | Running instances |
| Dependencies | ts-morph | None (pure JS) |
| Use Case | CI/CD, docs | Debugging, DevTools |
| Dynamic values | ❌ Literals only | ✅ Resolved at runtime |
| Overhead | Build time | ~40-80 bytes/function |

**Recommendation**: Use both. Static for docs/CI, runtime for debugging.

---

#### Type-Level Metadata DSL

The DSL primitives serve **four purposes** now:
1. **Runtime**: Attach metadata via Symbols
2. **Compile-time**: Type-level documentation and safety
3. **Build-time**: Parsed by static extraction tool
4. **Type branding**: Enable type inference and checking

**Core Primitive Signatures**:

```typescript
// Declare target state
transitionTo<T extends ClassConstructor, F>(target: T, impl: F)
  : WithMeta<F, { target: T }>

// Add description
describe<F, M>(text: string, transition: WithMeta<F, M>)
  : WithMeta<F, M & { description: string }>

// Add guard condition
guarded<F, M>(guard: GuardMeta, transition: WithMeta<F, M>)
  : WithMeta<F, M & { guards: [typeof guard] }>

// Async service invocation
invoke<D, E, F>(service: InvokeMeta, impl: F)
  : WithMeta<F, { invoke: typeof service }>

// Side-effect action
action<F, M>(action: ActionMeta, transition: WithMeta<F, M>)
  : WithMeta<F, M & { actions: [typeof action] }>
```

**The META_KEY Branding**:
```typescript
const META_KEY = Symbol("MachineMeta");
type WithMeta<F, M> = F & { [META_KEY]: M };
```

At runtime, this is completely erased. At build-time, the extraction tool:
1. Finds the CallExpression in the AST
2. Parses the function name and arguments
3. Extracts literal values
4. Ignores the type branding entirely

#### Configuration System

**MachineConfig**:
```typescript
interface MachineConfig {
  input: string;           // Source file path
  classes: string[];       // State class names
  output?: string;         // Output file (optional)
  id: string;             // Machine ID
  initialState: string;   // Initial state class name
  description?: string;   // Optional description
}
```

**ExtractionConfig**:
```typescript
interface ExtractionConfig {
  machines: MachineConfig[];
  validate?: boolean;     // Validate against XState schema
  format?: 'json' | 'mermaid' | 'both';
  watch?: boolean;        // Watch mode
  verbose?: boolean;      // Debug logging
}
```

#### CLI Architecture (scripts/extract-statechart.ts)

**Commander-based** with these features:
- Argument parsing with type safety
- Config file loading (TypeScript and JSON)
- Watch mode using chokidar
- File URL handling for cross-platform compatibility (Windows file:// URLs)
- Validation against XState JSON schema (placeholder)
- Mermaid diagram generation (planned)

**Key Functions**:
- `loadConfig()` - Loads .ts or .json config with proper module imports
- `pathToFileURL()` - Converts Windows paths to file:// URLs
- `writeOutput()` - Writes JSON or Mermaid to file/stdout
- `extract()` - Main extraction orchestrator
- `watch()` - Watch mode with chokidar

#### Output Format

XState v5 compatible JSON:
```json
{
  "id": "machineName",
  "initial": "InitialState",
  "states": {
    "StateName": {
      "on": {
        "eventName": {
          "target": "TargetState",
          "description": "...",
          "cond": "guardName",
          "actions": ["action1", "action2"]
        }
      },
      "invoke": [{
        "src": "serviceName",
        "onDone": { "target": "SuccessState" },
        "onError": { "target": "ErrorState" }
      }]
    }
  }
}
```

#### Limitations

1. **Class-based machines only** - Functional machines not supported
2. **Literal arguments required** - No computed values or variables
3. **Source code must be available** - Can't extract from compiled JS
4. **Guard/action implementations not extracted** - Only metadata/names

#### Examples

See `examples/` directory for annotated machines:
- `authMachine.ts` - Full authentication flow with all primitives
- `fetchMachine.ts` - Data fetching with invoke services
- `formMachine.ts` - Multi-step wizard
- `trafficLightMachine.ts` - Simple cyclic machine

Run extraction: `npm run extract`

Generated statecharts: `statecharts/*.json`

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
