# Actors

An actor owns one machine snapshot behind a stable reference. Use one when events can arrive over time, async transitions must be serialized, or consumers need subscriptions. If a caller can simply retain the snapshot returned by each transition, the machine alone is enough.

```ts
import { createActor, createMachine } from '@doeixd/machine';

const counter = createMachine({ count: 0 }, next => ({
  increment() {
    return next({ count: this.context.count + 1 });
  },
  add(amount: number) {
    return next({ count: this.context.count + amount });
  },
}));

const actor = createActor(counter);
const unsubscribe = actor.subscribe(snapshot => {
  console.log(snapshot.context.count);
});

actor.send.increment();
actor.send.add(4);
console.log(actor.getSnapshot().context.count); // 5

unsubscribe();
actor.stop();
```

## Sending events

The typed proxy is convenient when the transition is known at the call site:

```ts
actor.send.add(2);
```

Use an event object at dynamic boundaries:

```ts
actor.dispatch({ type: 'add', args: [2] });
actor.ref.send({ type: 'increment', args: [] });
```

`actor.ref` exposes only event sending. `spawn(machine)` returns the smaller `ActorRef` interface with `dispatch`, `getSnapshot`, and `subscribe`.

## Mailbox and async behavior

Events are processed in arrival order. If a transition returns a promise or promise-like value, later events wait in the mailbox until it settles. Subscribers are notified only after a transition returns a valid machine snapshot.

Transition failures are reported to `console.error` and the mailbox continues. An event unavailable in the current typestate is reported with `console.warn` and ignored. A bad transition result is rejected rather than replacing the actor's snapshot.

## Lifecycle

`stop()`:

- ignores future events until `start()` is called;
- clears queued events and subscribers;
- invalidates an in-flight async result so it cannot update the snapshot later.

`start()` accepts work again but does not restore cleared subscriptions. Subscribe again when restarting an actor.

`subscribe` does not emit the current snapshot immediately; call `getSnapshot()` when an initial read is needed. Subscriber and global inspector errors are isolated so they cannot break event processing.

## Inspection

`Actor.inspect(listener)` registers one process-wide listener for dispatched events. Pass `null` to remove it.

```ts
import { Actor } from '@doeixd/machine/actor';

Actor.inspect(event => {
  console.log(event.event, event.snapshot);
});

Actor.inspect(null);
```

Inspection events describe dispatch, not successful completion. Observe snapshots with `subscribe` when completion matters.

## Promise and observable sources

`fromPromise(() => promise)` starts immediately and returns an actor whose context moves from `pending` to `resolved` or `rejected`. A synchronous exception thrown while creating the promise is captured as a `rejected` snapshot rather than escaping from `fromPromise`.

```ts
import { fromPromise } from '@doeixd/machine';

const user = fromPromise(() => fetchUser(42));

user.subscribe(snapshot => {
  if (snapshot.context.status === 'resolved') {
    console.log(snapshot.context.data);
  }
});
```

`fromObservable(source)` subscribes immediately. Values produce `{ status: 'active', value }`; completion produces `done`, and errors produce `error`. A synchronous exception from `subscribe` also produces an `error` snapshot. Stopping the actor unsubscribes the source exactly once, including when it is stopped before the source completes.

These helpers adapt source lifecycles to actor snapshots. They do not add cancellation to the original promise; use an abort-aware transition or source when underlying work must be canceled.

## Persisted actors

`createPersistedActor` owns one machine snapshot behind a durable commit protocol. Where `Actor` publishes a snapshot as soon as a transition produces it, `PersistedActor` publishes only after the snapshot's durable representation has been written:

```text
receive event → run transition → encode → save → publish → notify → next event
```

The invariant: **every externally visible actor state is durable.** Subscribers therefore observe only committed states, and a failed write never produces a state that would silently disappear after a crash.

A machine snapshot holds functions and closures, so it is never serialized directly. The persistence contract separates storage from a codec that reconstructs executable snapshots:

```ts
import { createPersistedActor } from '@doeixd/machine';

const actor = await createPersistedActor(createIdle(), {
  load: () => db.get('machine'),          // undefined when storage is empty
  save: (value) => db.set('machine', value),

  encode: (machine) => machine.context,   // snapshot → durable representation
  decode: (context) => createFromContext(context), // representation → snapshot
});
```

Creation is asynchronous because restoration happens first. When `load()` returns a stored representation, `decode` rebuilds the snapshot from it and the initial machine is ignored. When storage is empty, the initial snapshot is encoded and saved before the actor becomes visible, so the seed state is durable too. The returned promise rejects when `load` or `decode` fails, or when `decode` does not return a machine.

For discriminated typestates, `persistentMachine` builds the codec from a rehydration table — a discriminant selecting a state factory, the same pattern as `createEnsemble`:

```ts
import { persistentMachine } from '@doeixd/machine';

const Auth = persistentMachine({
  initial: () => createLoggedOut(),
  states: {
    loggedOut: (ctx: AuthContext) => createLoggedOut(ctx),
    loggedIn: (ctx: AuthContext) => createLoggedIn(ctx),
  },
  discriminant: (ctx: AuthContext) => ctx.status,
});

const actor = await createPersistedActor(Auth, {
  load: () => db.get('auth'),
  save: (value) => db.set('auth', value),
});
```

The definition encodes a snapshot as its context and decodes by selecting the factory for `discriminant(context)`. An unknown discriminant value throws a descriptive error. Combine the definition with any `PersistenceStorage`; a keyed store adapts with `load: () => db.get(key)` and `save: (v) => db.set(key, v)`.

Failure and lifecycle semantics extend the base actor's:

- If a write fails or `encode` throws, the snapshot is not published. The actor stays at the last committed state, reports with `console.error`, and processes the next queued event against that state.
- Writes are serialized with the mailbox: at most one save is in flight, in event order.
- `stop()` invalidates an in-flight write, so its snapshot is never published afterward.
- `subscribe` fires only after the durable write, so a subscription notification means the state is committed.

`PersistedActor` deliberately owns exactly one snapshot. Versioning or migrations layer onto the contract — wrap `load`/`decode` to upgrade old representations — without changing the actor model. Persistence of spawned actor trees is out of scope.

## Actor versus runner

Use `createActor` for ordered mailboxes and subscriptions. Use `runMachine` for abort-latest async dispatch, where every new event cancels the previous transition through `AbortSignal`. Use `createRunner` for a small synchronous mutable controller and stable action functions.
