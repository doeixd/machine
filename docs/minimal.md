# Minimal API

`@doeixd/machine/minimal` is the small, flat-snapshot entry point. State data and transitions live on the same object, and every transition returns another snapshot.

Use it when typestate is the main requirement and you do not need the main package’s actors, async cancellation, middleware, or framework integrations.

```ts
import { machine } from '@doeixd/machine/minimal';

const counter = machine({ count: 0 }, (state, next) => ({
  increment: () => next({ count: state.count + 1 }),
}));

const updated = counter.increment();
console.log(counter.count); // 0
console.log(updated.count); // 1
```

## Choosing a constructor

| Constructor | Use it for | Type behavior |
| --- | --- | --- |
| `machine(context, blueprint)` | A small one-off snapshot | Infers state and transition names, but the recursive `next` result is intentionally loose |
| `factory<C>()(blueprint)` | A reusable machine with one state shape | Preserves transition parameters and same-state chaining |
| `union<C>()(branches)` | A finite set of tagged typestates | Preserves the exact target branch returned through `next` |

For application code, prefer `factory` or `union`. `machine` is the runtime primitive beneath both and is useful when recursive chaining is not important or when the blueprint is explicitly typed.

## Reusable single-state machines

`factory` separates the transition blueprint from its initial data. Its transitions always return the same machine shape.

```ts
import { factory } from '@doeixd/machine/minimal';

const createCounter = factory<{ count: number }>()((state, next) => ({
  increment: () => next({ count: state.count + 1 }),
  add: (amount: number) => next({ count: state.count + amount }),
  reset: () => next({ count: 0 }),
}));

const counter = createCounter({ count: 0 });
const updated = counter.increment().add(4);

console.log(updated.count); // 5
// counter.add(); // type error: amount is required
```

Snapshots are shallow objects. Returning a new context leaves the previous top-level snapshot unchanged, but nested values are not cloned or frozen automatically.

## Tagged typestates

Use `States` to define the state data, `tag` to construct variants, and `union` to define the transitions available from each variant.

```ts
import {
  tag,
  union,
  type States,
  type UnionOf,
} from '@doeixd/machine/minimal';

type FetchState = States<{
  idle: {};
  loading: { url: string };
  success: { data: string };
}>;

const createFetch = union<FetchState>()({
  idle: (_state, next) => ({
    load: (url: string) => next(tag('loading', { url })),
  }),
  loading: (_state, next) => ({
    resolve: (data: string) => next(tag('success', { data })),
    cancel: () => next(tag('idle')),
  }),
  success: (_state, next) => ({
    reset: () => next(tag('idle')),
  }),
});

type FetchMachine = UnionOf<typeof createFetch>;

const idle: FetchMachine = createFetch(tag('idle'));
const loading = idle.load('/api/data');
const success = loading.resolve('done');

console.log(success.data); // done
// loading.load('/again'); // type error: loading has no load transition
```

The branch object must contain every tag in `FetchState`. A transition’s return type is selected from the tag passed to `next`, which is what makes unavailable transitions disappear after a state change.

## Exhaustive matching

`match` consumes a tagged union. Every tag requires a handler, and each handler receives its narrowed state.

```ts
import { match } from '@doeixd/machine/minimal';

const message = match(success, {
  idle: () => 'Ready',
  loading: state => `Fetching ${state.url}`,
  success: state => `Received ${state.data}`,
});
```

Keep a value typed as the complete machine union when you want the compiler to require every case. A value already narrowed to one branch naturally requires only that branch.

## Entry lifecycles

`runnable` attaches optional `onEnter` hooks to a tagged machine, and `run` owns the current snapshot. An entry hook may return a cleanup function; cleanup runs before the next entry and again on `stop()`.

```ts
import { run, runnable, tag } from '@doeixd/machine/minimal';

const runner = run(runnable(createFetch(tag('idle')), {
  loading: {
    onEnter: () => {
      console.log('request started');
      return () => console.log('leaving loading');
    },
  },
}));

const unsubscribe = runner.subscribe(snapshot => {
  console.log(snapshot.tag);
});

runner.send('load', '/api/data');
console.log(runner.get().tag); // loading

unsubscribe();
runner.stop();
```

This runner is deliberately synchronous and small. When the initial value is typed as the complete machine union, `send` accepts every transition name in that union with its corresponding arguments. At runtime it looks up the transition on the current snapshot; a transition that exists elsewhere in the union but is unavailable in the current state is ignored. Use the main entry’s `createActor` or `runMachine` when you need queued async work, cancellation, or strict unknown-event errors.

## Child composition

`withChildren(parent, children)` namespaces child snapshots under a parent. Calling a child transition returns a new parent snapshot containing the updated child.

```ts
import { withChildren } from '@doeixd/machine/minimal';

const dashboard = withChildren(
  { title: 'Overview' },
  { counter: createCounter({ count: 0 }) },
);

const updatedDashboard = dashboard.counter.increment();

console.log(dashboard.counter.count); // 0
console.log(updatedDashboard.counter.count); // 1
```

Composition is shallow. It does not schedule child effects or propagate events automatically.

## Lower-level typing helpers

`Blueprint<C, T>` explicitly types a raw `machine` blueprint when inference needs a named recursive boundary:

```ts
import { machine, type Blueprint } from '@doeixd/machine/minimal';

interface CountState { count: number }
interface CountTransitions {
  increment(): CountState & CountTransitions;
}

const blueprint: Blueprint<CountState, CountTransitions> = (state, next) => ({
  increment: () => next({ count: state.count + 1 }),
});

const explicitCounter = machine({ count: 0 }, blueprint);
```

`NextOf<M>` is available when an inline callback needs an explicitly named next-snapshot type. `Machine<C, T>`, `FactoryMachine<C, T>`, `UnionMachine<C, F>`, `UnionOf<F>`, `MatchCases<T, R>`, and `SendFor<M>` expose the corresponding inferred shapes.

## Tagged utilities

The minimal entry re-exports the tagged helpers from `@doeixd/machine/types`:

- `tag(name, props?)` and `tag.factory<Union>()` create tagged values;
- `isState(value, tag)` narrows a tagged union;
- `States<Shape>` converts a tag-to-payload map into a union;
- `Context<M>`, `Transitions<M>`, `InferMachine<F>`, and `MachineOf<F>` inspect types;
- `freeze(value)` recursively freezes objects and arrays, handles cyclic object graphs, and returns a deeply readonly type.

The main and minimal APIs use different snapshot shapes. Minimal state is read as `machine.count`; main-API state is read as `machine.context.count`.
