# Ensembles and multi-machine coordination

`createEnsemble` is the coordination boundary for multiple machine domains. Each ensemble defines one domain's possible machines; multiple ensembles coordinate by reading and writing the same external context.

This is different from merely putting one machine in a store. The shared context is the communication channel: when the authentication ensemble updates `auth`, the cart ensemble's next state and action call see that update without either domain holding a reference to the other.

## The model

| Part | Responsibility |
| --- | --- |
| `StateStore<C>` | Owns the current shared context and persists replacements. |
| `factories` | Maps a domain's state names to machine factories. |
| `getDiscriminant` | Selects that domain's active factory from the latest context. |
| `ensemble.state` | Reconstructs the active machine on demand. |
| `ensemble.actions` | Provides a stable proxy that resolves and validates the action against the current machine. |

One ensemble can be useful at a framework boundary, but coordination emerges when ensembles share a store:

```text
                          shared StateStore<AppContext>
                         /                             \
        auth discriminant /                           \ cart discriminant
                       /                               \
          auth factories                               cart factories
       signedOut | signedIn                         empty | hasItems
```

The domains are independently modeled. Their only coupling is the shared context contract.

## Coordinating authentication and a cart

```typescript
import { createEnsemble, createMachine, type StateStore } from '@doeixd/machine';

type AppContext = {
  auth: 'signedOut' | 'signedIn';
  cart: 'empty' | 'hasItems';
  items: string[];
};

let context: AppContext = {
  auth: 'signedOut',
  cart: 'empty',
  items: [],
};

const store: StateStore<AppContext> = {
  getContext: () => context,
  setContext: (next) => { context = next; },
};

const auth = createEnsemble(store, {
  signedOut: (ctx) => createMachine(ctx, {
    login: () => store.setContext({ ...ctx, auth: 'signedIn' }),
  }),
  signedIn: (ctx) => createMachine(ctx, {
    logout: () => store.setContext({ ...ctx, auth: 'signedOut' }),
  }),
}, (ctx) => ctx.auth);

const cart = createEnsemble(store, {
  empty: (ctx) => createMachine(ctx, {
    add: (item: string) => store.setContext({
      ...ctx,
      cart: 'hasItems',
      items: [item],
    }),
  }),
  hasItems: (ctx) => createMachine(ctx, {
    add: (item: string) => store.setContext({
      ...ctx,
      items: [...ctx.items, item],
    }),
    checkout: () => {
      if (ctx.auth !== 'signedIn') throw new Error('Sign in before checkout');
      store.setContext({ ...ctx, cart: 'empty', items: [] });
    },
  }),
}, (ctx) => ctx.cart);

cart.actions.add('book');
auth.actions.login();
cart.actions.checkout();
```

`auth.actions.login()` replaces the shared context. When `cart.actions.checkout()` runs, its proxy asks the store for the latest context, reconstructs the `hasItems` cart machine, and therefore observes `auth: 'signedIn'`.

Transitions must call `store.setContext` themselves. Returning a context from an ensemble action does not update the ensemble because the external store—not the ensemble—owns state.

## Freshness and action availability

The `context` and `state` properties are getters. They read the store each time rather than caching a snapshot. The `actions` object is stable, but each invocation resolves the active machine again.

That stable proxy contains the union of action names represented by the factories. An action that is not valid on the current machine throws at runtime. Prefer narrowing `ensemble.state` when callers need compile-time knowledge of the current typestate; use `actions` at imperative or framework boundaries where a stable reference matters.

## What an ensemble does not do

An ensemble does not:

- run machines concurrently;
- broadcast events between machines;
- provide a mailbox or serialize asynchronous work;
- merge concurrent writes or make them transactional;
- subscribe to store changes by itself.

Use an [actor](actor.md) when you need ownership, a mailbox, or serialized async transitions. The `StateStore` implementation is responsible for persistence, subscriptions, and any transactional behavior. Ensembles coordinate only through the context that store exposes.

## Choosing the boundary

| Need | API |
| --- | --- |
| A pure immutable snapshot | `createMachine` |
| One locally owned changing snapshot | `createRunner` |
| Serialized messages and async ownership | `createActor` |
| Multiple independently defined domains over shared state | `createEnsemble` |
| A reusable store/discriminant environment | `createEnsembleFactory` |
| Read-only live external-store fields plus class methods | `createStoreMachine` |

`useEnsemble` adapts one ensemble to React-owned state. For several application-wide ensembles, create them over the same external store and expose them through your framework's dependency or context mechanism.

[`createStoreMachine`](multi-machine.md) does not coordinate multiple machine domains. It creates one class instance and presents its methods alongside read-only fields from one external store. Its old `createMultiMachine` name is retained only for compatibility.
