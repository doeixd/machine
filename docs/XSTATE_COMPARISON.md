# @doeixd/machine vs. XState: In-Depth Comparison

This document provides a comprehensive comparison between `@doeixd/machine` and XState, two different approaches to state machines in TypeScript.

## TL;DR

**Choose `@doeixd/machine` if:**
- You want TypeScript types to BE your states (Type-State Programming)
- You prefer compile-time safety over runtime configuration
- You value minimal API surface and learning curve
- You want to build custom abstractions on minimal primitives
- You prefer imperative method calls over declarative config
- Component-level or moderately complex state machines

**Choose XState if:**
- You need full Statecharts specification (nested states, parallel states, history)
- You want runtime introspection and visualization tools
- You need actor model for complex system orchestration
- You want a mature, battle-tested ecosystem
- You prefer declarative configuration over imperative code
- Application-wide state orchestration

## Core Philosophy Differences

### @doeixd/machine: Type-First Minimalism

**Philosophy:** Use TypeScript's type system as the primary mechanism for state safety. Provide minimal primitives that capture the essence of FSMs, then get out of your way.

**Core Beliefs:**
1. **Types ARE states** - Different machine types represent different states
2. **Compiler is the safety net** - Catch bugs at compile time, not runtime
3. **Minimal magic** - Simple primitives you can understand completely
4. **No magic strings** - Use typed object references for type inference
5. **Build your own** - Foundation for creating domain-specific abstractions

**Code Philosophy:**
```typescript
// States are distinct types
type Idle = Machine<{ status: "idle" }> & {
  start: () => Running;
};

type Running = Machine<{ status: "running" }> & {
  stop: () => Idle;
};

// Type system prevents invalid transitions
const machine: Idle = createIdle();
// machine.stop(); // ❌ Compile error! Can't stop when idle
const running = machine.start(); // ✅ Valid
```

### XState: Statecharts Implementation

**Philosophy:** Implement the full Statecharts formalism with runtime configuration and introspection. Provide a complete, opinionated framework for complex state management.

**Core Beliefs:**
1. **Statecharts are powerful** - Nested states, parallel states, history states
2. **Declarative is better** - Define machine structure in configuration
3. **Visual is better** - Machines should be visualizable and inspectable
4. **Actors for everything** - Actor model for system composition
5. **Convention over configuration** - Opinionated patterns for common tasks

**Code Philosophy:**
```typescript
// Machine is a configuration object
const machine = createMachine({
  id: 'toggle',
  initial: 'idle',
  states: {
    idle: {
      on: { START: 'running' }
    },
    running: {
      on: { STOP: 'idle' }
    }
  }
});

// Runtime interpreter
const service = interpret(machine);
service.send({ type: 'START' });
```

## Detailed Feature Comparison

### 1. Type Safety Approach

#### @doeixd/machine

**Type-State Programming:**
- States are **TypeScript types**, not strings
- Invalid transitions cause **compile errors**
- Type narrowing and inference everywhere
- Zero runtime overhead for type checking

```typescript
type LoggedOut = Machine<{ status: "loggedOut" }> & {
  login: (user: string) => LoggedIn;
};

type LoggedIn = Machine<{ status: "loggedIn"; user: string }> & {
  logout: () => LoggedOut;
  deleteAccount: () => Deleted;
};

// Compiler prevents:
// - Logging in when already logged in
// - Logging out when already logged out
// - Accessing user.username when logged out
```

**Strengths:**
- Maximum compile-time safety
- Impossible to write invalid transitions
- Autocomplete shows only valid transitions
- No runtime state validation needed

**Weaknesses:**
- Requires advanced TypeScript knowledge
- More verbose type definitions
- Can't inspect machine structure at runtime
- Harder to generate visualizations

#### XState

**Runtime Type Safety:**
- States are **string literals** with TypeScript support
- Type safety through configuration validation
- Runtime state validation
- Good TypeScript inference for events and context

```typescript
const machine = createMachine({
  types: {} as {
    context: { user?: string };
    events: { type: 'LOGIN'; user: string } | { type: 'LOGOUT' };
  },
  initial: 'loggedOut',
  states: {
    loggedOut: {
      on: { LOGIN: 'loggedIn' }
    },
    loggedIn: {
      on: { LOGOUT: 'loggedOut' }
    }
  }
});
```

**Strengths:**
- Good TypeScript support within declarative model
- Runtime introspection available
- Can validate machine configuration
- Easier to visualize

**Weaknesses:**
- Can't prevent invalid transitions at compile time
- States are strings (can typo)
- Some type inference limitations
- Runtime overhead for validation

### 2. API Design: Imperative vs. Declarative

#### @doeixd/machine: Imperative

