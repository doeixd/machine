# Choosing the Right Pattern: A Decision Guide

The `@doeixd/machine` library provides multiple patterns for different use cases. This guide helps you choose the right approach for your specific needs.

## Quick Decision Tree

```
What are you building?

├── Component/Local State (React, Solid, etc.)
│   ├── Simple state → Basic Machine + useMachine hook
│   ├── Complex workflows → Basic Machine + Generators
│   └── Performance-critical → Basic Machine + useMachineSelector
│
├── Global/Shared State
│   ├── Single machine → Runner (createRunner)
│   ├── Multiple coordinated machines → Ensemble (createEnsemble)
│   └── Framework-agnostic → Ensemble with external store
│
├── Library/SDK Development
│   ├── Simple API → Basic Machine
│   ├── Factory pattern → createMachineFactory
│   ├── OOP preference → MachineBase classes
│   └── Complex state machines → Type-State Programming
│
├── Backend/Services
│   ├── Stateless → Basic Machine
│   ├── Stateful → Runner or Mutable Machine
│   └── Performance-critical → Mutable Machine
│
└── Testing & Prototyping
    ├── Quick experiments → Basic Machine
    ├── Complex scenarios → Generators + Runner
    └── State exploration → Time Travel middleware
```

## Pattern Overview

### Basic Machines (Foundation)

**What it is:** The core primitive - immutable state machines created with `createMachine()`.

**When to use:**
- ✅ **Learning the library** - start here
- ✅ **Simple state logic** - counters, toggles, basic forms
- ✅ **Library internals** - building other patterns on top
- ✅ **Pure functions** - predictable, testable logic
- ✅ **Type-State Programming** - compile-time state safety

**When NOT to use:**
- ❌ **Complex component state** - too much boilerplate
- ❌ **Global state** - requires external state management
- ❌ **OOP preferences** - functional style only

**Example:**
```typescript
const counter = createMachine({ count: 0 }, (next) => ({
  increment() { return next({ count: this.context.count + 1 }); }
}));

const next = counter.increment(); // New machine instance
```

### Factories (createMachineFactory)

**What it is:** Higher-order function that creates machine constructors with pure context transformers.

**When to use:**
- ✅ **DRY principle** - avoid repeating `createMachine` calls
- ✅ **Pure functions** - separate logic from structure
- ✅ **Testing** - easier to test transformers in isolation
- ✅ **Configuration** - different machines from same logic

**When NOT to use:**
- ❌ **Simple cases** - adds unnecessary abstraction
- ❌ **OOP style** - functional approach
- ❌ **Runtime state** - factories are for creation, not mutation

**Example:**
```typescript
const counterFactory = createMachineFactory<{ count: number }>()({
  increment: (ctx) => ({ count: ctx.count + 1 }),
  add: (ctx, n: number) => ({ count: ctx.count + n })
});

const counter = counterFactory({ count: 0 });
const result = counter.add(5); // { count: 5 }
```

### Runner (createRunner) - Stateful Controllers

**What it is:** Stateful wrapper that manages a single machine internally, providing stable `actions` object.

**When to use:**
- ✅ **Component state** - React, Solid, Vue components
- ✅ **Stable references** - avoid `machine = machine.transition()` chains
- ✅ **Event handlers** - direct binding to UI events
- ✅ **Local state management** - single machine per component/feature
- ✅ **Imperative style** - call actions without reassignment

**When NOT to use:**
- ❌ **Global state** - use Ensemble instead
- ❌ **Multiple machines** - coordination becomes complex
- ❌ **Pure functions** - stateful by design

**Example:**
```typescript
// React component
function Counter() {
  const runner = useRunner(() => createCounterMachine({ count: 0 }));

  return (
    <div>
      <p>Count: {runner.context.count}</p>
      <button onClick={() => runner.actions.increment()}>+</button>
      {/* No reassignment needed! */}
    </div>
  );
}
```

