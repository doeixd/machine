# Published module guide

The root package exports the broad main API. Focused subpaths expose the same implementations behind clearer dependency boundaries and, where possible, smaller direct bundles.

Every subpath below is part of the package export map and is verified during `npm run build` in CommonJS, ESM, and declaration form.

## Machine construction

### `@doeixd/machine`

The complete main API: `{ context, ...transitions }` machine factories plus actors, runners, middleware, matching, metadata, and composition. Framework integrations remain explicit subpaths. Use the root when convenience matters more than a narrow import boundary.

### `@doeixd/machine/core`

The main API without React or Solid integration code. This is the broad non-framework entry point.

### `@doeixd/machine/minimal`

Flat snapshots, tagged typestate unions, exhaustive matching, a synchronous lifecycle runner, and shallow child composition. See [Minimal API](minimal.md).

### `@doeixd/machine/base`

Exports `MachineBase`, a class containing only a readonly `context` property. Use it for class-per-state typestate models without importing the wider runtime.

### `@doeixd/machine/functional-combinators`

Exports `createTransitionFactory`, `createTransitionExtender`, `createFunctionalMachine`, and `state` for building main-style machines from context transformations. `state` supports direct `state(context, transitions)` and curried `state(context)(transformers)` construction. See [Combinators](combinators.md).

## Runtime ownership and integration

### `@doeixd/machine/actor`

Exports `Actor`, `createActor`, `spawn`, `fromPromise`, and `fromObservable`. Actors own a current snapshot, serialize messages through a mailbox, and notify subscribers. See [Actors](actor.md).

### `@doeixd/machine/multi`

Exports `createRunner`, `createEnsemble`, `createEnsembleFactory`, `runWithRunner`, `runWithEnsemble`, `createStoreMachine`, `StoreMachineBase`, and compatibility helpers including `createMultiMachine`. A runner owns one changing snapshot locally. Ensembles coordinate state-specific machine factories—and multiple machine domains—through a shared external `StateStore`. The generator helpers are synchronous drivers. A store machine instead presents read-only live fields from one external store beside methods from one class instance. See [Ensembles](ensembles.md) and [Store machines](multi-machine.md).

### `@doeixd/machine/adapters`

Exports EventTarget, Node EventEmitter, and Observable adapters: `asEventTarget`, `asEventEmitter`, `asObservable`, and their controller classes. See [Adapters](adapters.md).

### `@doeixd/machine/devtools`

Exports `connectToDevTools` for sending machine events and snapshots to a compatible browser DevTools connection. This is browser-oriented and intentionally optional.

## Composition

### `@doeixd/machine/delegate`

Exports `delegate`, `createDelegate`, `delegateAll`, and `renameMap` for exposing selected child transitions through a parent snapshot. See [Delegation](delegate.md).

### `@doeixd/machine/context-bound`

Exports `createContextBoundMachine`, `callWithContext`, and `isContextBound`. Use it for transition functions that bind `this` to context rather than the full machine; this changes which composition patterns are available.

### `@doeixd/machine/middleware`

Exports transition middleware, logging, analytics, validation, permissions, retry, history, snapshots, time travel, conditional composition, pipelines, and the middleware builder. See [Middleware](middleware.md).

### `@doeixd/machine/mixins`

Exports class and instance union/exclusion helpers: `MachineUnion`, `MachineExclude`, `machineUnion`, and `machineExclude`. See [Mixins](mixins.md).

### `@doeixd/machine/higher-order`

Exports `delegateToChild`, `toggle`, `createFetchMachine`, `createParallelMachine`, and their public configuration and result types. Fetch attempts are explicit typestates: call `fetch`, await `loading.done()`, and call `retry` when the result is retryable. Parallel composition rejects duplicate context and transition keys instead of choosing one silently. See [Higher-order machines](higher-order.md).

### `@doeixd/machine/generators`

Exports `run`, `step`, `yieldMachine`, `runSequence`, `createFlow`, debug execution, and async variants for writing transition sequences as generators. This module’s `run` is unrelated to the minimal lifecycle runner.

## Matching, metadata, and inspection

### `@doeixd/machine/matcher`

Exports `createMatcher`, `classCase`, `discriminantCase`, `customCase`, and `forContext` for reusable typed pattern matching over main-style machines.

### `@doeixd/machine/primitives`

Exports runtime guards and metadata decorators. `pipe` composes curried `transitionTo`, `describe`, `guarded`, `invoke`, `action`, and `metadata` operators without changing a transition’s call signature. See [Statechart extraction](statechart-extraction.md) and [Conditional transitions](conditional-transitions.md).

### `@doeixd/machine/runtime-extract`

Exports `extractFunctionMetadata`, `extractStateNode`, `generateStatechart`, and `extractFromInstance`. It inspects already-created instances and therefore observes runtime-computed annotation values.

### `@doeixd/machine/extract`

Exports the `ts-morph`-based static extractor and its configuration types. It reads supported annotation syntax without executing application code. See [Statechart extraction](statechart-extraction.md).

### `@doeixd/machine/types`

Exports shared tagged-state helpers including `tag`, `isState`, `States`, `Tagged`, `TagOf`, `freeze`, and type-introspection utilities. `freeze` recursively freezes objects and arrays and safely handles cycles.

### `@doeixd/machine/utils`

Exports events, context merging, transition construction, explicit calling/binding, `BoundMachine`, logging, and fixed-length transition sequences. Prefer a narrower specialized module when one already owns the behavior you need.

## Frameworks

### `@doeixd/machine/react`

Re-exports the core API and adds React hooks: `useMachine`, selectors, ensembles, machine context, and actor hooks. React is an optional peer dependency.

### `@doeixd/machine/solid`

Exports Solid-specific signal/store helpers only. Import non-reactive factories from the root or core entry. Solid is an optional peer dependency.

## Import guidance

Do not import unpublished source filenames such as `entry-react`, `entry-solid`, or `internal-transitions`. They are implementation details and may change without a package-level compatibility promise.

If two modules export a function with the same name—most notably `run` or `createMachine`—alias the import or choose the most specific subpath so its semantics remain obvious at the call site.
