# @doeixd/machine

A TypeScript state-machine library built around immutable snapshots and typestate.

The core runtime is deliberately small: a machine is an object with a `context` property and transition methods. A transition returns the next machine snapshot. TypeScript can then represent different states as different types, making invalid transitions unavailable at compile time.

If you already know what you need, jump to the [main API](#main-api) or [task-oriented documentation map](docs/README.md). For the design behind the API, continue with the core tenets below.

## Install

```bash
npm install @doeixd/machine
```

Node 18 or newer is supported. React and Solid are optional peer dependencies used only by their framework entry points.

## Documentation

| Topic | Guide |
| --- | --- |
| Public API and supported behavior | [Supported API](docs/api.md) |
| Mathematical model and guarantee boundaries | [State machines from first principles](docs/principles.md) |
| Factories, classes, and `this` behavior | [Factories](docs/factories.md), [transition binding](docs/this-binding.md) |
| Async work and ownership | [Cancellation](docs/abort.md), [actors](docs/actor.md) |
| Multi-machine coordination | [Ensembles](docs/ensembles.md) |
| Class-based external-store façade | [`StoreMachine`](docs/multi-machine.md) |
| Nested and conditional behavior | [Composition guide](docs/nested-and-conditional.md), [guards](docs/conditional-transitions.md) |
| Transition policies | [Middleware](docs/middleware.md) |
| Pattern matching | [Advanced matcher](#advanced-matching), [matcher API](docs/api.md#pattern-matching) |
| Composition | [Nested and conditional machines](docs/nested-and-conditional.md), [delegation](docs/delegate.md), [higher-order machines](docs/higher-order.md), [mixins](docs/mixins.md) |
| Package entry points | [Published modules](docs/modules.md) |
| Diagrams and formal output | [Statechart extraction](docs/statechart-extraction.md) |

The [complete documentation map](docs/README.md) also separates supported guides from design notes and historical essays.

## The Core Tenets of a State Machine

The central idea of this library is deliberately plain: **a machine is a state snapshot with typed functions that return the next snapshot**. The API follows the mathematical model instead of hiding it behind a configuration language.

For a classic finite-state machine `(S, Σ, δ, s₀, F)`:

| Formal part | Representation in this library |
| --- | --- |
| `S` — control states | A finite union of typestates, tagged objects, or state classes. Each variant exposes only the transitions valid from that state. |
| `Σ` — inputs | Transition method names plus their typed arguments: `login(username)`, `resolve(data)`, and so on. Event objects are available when a runner or actor needs message dispatch. |
| `δ` — transition function | The transition methods themselves. Given the current snapshot and input, each returns the next snapshot. In typestate models this is intentionally a partial function: an invalid transition is absent rather than represented by a failing string lookup. |
| `s₀` — initial state | The initial snapshot passed to `createMachine()` or a runner. |
| `F` — final states | Optional terminal typestates with no outgoing transitions. The library does not require every machine to have a final state. |

Real applications usually need an **extended state machine**: a small, finite set of control states plus data such as a username, count, or response. That data lives under `context`. Its values need not be finite; the typestate union remains the finite control model.

This mapping drives the design:

- **State is explicit.** A returned machine is a complete snapshot, so history is not ambient hidden state.
- **Valid transitions are structural.** If a loading state cannot `load` again, its TypeScript type simply has no `load` method.
- **Inputs are ordinary function arguments.** Refactoring, parameter checking, and autocomplete use normal TypeScript rather than parallel string schemas.
- **The core stays executable.** Guards can be conditions, actions can be function calls, and transitions can use the rest of the language.
- **Analysis is opt-in metadata.** When diagrams or formal statecharts matter, annotations describe the same executable transition instead of creating a second machine definition.

There are honest limits to these guarantees. TypeScript checks the model at compile time, but JavaScript can still mutate nested data, read global state, perform effects, or return nondeterministic results. Immutability, determinism, and the Markov property—depending only on the current snapshot and input—are design rules supported by the API, not runtime laws enforced by it.

Read [State machines from first principles](docs/principles.md) for the formal model and the exact boundary of these guarantees.

## Main API

Main-API machines store data under `context`.

```ts
import { createMachine } from '@doeixd/machine';

const counter = createMachine({ count: 0 }, (next) => ({
  increment() {
    return next({ count: this.context.count + 1 });
  },
  add(amount: number) {
    return next({ count: this.context.count + amount });
  },
}));

const updated = counter.increment().add(4);

console.log(counter.context.count); // 0
console.log(updated.context.count); // 5
```

The factory form is recommended because it preserves the transition set without manually passing it to every new snapshot. The traditional transition-object overload remains supported.

See the [supported API](docs/api.md), [factory guide](docs/factories.md), and [`this` binding guide](docs/this-binding.md) for the available construction forms and composition rules.

### Explicit typestates

```ts
import { createMachine, type TypeState } from '@doeixd/machine';

type LoggedOut = TypeState<{ status: 'loggedOut' }, {
  login(username: string): LoggedIn;
}>;

type LoggedIn = TypeState<{ status: 'loggedIn'; username: string }, {
  logout(): LoggedOut;
}>;
```

Each state type lists only its valid transitions. The compiler, rather than a runtime string table, rejects calls to transitions that do not exist on the current state.

### Async transitions and cancellation

`runMachine` owns the current async snapshot and dispatches typed events. Starting another transition aborts the previous in-flight transition.

```ts
import {
  createAsyncMachine,
  runMachine,
  type TransitionOptions,
} from '@doeixd/machine';

const machine = createAsyncMachine({ value: 0 }, {
  async load(amount: number, { signal }: TransitionOptions) {
    const response = await fetch(`/value?amount=${amount}`, { signal });
    const value = await response.json() as number;
    return createAsyncMachine({ value }, this);
  },
});

const runner = runMachine(machine);
await runner.dispatch({ type: 'load', args: [5] });
console.log(runner.state.value);

runner.stop();
```

`runner.state` is the current context, not the entire machine. The dispatch result is the entire next machine.

See [Async cancellation](docs/abort.md) for dispatch ordering, `AbortSignal`, stale results, and shutdown behavior.

### Actors

Actors add queued async dispatch, subscriptions, and stable RPC-style actions.

```ts
import { createActor } from '@doeixd/machine';

const actor = createActor(counter);
const unsubscribe = actor.subscribe((state) => {
  console.log(state.context.count);
});

actor.send.increment();
unsubscribe();
```

See [Actors](docs/actor.md) for mailbox ordering, lifecycle, inspection, and promise or observable adapters.

### Advanced matching

`createMatcher` turns a machine union into three complementary APIs: a callable state classifier, reusable type guards, and exhaustive case handling.

```ts
import {
  MachineBase,
  classCase,
  createMatcher,
} from '@doeixd/machine';

class Idle extends MachineBase<{ status: 'idle' }> {}
class Loading extends MachineBase<{ status: 'loading'; startedAt: number }> {}
class Success extends MachineBase<{ status: 'success'; data: string }> {}
class Failed extends MachineBase<{ status: 'error'; error: Error }> {}

type FetchMachine = Idle | Loading | Success | Failed;

const matchFetch = createMatcher(
  classCase('idle', Idle),
  classCase('loading', Loading),
  classCase('success', Success),
  classCase('error', Failed),
);

function describeFetch(snapshot: FetchMachine): string {
  matchFetch(snapshot); // 'idle' | 'loading' | 'success' | 'error' | null

  if (matchFetch.is.success(snapshot)) {
    console.log(snapshot.context.data); // narrowed to Success
  }

  return matchFetch.when(snapshot).is(
    matchFetch.case.idle(() => 'Ready'),
    matchFetch.case.loading(state => `Started at ${state.context.startedAt}`),
    matchFetch.case.success(state => `Loaded: ${state.context.data}`),
    matchFetch.case.error(state => `Failed: ${state.context.error.message}`),
    matchFetch.exhaustive,
  );
}
```

Omitting a case makes the inferred result an error type instead of `string`. For discriminated contexts, `forContext<ContextUnion>()` provides concise case builders; `customCase` accepts arbitrary type-guard predicates. See the [matcher API](docs/api.md#pattern-matching) and [matcher module](docs/modules.md#doeixdmachinematcher).

### Middleware and orchestration

The main entry also exports:

- transition middleware, validation, retry, history, snapshots, and time travel;
- `createRunner` for a stable imperative façade over immutable snapshots;
- `createEnsemble` for coordinating multiple machine domains through shared external state;
- `createStoreMachine` for class methods over read-only live fields from an external store;
- pattern matching for class states and discriminated contexts;
- class and functional mixins;
- generator-based transition composition.

These are optional layers. They are not required to use the core machine factories.

Continue with [Middleware](docs/middleware.md), [conditional transitions](docs/conditional-transitions.md), or the [higher-order machine guide](docs/higher-order.md).

## React

```tsx
import { createMachine, useMachine } from '@doeixd/machine/react';

const initial = createMachine({ count: 0 }, (next) => ({
  increment() {
    return next({ count: this.context.count + 1 });
  },
}));

function Counter() {
  const [machine, actions] = useMachine(() => initial);
  return <button onClick={actions.increment}>{machine.context.count}</button>;
}
```

See the [React API notes](docs/api.md#react-entry-doeixdmachinereact) for selectors, contexts, ensembles, and actor hooks.

## Solid

The Solid entry exports reactive helpers. Import non-reactive factories from the package root.

```tsx
import { createMachine as createCoreMachine } from '@doeixd/machine';
import { createMachine } from '@doeixd/machine/solid';

const initial = () => createCoreMachine({ count: 0 }, (next) => ({
  increment() {
    return next({ count: this.context.count + 1 });
  },
}));

function Counter() {
  const [machine, actions] = createMachine(initial);
  return <button onClick={actions.increment}>{machine().context.count}</button>;
}
```

Solid action objects are stable and resolve transitions against the current snapshot. Calling an action that is unavailable in the current typestate throws a descriptive runtime error.

See the [Solid API notes](docs/api.md#solid-entry-doeixdmachinesolid) for stores, selectors, batching, contexts, async ownership, and effects.

## Minimal API

The optional `@doeixd/machine/minimal` entry uses flat snapshots: state and transitions live on the same object.

```ts
import { machine } from '@doeixd/machine/minimal';

const counter = machine({ count: 0 }, (state, next) => ({
  increment: () => next({ count: state.count + 1 }),
  add: (amount: number) => next({ count: state.count + amount }),
}));

const updated = counter.increment().add(4);

console.log(counter.count); // 0
console.log(updated.count); // 5
```

Use `factory()` when the same machine should be instantiated with different initial data. Use `union()` with tagged states when each state has a different set of transitions.

```ts
import { tag, type States, union, type UnionOf } from '@doeixd/machine/minimal';

type FetchState = States<{
  idle: {};
  loading: { url: string };
  success: { data: string };
}>;

const State = tag.enum(
  tag('idle'),
  tag('loading'),
  tag('success'),
);

const createFetch = union<FetchState>()({
  idle: (_state, next) => ({
    load: (url: string) => next(State.loading({ url })),
  }),
  loading: (_state, next) => ({
    resolve: (data: string) => next(State.success({ data })),
    cancel: () => next(State.idle()),
  }),
  success: (_state, next) => ({
    reset: () => next(State.idle()),
  }),
});

type FetchMachine = UnionOf<typeof createFetch>;

const first: FetchMachine = createFetch(State.idle());
const second = first.load('/api/data');
// second.load(...) is a type error: loading states do not have `load`.
```

The main and minimal APIs intentionally use different snapshot shapes; their examples are not interchangeable without adjusting property access. See [docs/minimal.md](docs/minimal.md) for factories, tagged unions, exhaustive matching, lifecycle hooks, child composition, and the exact boundary of this smaller runtime.

## Published modules

Every entry below is built as ESM and CommonJS and includes TypeScript declarations. `npm run build` fails if any configured export target is missing.

| Subpath | Purpose |
| --- | --- |
| `@doeixd/machine` | Complete main API |
| `@doeixd/machine/core` | Main API without React or Solid helpers |
| `@doeixd/machine/minimal` | Flat typestate API |
| `@doeixd/machine/actor` | Actors, spawning, promises, and observables |
| `@doeixd/machine/adapters` | EventTarget, EventEmitter, and Observable adapters |
| `@doeixd/machine/base` | `MachineBase` only |
| `@doeixd/machine/context-bound` | Context-bound transition helpers |
| `@doeixd/machine/delegate` | Child-transition delegation |
| `@doeixd/machine/devtools` | Browser DevTools connection helper |
| `@doeixd/machine/extract` | Programmatic static statechart extraction |
| `@doeixd/machine/functional-combinators` | Functional construction and transition combinators |
| `@doeixd/machine/generators` | Generator-based transition sequences |
| `@doeixd/machine/higher-order` | Higher-order machine transformations |
| `@doeixd/machine/matcher` | Reusable typed pattern matching |
| `@doeixd/machine/middleware` | Middleware, composition, history, snapshots, and time travel |
| `@doeixd/machine/mixins` | Class and functional machine composition |
| `@doeixd/machine/multi` | Runners, ensembles, and multi-machine coordination |
| `@doeixd/machine/primitives` | Guards and metadata annotations |
| `@doeixd/machine/runtime-extract` | Statechart metadata extraction from live instances |
| `@doeixd/machine/types` | Tagged-state runtime and type helpers |
| `@doeixd/machine/utils` | Events, context helpers, binding, and sequences |
| `@doeixd/machine/react` | React integration |
| `@doeixd/machine/solid` | Solid integration |

Focused subpaths are useful when you want an explicit dependency boundary or a smaller direct bundle. Files such as `internal-transitions.ts`, `entry-react.ts`, and `entry-solid.ts` are implementation details and are deliberately not public subpaths.

See the [published module guide](docs/modules.md) for the main exports, intended use, and caveats of each entry point.

## Statechart extraction

Metadata helpers annotate transition functions for runtime or build-time extraction. The metadata decorators (`transitionTo`, `describe`, `guarded`, `invoke`, `action`, and `metadata`) support direct and curried forms, and `pipe` applies the curried operators from left to right. Runtime-enforcing guards retain their direct and fluent APIs.

```ts
import { action, describe, pipe, transitionTo } from '@doeixd/machine';

class Loading {}

class Idle {
  start = pipe(
    () => new Loading(),
    transitionTo(Loading),
    describe('Start loading'),
    action({ name: 'recordStart' }),
  );
}
```

The equivalent nested form remains supported:

```ts
const start = describe(
  'Start loading',
  transitionTo(Loading, () => new Loading()),
);
```

Metadata usually belongs to a transition—the edge between snapshots—so the recommended API is the standalone `pipe(value, ...operators)`, not a `.pipe()` method added to every machine. Transition decorators keep the original call signature, while annotations are attached as non-enumerable runtime metadata and represented in the TypeScript type. The generic `metadata({...})` operator can annotate any object or function, including a complete machine snapshot, without changing its identity. Later pipe operators are the outer decorators; for repeated actions or guards, their metadata therefore appears first.

Run the extractor in this repository with:

```bash
npm run extract
```

From an installed package:

```bash
npx --package @doeixd/machine extract --config .statechart.config.ts --validate
```

The CLI supports JSON, Mermaid, or both, and validates generated JSON against the bundled schema when requested. See [docs/statechart-extraction.md](docs/statechart-extraction.md).

## Immutability and safety guarantees

- Transition helpers return new snapshots by convention and by their types.
- `context` is typed as readonly at the machine-property level.
- Context objects are not recursively frozen at runtime.
- Methods can still perform side effects; purity is a design rule, not something JavaScript can enforce.
- Runtime controllers validate missing transitions, but most transition validity comes from TypeScript.

Avoid describing the library as “zero runtime” or claiming that immutability and purity are enforced. The core is small, but actors, middleware, extraction, and framework adapters intentionally add runtime behavior.

See [Mutability boundaries](docs/mutability.md) for practical guidance on immutable snapshots, nested data, and integration points that require mutation.

## Development

```bash
npm install
npm test
npm run type-check
npm run build
npm run verify:package
npm run extract
```

`npm run build` cleans old output, produces ESM/CommonJS/declaration bundles for every configured entrypoint, and verifies the package export map. `npm run verify:package` can also be run independently after a build.

See [docs/README.md](docs/README.md) for the documentation map and [docs/api.md](docs/api.md) for the supported public surface.

## License

MIT