### Ensemble (createEnsemble) - Global State Orchestration

**What it is:** Coordinates multiple machines that share the same context store, like musicians in an orchestra.

Each ensemble owns the factories and discriminant for one domain. Coordination happens when multiple ensembles read and write the same current context; it is not direct machine-to-machine messaging. See [Ensembles and multi-machine coordination](ensembles.md) for a complete example and the store contract.

**When to use:**
- ✅ **Global state** - app-wide state management
- ✅ **Multiple domains** - auth, data, UI state coordination
- ✅ **Framework agnostic** - works with any state store
- ✅ **External sync** - databases, APIs, real-time updates
- ✅ **Complex apps** - multiple independent state machines

**When NOT to use:**
- ❌ **Simple apps** - overkill for basic state
- ❌ **Component state** - use Runner instead
- ❌ **Single machine** - Runner is simpler

**Example:**
```typescript
// Global app state
type AppState = {
  auth: { user: string | null };
  data: { status: 'idle' | 'loading'; items: unknown[] };
};

// Machines for different domains
const authEnsemble = createEnsemble(store, {
  loggedOut: (ctx) => createMachine(ctx, {
    login: (user: string) => store.setContext({ ...ctx, auth: { user } })
  }),
  loggedIn: (ctx) => createMachine(ctx, {
    logout: () => store.setContext({ ...ctx, auth: { user: null } })
  })
}, (ctx) => ctx.auth.user ? 'loggedIn' : 'loggedOut');

const dataEnsemble = createEnsemble(store, {
  idle: (ctx) => createMachine(ctx, {
    fetch: () => store.setContext({ ...ctx, data: { ...ctx.data, status: 'loading' } })
  }),
  loading: (ctx) => createMachine(ctx, {
    resolve: (items: unknown[]) => store.setContext({
      ...ctx,
      data: { status: 'idle', items }
    })
  })
}, (ctx) => ctx.data.status);

// They share the same store but handle different concerns
authEnsemble.actions.login('alice');
dataEnsemble.actions.fetch();
dataEnsemble.actions.resolve(await api.get());
```

### Generators (run, step) - Complex Workflows

**What it is:** Generator-based composition for imperative, sequential code that maintains immutability.

**When to use:**
- ✅ **Complex workflows** - multi-step processes, sagas
- ✅ **Sequential logic** - if/else, loops, try/catch
- ✅ **Async operations** - API calls, timeouts, complex transitions
- ✅ **Testing** - step-by-step workflow testing
- ✅ **Debugging** - pause and inspect at any step

**When NOT to use:**
- ❌ **Simple transitions** - overkill for basic state changes
- ❌ **Performance critical** - generator overhead
- ❌ **OOP style** - functional approach

**Example:**
```typescript
const result = run(function* (machine) {
  // Sequential workflow
  let m = yield* step(machine.validateInput());
  if (m.context.isValid) {
    m = yield* step(m.submitForm());
    m = yield* step(m.showSuccess());
  } else {
    m = yield* step(m.showErrors());
  }

  // Loops work naturally
  for (let i = 0; i < 3; i++) {
    m = yield* step(m.retry());
  }

  return m.context.result;
}, initialMachine);
```

### Classes (`MachineBase`, `StoreMachineBase`)

**What it is:** Object-oriented approach with class-based machines.

`MachineBase` models immutable class snapshots whose methods return the next machine. `StoreMachineBase` is different: it supplies protected access to an external `StateStore`, and `createStoreMachine` places that class instance behind a proxy with the store's read-only live context fields. It does not create multiple machines or make methods state-specific. See [Store machines](multi-machine.md).

**When to use:**
- ✅ **OOP preference** - familiar class syntax
- ✅ **Complex machines** - organize logic in methods
- ✅ **Inheritance** - extend and customize machines
- ✅ **Large codebases** - co-locate related logic
- ✅ **TypeScript classes** - leverage class features