**Direct method calls on machine objects:**

```typescript
const counter = createMachine({ count: 0 }, {
  increment: function() {
    return createMachine({ count: this.count + 1 }, this);
  }
});

// Direct, imperative calls
const next = counter.increment();
const final = next.increment();
```

**Characteristics:**
- Feels like normal JavaScript objects
- Transitions are just function calls
- Excellent autocomplete
- Easy to understand flow
- No string event names

**Strengths:**
- Familiar imperative style
- No learning curve for calling transitions
- IDE support is excellent
- Clear, direct code flow

**Weaknesses:**
- Less declarative structure
- Harder to visualize from code
- No centralized machine definition
- Limited runtime introspection

#### XState: Declarative

**Configuration-based with message passing:**

```typescript
const machine = createMachine({
  initial: 'idle',
  states: {
    idle: {
      on: { INCREMENT: { actions: 'increment' } }
    }
  }
});

const service = interpret(machine);

// Message passing
service.send({ type: 'INCREMENT' });
```

**Characteristics:**
- Entire machine structure in config
- Send events as messages
- Clear state graph
- Runtime introspection
- Centralized definition

**Strengths:**
- Machine structure is explicit
- Easy to visualize
- Can inspect at runtime
- Clear separation of declaration and usage

**Weaknesses:**
- Steeper learning curve
- String-based event names
- Less natural for simple cases
- More ceremony for basic machines

### 3. Feature Set

#### @doeixd/machine Features

**Core:**
- ✅ Finite states (via Type-State Programming)
- ✅ Transitions with arguments
- ✅ Sync and async machines
- ✅ Context (state data)
- ✅ Event dispatch with `runMachine`
- ✅ Immutable updates (by convention)
- ✅ Type-safe events
- ✅ Pattern matching utilities
- ✅ React integration (`useMachine`)

**Advanced:**
- ✅ Machine composition (`extendTransitions`, `overrideTransitions`)
- ✅ Factory pattern (`createMachineFactory`)
- ✅ OOP style (`MachineBase`)
- ✅ Type-level metadata for static analysis
- ✅ DevTools integration (draft)

**Not Included:**
- ❌ Nested states
- ❌ Parallel states
- ❌ History states
- ❌ Built-in delays/timeouts
- ❌ Guards (can implement manually)
- ❌ Invoke/spawn actors
- ❌ Built-in persistence
- ❌ Visual editor

#### XState Features

**Core:**
- ✅ Finite states
- ✅ Transitions
- ✅ Context
- ✅ Actions (entry, exit, transition)
- ✅ Guards (conditional transitions)
- ✅ Delayed transitions
- ✅ Nested states
- ✅ Parallel states
- ✅ History states
- ✅ Final states

**Advanced:**
- ✅ Actor model (spawn, invoke)
- ✅ State machine hierarchy
- ✅ Event-driven architecture
- ✅ Built-in services/effects
- ✅ State machine introspection
- ✅ Time-travel debugging
- ✅ Persistence
- ✅ Visual editor (Stately Studio)
- ✅ React (`useMachine`, `useActor`, etc.)
- ✅ Vue, Svelte, Solid integrations
- ✅ Testing utilities

**Philosophy:**
XState provides everything; `@doeixd/machine` provides primitives to build what you need.

### 4. Complexity & Learning Curve

#### @doeixd/machine

**Complexity:** Low to Medium
- Core concepts: Machine type, createMachine, transitions
- Advanced: Type-State Programming requires TypeScript knowledge
- No new paradigms (just functions and types)

**Learning Curve:**
- ⭐ Basic usage: 5 minutes (create machine, call methods)
- ⭐⭐ Type-State: 30 minutes (understanding type-based states)
- ⭐⭐⭐ Advanced patterns: 1-2 hours (factories, composition)

**When to use:**
- Simple to moderately complex state machines
- When team knows TypeScript well
- When compile-time safety is priority

#### XState

**Complexity:** Medium to High
- Core concepts: States, events, context, actions, guards
- Advanced: Nested states, actors, spawning, history
- New paradigm: Statecharts formalism

**Learning Curve:**
- ⭐⭐ Basic usage: 30 minutes (machine config, send events)
- ⭐⭐⭐ Intermediate: 2-4 hours (guards, actions, services)
- ⭐⭐⭐⭐ Advanced: Days/weeks (actors, spawning, complex hierarchies)

**When to use:**
- Complex application-wide state
- When you need Statecharts features
- When team can invest in learning

### 5. No Magic Strings Philosophy

#### @doeixd/machine

**Philosophy:** Avoid magic strings; use typed object references for automatic type inference.

