# Supported API

This page summarizes the supported public entry points. The generated declarations in `dist/types` are the exhaustive signature reference.

For the complete list of directly importable subpaths, see the [Published modules](../README.md#published-modules) table. Focused subpaths expose the same implementations as the larger entries while allowing consumers to declare a narrower dependency boundary.

## Main entry: `@doeixd/machine`

### Core types

- `Machine<C, T>` — synchronous machine shape: `{ readonly context: C } & T`.
- `AsyncMachine<C, T>` — the same shape for transitions that may return promises.
- `TypeState<C, T>` and `AsyncTypeState<C, T>` — aliases for expressing explicit typestates.
- `BaseMachine<C>` — the common `{ readonly context: C }` constraint.
- `Context<M>`, `Transitions<M>`, `TransitionArgs<M, K>`, `TransitionReturn<M, K>`, and `TransitionNames<M>` — distributive machine introspection helpers that preserve typestate unions.
- `Event<M>` — event union derived from transition names and parameters.
- `AsyncEvent<M>` — event union used by `runMachine`; omits runner-supplied `TransitionOptions` from caller arguments.

`readonly context` prevents replacing the property through a typed machine reference. It does not deep-freeze the context object.

### Creation

```ts
createMachine(context, factory)
createMachine(context, transitions)
createMachine(context, existingMachine)

createAsyncMachine(context, factory)
createAsyncMachine(context, transitions)
createAsyncMachine(context, existingMachine)
```

The factory overload receives `next(newContext)`, which constructs another machine using the same transition set. Transition methods run with the current machine as `this`.

Other construction helpers:

- `createContext(context)` — create a context-only object for matching and tests.
- `createMachineFactory<C>()(transformers)` — create a reusable machine factory from pure context transformers.
- `createMachineBuilder(template)` — construct instances from an OOP template.
- `MachineBase<C>` — optional base class containing a readonly `context` property.
- `createFunctionalMachine(context)(transformers)` — build a machine from pure context transformers.
- `state(...)` — deprecated dual-arity compatibility wrapper. Use `createMachine` or `createFunctionalMachine` explicitly.

### Immutable updates and composition

- `setContext(machine, contextOrUpdater)` — return the same machine type with updated context, preserving its prototype, property descriptors, and instance fields.
- `overrideTransitions(machine, overrides)` — replace or add transitions.
- `extendTransitions(machine, additions)` — add transitions while rejecting duplicate keys at compile time.
- `combineFactories(first, second)` — merge independent machine factories.
- `next(machine, updater)` — updater-only shorthand for `setContext`.

Transition functions passed to `overrideTransitions` and `extendTransitions` receive the full combined machine as `this`, matching `createMachine`; they can read `this.context` and call existing transitions.

### Async runner

```ts
const runner = runMachine(initial, onChange?);

runner.state;           // current context
await runner.dispatch(event); // entire next machine
runner.stop();          // abort current transition
```

`runMachine` appends `{ signal: AbortSignal }` to transition arguments. A new dispatch aborts the previous in-flight dispatch. Unknown events throw.

### Actor

```ts
const actor = createActor(machine);

actor.send.someTransition(...args);
actor.ref.send({ type: 'someTransition', args });
actor.getSnapshot();
actor.subscribe(listener);
actor.stop();
```

Actors serialize sync, promise, and promise-like transition results through a mailbox and notify subscribers after successful transitions. `stop()` clears queued work and subscribers and prevents an in-flight async result from changing the snapshot; `start()` accepts new work again. `spawn` is an alias returning the smaller `ActorRef` interface. `fromPromise` and `fromObservable` adapt common async sources, and an observable subscription is disposed when its actor stops.

### Runners and ensembles

- `createRunner(machine, onChange?)` — mutable controller with a stable `actions` proxy.
- `createEnsemble(store, factories, getDiscriminant)` — coordinate a domain's state-specific machine factories through an external store. Multiple ensembles can share that store so separate domains react to the same current context.
- `createEnsembleFactory(store, getDiscriminant)` — capture a shared store and state selector for creating consistently configured ensembles.
- `createMutableMachine(...)` — mutable façade for integration points that require mutation.
- `StoreMachineBase` and `createStoreMachine` — expose read-only live fields from an external store together with methods from one class instance.
- `MultiMachineBase` and `createMultiMachine` — deprecated compatibility names. The legacy proxy permits direct context-field assignment; it does not create or select among multiple machines.

An ensemble reconstructs its current machine on demand and exposes a stable action proxy. Transitions must persist their next context through `store.setContext`; the shared store is the coordination channel, not an event bus or scheduler. See [Ensembles and multi-machine coordination](ensembles.md).

`createStoreMachine` is a different abstraction: a proxy-backed, class-oriented façade over one external store. See [Store machines and the legacy `MultiMachine` API](multi-machine.md).

### Pattern matching

- `hasState(machine, key, value)` — narrow a discriminated context.
- `createMatcher(...)` — reusable guards and matching.
- `classCase`, `discriminantCase`, `customCase`, and `forContext` — case builders.
- `tag`, `isState`, and `States<M>` — tagged-object helpers.

### Middleware

The main and core entries export the modular middleware implementation from `src/middleware/`:

- `createMiddleware` and `createCustomMiddleware`;
- `withLogging`, `withAnalytics`, `withValidation`, `withPermissions`, `withRetry`, and monitoring helpers;
- `withHistory`, `withSnapshot`, and `withTimeTravel`;
- `compose`, `composeTyped`, `chain`, `when`, `createPipeline`, and `middlewareBuilder`.

Middleware wraps transition functions and returns another machine. It is not part of the minimal entry.

### Metadata and extraction helpers

- `transitionTo`, `describe`, `guarded`, `invoke`, `action`, and `metadata` support both direct and curried annotation forms.
- `pipe(value, ...operators)` applies curried decorators left to right without adding methods to machine snapshots.
- `metadata({...})` accepts any object or function, including a complete snapshot; it preserves identity and attaches non-enumerable runtime metadata.
- `Annotated<T, M>`, `WithMeta<F, M>`, and `MetadataOf<T>` expose the corresponding metadata brands for library authors.
- `guard`, `guardSync`, and `guardAsync` enforce conditions at runtime; `whenGuard` and `whenGuardAsync` provide their fluent forms.
- The helpers attach non-enumerable runtime metadata and also provide static syntax for the extractor.
- They are not runtime no-ops: metadata attachment has a small runtime cost.

```ts
const login = pipe(
  (username: string) => new LoggedIn(username),
  transitionTo(LoggedIn),
  describe('Log in'),
  action({ name: 'auditLogin' }),
);
```

The transition keeps its original parameter and return types. Direct nested calls remain supported for compatibility.

Use `@doeixd/machine/extract` for `extractMachine`, `extractMachines`, and extraction configuration types.

## Higher-order entry: `@doeixd/machine/higher-order`

- `delegateToChild(name)` — create a parent transition that forwards to a machine stored at `context.child`.
- `toggle(key)` — create a transition for a boolean context key; non-boolean runtime values throw.
- `createFetchMachine(config)` — model fetch, retry, cancellation, success, and error as explicit typestates.
- `createParallelMachine(left, right)` — combine two independent snapshots; duplicate context or transition keys throw.
- `RemapTransitions<M, T>` — retain transition parameters while replacing their return type.

See [Higher-order machines](higher-order.md) for lifecycle examples and collision rules.

## Minimal entry: `@doeixd/machine/minimal`

- `machine(context, blueprint)` — create one flat machine.
- `factory<C>()(blueprint)` — create a reusable single-state factory.
- `union<C>()(branches)` — create a tagged typestate factory.
- `match(value, handlers)` — exhaustively consume tagged states.
- `runnable(machine, lifecycle)` and `run(machine)` — event-driven lifecycle support.
- `withChildren(parent, children)` — namespace child machines.
- `tag`, `tag.factory`, `States`, `UnionOf`, and related tagged helpers.

Minimal state data is flat: read `machine.count`, not `machine.context.count`.

## Delegate entry: `@doeixd/machine/delegate`

- `delegate(context, key, next, options?)` — expose a child’s transitions on its parent.
- `createDelegate(context, next)` — bind repeated delegation setup.
- `delegateAll(context, keys, next, prefix?)` — delegate several children.
- `renameMap<M>()` — type-safe rename map construction.

Options can pick, omit, or rename delegated transitions.

## React entry: `@doeixd/machine/react`

This entry re-exports the core API and adds:

- `useMachine` and `useMachineSelector`;
- `useEnsemble`;
- `createMachineContext`;
- `useActor` and `useActorSelector`.

React is an optional peer dependency.

`useMachine` is synchronous: each action runs against the current snapshot through `createRunner` and schedules the resulting snapshot in React state. Use `useActor` for ordered promise-returning transitions. Actor hooks use `useSyncExternalStore` with server snapshots, and selector hooks retain the previous selection when a custom equality function considers the next value equivalent.

## Solid entry: `@doeixd/machine/solid`

This entry exports Solid-specific helpers only:

- `createMachine` — signal-backed machine accessor and stable actions.
- `createMachineStore` — store-backed machine and actions.
- `createAsyncMachine` — signal-backed wrapper around the core async runner.
- `createMachineContext` — context-only store and actions.
- `createMachineSelector` — memoized context selection.
- `batchTransitions` — batch a sequence into one reactive update.
- `createMachineEffect` and `createMachineValueEffect` — explicit side-effect helpers.

Import non-reactive machine factories from `@doeixd/machine`. Solid is an optional peer dependency.

Store-backed actions are resolved against the latest immutable machine, not against transition properties retained by Solid's stable store proxy. Updates made through the returned store setters are synchronized back into that machine before the next action. Async runners are stopped when their Solid owner is disposed, and lifecycle callback bodies are untracked so incidental signal reads do not become extra effect dependencies.

## Stability notes

The small creation APIs and their tests are the most established surface. Actors, middleware, extraction, framework adapters, mixins, generators, and multi-machine orchestration are larger optional layers. Prefer adopting those deliberately rather than importing the main entry and treating every export as required architecture.
