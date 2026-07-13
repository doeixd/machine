# Higher-order machines

`@doeixd/machine/higher-order` contains reusable patterns built from ordinary machine snapshots. It does not introduce a second runtime model: each transition still returns the next immutable snapshot.

## Fetch lifecycle

`createFetchMachine` represents each phase as a different type. Starting a request returns a loading snapshot immediately; `done()` resolves to the snapshot produced by that attempt.

```ts
import {
  createFetchMachine,
  type FetchMachine,
} from '@doeixd/machine/higher-order';

type User = { id: number; name: string };

const initial: FetchMachine<User, Error, number> = createFetchMachine({
  fetcher: async (id, { signal }) => {
    const response = await fetch(`/api/users/${id}`, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<User>;
  },
  maxRetries: 2,
});

const loading = initial.fetch(42);
const result = await loading.done();

if ('retry' in result) {
  const nextAttempt = result.retry();
  console.log((await nextAttempt.done()).context.status);
} else if (result.context.status === 'success') {
  console.log(result.context.data.name);
} else if (result.context.status === 'error') {
  console.error(result.context.error);
}
```

The lifecycle is:

```text
idle --fetch--> loading --done--> success
                         |-------> retrying --retry--> loading
                         |-------> error
                         `-------> canceled
success/error/canceled --refetch/retry--> loading
```

Important behavior:

- `fetcher(params, { signal })` is called once per loading snapshot.
- `maxRetries` defaults to `3` and counts retries after the first attempt. Retrying is explicit; the machine does not start another request on its own.
- `cancel()` aborts the supplied signal and returns a canceled snapshot. The loading snapshot's pending `done()` also resolves as canceled once the fetcher settles.
- `mapError` converts unknown thrown values to the declared error type.
- `onSuccess` runs on success; `onError` runs only after the retry budget is exhausted.
- a missing fetcher or a negative/non-integer retry count throws during construction.

## Parallel composition

`createParallelMachine(left, right)` combines contexts and exposes transitions from both inputs. A transition updates only its owning side and recursively returns another combined snapshot.

```ts
import { createMachine } from '@doeixd/machine';
import { createParallelMachine } from '@doeixd/machine/higher-order';

const counter = createMachine({ count: 0 }, next => ({
  increment() {
    return next({ count: this.context.count + 1 });
  },
}));

const panel = createMachine({ open: false }, next => ({
  toggle() {
    return next({ open: !this.context.open });
  },
}));

const dashboard = createParallelMachine(counter, panel);
const updated = dashboard.increment().toggle();

console.log(updated.context); // { count: 1, open: true }
```

Context keys and transition names must be unique across the two inputs. A duplicate throws at composition time instead of silently hiding one side. Prototype methods and own function properties are both discovered.

This helper models two independent regions. It does not schedule effects or implement SCXML parallel-state semantics.

## Child delegation

`delegateToChild(name)` creates a class transition for a parent whose context contains `child`. It invokes an available child transition with the child as `this`, then replaces `context.child` in a new parent snapshot. If the current child typestate does not expose that transition, the parent is returned unchanged.

Use the more configurable `@doeixd/machine/delegate` entry when the child lives under another key, several children need delegation, or transitions must be picked, omitted, prefixed, or renamed.

## Boolean toggles

`toggle(key)` is intended for class fields and only accepts boolean context keys:

```ts
import { MachineBase } from '@doeixd/machine/base';
import { toggle } from '@doeixd/machine/higher-order';

class Settings extends MachineBase<{ darkMode: boolean }> {
  toggleDarkMode = toggle<Settings, 'darkMode'>('darkMode');
}
```

It returns a new snapshot through `setContext`. A non-boolean runtime value throws, protecting JavaScript callers and values that crossed an untyped boundary.