```typescript
// ✅ No magic strings - everything is a typed reference
const counter = createMachine({ count: 0 }, {
  increment: function() {
    // 'this' is typed as { count: number }
    // 'increment' is a typed method reference
    return createMachine({ count: this.count + 1 }, this);
  }
});

// Type-safe method call (no strings)
counter.increment();

// Events are typed from the machine structure
type CounterEvent = Event<typeof counter>;
// = { type: "increment", args: [] }

// Factory pattern - pure functions, no strings
const factory = createMachineFactory<{ count: number }>()({
  increment: (ctx) => ({ count: ctx.count + 1 }),
  // Functions are keyed by property names (no strings)
});
```

**Benefits:**
- Rename refactoring works perfectly
- Impossible to typo event names
- Full autocomplete support
- Type inference flows naturally
- No runtime string matching

#### XState

**String-Based Events:**

```typescript
// Events are string literals
const machine = createMachine({
  states: {
    idle: {
      on: {
        START: 'running',  // String state name
        FETCH: { target: 'loading' }  // String event name
      }
    }
  }
});

// Send events as strings
service.send({ type: 'START' });
service.send('FETCH');  // Can send bare strings

// TypeScript helps but strings are fundamental
type Events =
  | { type: 'START' }
  | { type: 'FETCH' }
  | { type: 'STOP' };
```

**Trade-offs:**
- More declarative (clear state graph)
- Standard Statecharts notation
- Easy to serialize
- Can typo event names (caught by TS if configured)
- Refactoring requires find-replace

### 6. Use Case Comparison

#### Best for @doeixd/machine

**Excellent for:**
- ✅ Component-level state (forms, modals, toggles)
- ✅ Network request states (idle/loading/success/error)
- ✅ Authentication flows
- ✅ Multi-step wizards
- ✅ UI state machines
- ✅ Building domain-specific state libraries
- ✅ When compile-time safety is critical
- ✅ When team is TypeScript-proficient

**Example:**
```typescript
// Perfect for a form with validation states
type FormIdle = Machine<{ status: "idle"; data: null }> & {
  edit: (data: FormData) => FormEditing;
};

type FormEditing = Machine<{ status: "editing"; data: FormData }> & {
  validate: () => FormValidating;
  cancel: () => FormIdle;
};

type FormValidating = Machine<{ status: "validating"; data: FormData }> & {
  // Async validation
};
```

**Not ideal for:**
- ❌ Complex nested state hierarchies
- ❌ Parallel state regions
- ❌ Actor model systems
- ❌ When you need visual editor
- ❌ When runtime introspection is required

#### Best for XState

**Excellent for:**
- ✅ Application-wide state orchestration
- ✅ Complex workflows with many states
- ✅ Systems with nested/parallel states
- ✅ When you need actors and spawning
- ✅ When you want visual development
- ✅ Integration with state management tools
- ✅ When team prefers declarative style

**Example:**
```typescript
// Perfect for complex checkout flow
const checkoutMachine = createMachine({
  initial: 'cart',
  states: {
    cart: {
      on: { CHECKOUT: 'personal' }
    },
    personal: {
      on: { NEXT: 'shipping', BACK: 'cart' }
    },
    shipping: {
      on: { NEXT: 'payment', BACK: 'personal' }
    },
    payment: {
      states: {
        idle: {},
        processing: {
          invoke: {
            src: 'processPayment',
            onDone: '#checkout.complete',
            onError: 'failed'
          }
        }
      }
    },
    complete: { type: 'final' }
  }
});
```

**Not ideal for:**
- ❌ Simple toggles or counters (overkill)
- ❌ When bundle size is critical
- ❌ When learning time is limited
- ❌ When compile-time type safety is priority

### 7. Performance & Bundle Size

#### @doeixd/machine

**Bundle Size:**
- Core: ~1.3 KB minified + gzipped
- No runtime state machine interpreter
- No visualization tools bundled
- Tree-shakeable

**Performance:**
- Zero runtime overhead for type checking
- Direct function calls (no event matching)
- Minimal abstraction layer
- No runtime validation

**Best for:**
- Bundle-size sensitive applications
- Performance-critical paths
- When you want minimal runtime

#### XState

**Bundle Size:**
- Core: ~15-20 KB minified + gzipped
- Includes full interpreter
- Additional packages for actors, etc.
- More features = larger bundle

**Performance:**
- Runtime state machine interpreter
- Event matching and dispatching
- Validation and guards execution
- More overhead but still very fast

**Best for:**
- When features outweigh size concerns
- Large applications where 15KB doesn't matter
- When runtime introspection is valuable

### 8. Ecosystem & Tooling

#### @doeixd/machine

**Ecosystem:**
- Minimal by design
- React integration included
- DevTools integration (draft)
- Static analysis tools via type metadata
- Build your own extensions