**When NOT to use:**
- ❌ **Simple cases** - functional approach is simpler
- ❌ **Pure functions** - classes encourage side effects
- ❌ **Functional programming** - OOP paradigm

**Example:**
```typescript
class Counter extends MachineBase<{ count: number }> {
  constructor(count = 0) {
    super({ count });
  }

  increment(): Counter {
    return new Counter(this.context.count + 1);
  }

  add(n: number): Counter {
    return new Counter(this.context.count + n);
  }
}

const counter = new Counter(5);
const result = counter.add(10); // count: 15
```

## Detailed Use Case Guide

### Building a React Component

**Scenario:** You need state management for a form component with validation and submission.

**Recommended:** Runner + Basic Machine + Middleware

```typescript
function ContactForm() {
  const runner = useRunner(() => createContactMachine({
    name: '', email: '', status: 'idle'
  }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    await runner.actions.submit();
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={runner.context.name}
        onChange={(e) => runner.actions.updateName(e.target.value)}
      />
      {/* ... */}
      <button disabled={runner.context.status === 'submitting'}>
        {runner.context.status === 'submitting' ? 'Sending...' : 'Send'}
      </button>
    </form>
  );
}
```

**Why Runner?** Stable `actions` object, no reassignment needed, perfect for React event handlers.

### Building a Global State Store

**Scenario:** Your app has authentication, user preferences, and data fetching state that needs to be shared across components.

**Recommended:** Ensemble with external store

```typescript
// Zustand store
const useAppStore = create((set, get) => ({
  auth: { user: null },
  prefs: { theme: 'light' },
  data: { items: [] }
}));

const store = {
  getContext: () => useAppStore.getState(),
  setContext: (newState) => useAppStore.setState(newState)
};

// Create ensembles for different domains
const authEnsemble = createEnsemble(store, authFactories, (ctx) => ctx.auth.user ? 'loggedIn' : 'loggedOut');
const prefsEnsemble = createEnsemble(store, prefsFactories, (ctx) => ctx.prefs.theme);

// Use in components
function App() {
  return (
    <AuthProvider ensemble={authEnsemble}>
      <PrefsProvider ensemble={prefsEnsemble}>
        {/* ... */}
      </PrefsProvider>
    </AuthProvider>
  );
}
```

**Why Ensemble?** Coordinates multiple state machines, framework-agnostic, easy to test and persist.

### Building a Library/SDK

**Scenario:** You're creating a state machine library for others to use, like a form validation library or API client.

**Recommended:** Type-State Programming + Factories

```typescript
// Define state types
type Idle = Machine<{ status: 'idle' }> & {
  submit: (data: FormData) => Submitting;
};

type Submitting = Machine<{ status: 'submitting'; data: FormData }> & {
  success: (result: any) => Success;
  error: (error: string) => Error;
};

// Factory for users
export function createFormMachine(initialData: FormData): Idle {
  return createMachine({ status: 'idle' }, {
    submit: function(data: FormData): Submitting {
      return createSubmitting(data);
    }
  });
}

// Users get compile-time safety
const form = createFormMachine({ name: '', email: '' });
const submitting = form.submit(formData);
// submitting.success is available, submitting.submit is not
```

**Why Type-State?** Compile-time guarantees, self-documenting API, prevents misuse.

### Backend Service with Stateful Logic

**Scenario:** A long-running service that maintains state between requests, like a game server or workflow engine.

**Recommended:** Mutable Machine or Runner

```typescript
// Mutable machine for performance
const gameServer = createMutableMachine(
  { players: [], gameState: 'waiting' },
  {
    waiting: (ctx) => createMachine(ctx, {
      join: (player) => ({ ...ctx, players: [...ctx.players, player] })
    }),
    playing: (ctx) => createMachine(ctx, {
      move: (move) => ({ ...ctx, /* update game */ })
    })
  },
  (ctx) => ctx.gameState
);

// Single reference, mutates in place
gameServer.join(player1);
gameServer.join(player2);
console.log(gameServer.players); // [player1, player2]
```

