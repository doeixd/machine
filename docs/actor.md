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

`fromPromise(() => promise)` starts immediately and returns an actor whose context moves from `pending` to `resolved` or `rejected`.

```ts
import { fromPromise } from '@doeixd/machine';

const user = fromPromise(() => fetchUser(42));

user.subscribe(snapshot => {
  if (snapshot.context.status === 'resolved') {
    console.log(snapshot.context.data);
  }
});
```

`fromObservable(source)` subscribes immediately. Values produce `{ status: 'active', value }`; completion produces `done`, and errors produce `error`. Stopping the actor unsubscribes the source, including when it is stopped before the source completes.

These helpers adapt source lifecycles to actor snapshots. They do not add cancellation to the original promise; use an abort-aware transition or source when underlying work must be canceled.

## Actor versus runner

Use `createActor` for ordered mailboxes and subscriptions. Use `runMachine` for abort-latest async dispatch, where every new event cancels the previous transition through `AbortSignal`. Use `createRunner` for a small synchronous mutable controller and stable action functions.