**Tooling:**
- TypeScript compiler (primary tool)
- Standard IDE features (autocomplete, refactor)
- Type-level metadata extraction
- No visual editor (yet)

**Philosophy:**
Provide foundation; community builds ecosystem.

#### XState

**Ecosystem:**
- Mature and extensive
- Official integrations: React, Vue, Svelte, Solid
- Testing utilities (`@xstate/test`)
- Inspection tools (`@xstate/inspect`)
- Persistence, immer integration, etc.

**Tooling:**
- Stately Studio (visual editor)
- VSCode extension
- DevTools inspector
- Visualization tools
- Extensive documentation and examples

**Philosophy:**
Provide complete ecosystem out of the box.

### 9. When to Choose Each

#### Choose @doeixd/machine when:

1. **Type safety is paramount**
   - You want compile-time guarantees
   - Runtime errors are unacceptable
   - You value TypeScript's type system

2. **You prefer minimal abstractions**
   - You want to understand everything
   - You like building on primitives
   - You value simplicity over features

3. **Component-level state**
   - Forms, modals, toggles
   - Network request states
   - UI component state

4. **You want method-call style**
   - Imperative feels natural
   - You prefer `machine.action()` over `send('ACTION')`

5. **Bundle size matters**
   - Every KB counts
   - Performance is critical

6. **Team is TypeScript-proficient**
   - Understands advanced types
   - Values type-driven development

#### Choose XState when:

1. **Complex state requirements**
   - Nested states
   - Parallel states
   - History states
   - Actor model

2. **Visual development**
   - You want visual editor
   - Non-technical stakeholders need to understand
   - Need to generate diagrams

3. **Application-wide orchestration**
   - Coordinating multiple systems
   - Complex workflows
   - State machine hierarchies

4. **Mature ecosystem needed**
   - Want battle-tested solution
   - Need official integrations
   - Value extensive documentation

5. **Runtime introspection**
   - Need to inspect state at runtime
   - Want debugging tools
   - Persistence and serialization

6. **Prefer declarative style**
   - Like configuration objects
   - Message passing feels natural
   - Want centralized state definition

## Code Comparison Examples

### Simple Toggle

**@doeixd/machine:**
```typescript
type Off = Machine<{ on: false }> & { toggle: () => On };
type On = Machine<{ on: true }> & { toggle: () => Off };

const createOff = (): Off => createMachine({ on: false }, {
  toggle: function(): On { return createOn(); }
});

const createOn = (): On => createMachine({ on: true }, {
  toggle: function(): Off { return createOff(); }
});

const toggle = createOff();
const on = toggle.toggle();
const off = on.toggle();
```

**XState:**
```typescript
const toggleMachine = createMachine({
  initial: 'off',
  states: {
    off: { on: { TOGGLE: 'on' } },
    on: { on: { TOGGLE: 'off' } }
  }
});

const service = interpret(toggleMachine);
service.send({ type: 'TOGGLE' });
service.send({ type: 'TOGGLE' });
```

**Analysis:**
- `@doeixd/machine`: More code but type-safe, direct calls
- XState: Less code, declarative, but event strings

### Async Data Fetching

**@doeixd/machine:**
```typescript
type Idle = Machine<{ status: "idle" }> & {
  fetch: () => Promise<Loading | Success | Error>;
};

const createIdle = (): Idle => createAsyncMachine({ status: "idle" }, {
  async fetch() {
    try {
      const data = await fetchData();
      return createSuccess(data);
    } catch (err) {
      return createError(err);
    }
  }
});
```

**XState:**
```typescript
const fetchMachine = createMachine({
  initial: 'idle',
  states: {
    idle: {
      on: { FETCH: 'loading' }
    },
    loading: {
      invoke: {
        src: 'fetchData',
        onDone: { target: 'success', actions: 'setData' },
        onError: { target: 'error', actions: 'setError' }
      }
    },
    success: {},
    error: {}
  }
});
```

**Analysis:**
- `@doeixd/machine`: Async/await feels natural, type-safe
- XState: Declarative invoke, built-in lifecycle

## Conclusion

Both libraries are excellent for their intended use cases:

**@doeixd/machine** is for developers who:
- Value TypeScript's type system above all
- Want minimal, understandable primitives
- Prefer compile-time safety
- Build component-level state machines
- Want to create custom abstractions

**XState** is for developers who:
- Need full Statecharts specification
- Want mature ecosystem and tooling
- Prefer declarative configuration
- Build complex application-wide state
- Value runtime introspection and visualization

Neither is "better"—they have different philosophies and excel in different scenarios. Understanding these differences helps you choose the right tool for your specific needs.