**Why Mutable?** Performance in hot loops, stable reference for long-running processes.

### Complex Business Workflow

**Scenario:** A multi-step business process with conditional logic, retries, and error handling.

**Recommended:** Generators + Runner + Middleware

```typescript
const workflow = runWithRunner(async function* (runner) {
  try {
    // Step 1: Validate input
    yield* step(runner.actions.validate());

    // Step 2: Process with retry
    let attempts = 0;
    while (attempts < 3) {
      try {
        yield* step(await runner.actions.process());
        break;
      } catch (error) {
        attempts++;
        yield* step(runner.actions.logError(error, attempts));
        if (attempts < 3) {
          yield* step(runner.actions.wait(1000 * attempts));
        }
      }
    }

    // Step 3: Finalize
    yield* step(runner.actions.finalize());

  } catch (error) {
    yield* step(runner.actions.handleError(error));
  }
}, initialMachine);
```

**Why Generators?** Sequential logic with error handling, async operations, complex control flow.

## Pattern Comparison Table

| Pattern | Complexity | Performance | Type Safety | Use Case |
|---------|------------|-------------|-------------|----------|
| **Basic Machine** | Low | High | High | Simple state, learning, foundations |
| **Factories** | Medium | High | High | DRY, pure functions, testing |
| **Runner** | Medium | Medium | High | Component state, UI integration |
| **Ensemble** | High | Medium | High | Global state, coordination |
| **Generators** | High | Low | High | Complex workflows, async logic |
| **Classes** | Medium | Medium | High | OOP, complex machines, inheritance |

## Migration Guide

### From Redux to Ensemble

```typescript
// Redux reducer
const reducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN': return { ...state, user: action.payload };
    case 'LOGOUT': return { ...state, user: null };
  }
};

// Ensemble approach
const authEnsemble = createEnsemble(store, {
  loggedOut: (ctx) => createMachine(ctx, {
    login: (user) => ({ ...ctx, auth: { user } })
  }),
  loggedIn: (ctx) => createMachine(ctx, {
    logout: () => ({ ...ctx, auth: { user: null } })
  })
}, (ctx) => ctx.auth.user ? 'loggedIn' : 'loggedOut');
```

### From useState to Runner

```typescript
// React useState
const [count, setCount] = useState(0);
const increment = () => setCount(c => c + 1);

// Runner approach
const runner = useRunner(() => createCounterMachine({ count: 0 }));
// runner.actions.increment() - no custom setters needed
```

### From XState to Type-State

```typescript
// XState
const machine = createMachine({
  states: {
    idle: { on: { TOGGLE: 'active' } },
    active: { on: { TOGGLE: 'idle' } }
  }
});

// Type-State approach
type Idle = Machine<{ state: 'idle' }> & { toggle: () => Active };
type Active = Machine<{ state: 'active' }> & { toggle: () => Idle };

const createIdle = (): Idle => createMachine({ state: 'idle' }, {
  toggle: () => createActive()
});
```

## Best Practices

### Start Simple
Begin with Basic Machines. Add complexity only when needed.

### Choose Based on Scope
- **Component:** Runner
- **Feature:** Ensemble
- **App:** Multiple Ensembles
- **Library:** Type-State + Factories

### Consider Performance
- Basic Machines: Highest performance
- Mutable Machines: Best for hot loops
- Generators: Highest overhead

### Testability
- Pure functions (Basic + Factories): Easiest to test
- Generators: Great for integration tests
- Classes: Traditional unit testing

### Team Preferences
- Functional programmers: Basic Machines + Generators
- OOP developers: Classes + Runner
- Mixed teams: Runner + Ensemble

Remember: You can mix patterns! Use the right tool for each job.
