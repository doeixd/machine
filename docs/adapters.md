# Event adapters

`@doeixd/machine/adapters` presents a synchronous machine through browser `EventTarget`, Node.js `EventEmitter`, or a small Observable-compatible interface. Each adapter owns a `createRunner`, so its reference stays stable while `state` and `context` expose the latest immutable snapshot.

These adapters are for integration boundaries. Inside typed application code, calling transitions directly or using `createActor` is usually simpler.

## EventTarget

```ts
import { createMachine } from '@doeixd/machine';
import { asEventTarget, listen } from '@doeixd/machine/adapters';

const counter = createMachine({ count: 0 }, next => ({
  add(amount: number) {
    return next({ count: this.context.count + amount });
  },
}));

const target = asEventTarget(counter);

const unlisten = listen(target, 'statechange', event => {
  console.log(event.detail.state.context.count);
});

target.dispatch('add', [3]);
console.log(target.context.count); // 3
unlisten();
```

`dispatch(name, detail?)` and a directly dispatched `CustomEvent` use the same routing path. Transition arguments are carried as an array in `detail`; argumentless transitions omit it. Successful transitions emit `statechange` with `{ state }`.

Invalid events and thrown transitions emit an `error` custom event with `{ error }`. Register an error listener when the boundary can receive untrusted event names:

```ts
target.addMachineEventListener('error', event => {
  console.error(event.detail.error);
});
```

The implementation includes a `CustomEvent` fallback for runtimes that provide `EventTarget` and `Event` but not the `CustomEvent` constructor.

## EventEmitter

```ts
import { asEventEmitter } from '@doeixd/machine/adapters';

const emitter = asEventEmitter(counter);

emitter.on('statechange', snapshot => {
  console.log(snapshot.context.count);
});
emitter.on('error', error => {
  console.error(error);
});

emitter.dispatch('add', 3);
```

`dispatch` preserves each transition's parameter tuple. Invalid events and thrown transitions emit `error`; because this follows Node's `EventEmitter` convention, attach an `error` listener when failures should not throw at the integration boundary.

## Observable

```ts
import { asObservable } from '@doeixd/machine/adapters';

const observable = asObservable(counter);
const subscription = observable.subscribe({
  next: snapshot => console.log(snapshot.context.count),
  error: error => console.error(error),
  complete: () => console.log('complete'),
});

observable.dispatch('add', 3);
subscription.unsubscribe();
```

Subscription emits the current snapshot immediately, then emits after every successful transition. The observer is registered before that initial emission, so a transition dispatched from its first `next` callback is observed normally. Dispatch failures call each observer's optional `error` handler but do not complete the stream.

Observers are notified independently. An exception from one `next` callback is sent to that observer's `error` callback (or logged when it has none) without preventing the remaining observers from receiving the snapshot. Completion callbacks are isolated in the same way.

`complete()` is terminal and idempotent: it notifies current observers, clears them, and ignores later dispatches. A subscriber added after completion receives `complete` immediately and no snapshot.

The exposed `Observable<T>` and `Observer<T>` types intentionally describe only this small interface. They are structurally compatible with common observable consumers but do not implement the full RxJS operator API.

## Choosing an adapter

| Boundary | Adapter | Input | Change notification |
| --- | --- | --- | --- |
| DOM/browser events | `asEventTarget` | `dispatch(name, args)` or `CustomEvent` | `statechange` custom event |
| Node event systems | `asEventEmitter` | `dispatch(name, ...args)` | `statechange` emitter event |
| Reactive streams | `asObservable` | `dispatch(name, ...args)` | observer `next` |

All three adapters are synchronous. For promise-returning transitions and ordered async input, use [Actors](actor.md); for abort-latest execution, use `runMachine`.
