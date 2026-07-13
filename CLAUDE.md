# Repository guidance

`@doeixd/machine` is a TypeScript state-machine library. Its primary invariant is simple: a transition returns the next machine snapshot.

## Commands

```bash
npm install
npm test
npm run type-check
npm run build
npm run extract
```

Run all three validation commands before handing off implementation changes. `npm run build` cleans `dist` before rebuilding it.

## Supported entry points

- `src/index.ts` — full public API.
- `src/core.ts` — core API without framework helpers.
- `src/minimal.ts` — flat, typestate-focused API.
- `src/delegate.ts` — child transition delegation.
- `src/entry-react.ts` — React entry, including core exports.
- `src/entry-solid.ts` — Solid helpers only; core factory names would conflict.
- `src/extract.ts` — build-time extraction API.

`pridepack.json` is the authoritative list of built entrypoints. Pridepack synchronizes the package export map during builds, and `scripts/verify-package.ts` checks every generated JS/type target. Update the README's published-module table whenever an entrypoint changes.

## Core model

Main-API machines have this shape:

```ts
type Machine<C, T> = { readonly context: C } & T;
```

Minimal machines are flat `C & T` objects. Do not mix examples between those shapes.

`createMachine(context, factory)` is the preferred main-API constructor. Its `next` callback reuses the same transition set. Traditional transition objects and class-based `MachineBase` states remain supported.

Immutability is not enforced at runtime. `context` is not frozen, and transition methods can perform side effects. Document these as conventions and type-level guidance, not guarantees.

## Internal transition storage

`src/internal-transitions.ts` stores the original transition map on a non-enumerable symbol. `createMachine` and `setContext` use it when reconstructing snapshots. Do not replace this with object rest/spread without accounting for transition identity and middleware properties.

## Async behavior

`runMachine` appends `TransitionOptions` containing an `AbortSignal`. A new dispatch aborts the preceding in-flight transition. Its `state` getter returns context; `dispatch` returns the entire machine.

The actor implementation has different semantics: it queues events and processes async transitions serially.

## Framework rules

React and Solid are optional peers.

Solid components run once, so Solid action façades must resolve the current machine at call time. Do not capture only the initial machine or initial transition names. Keep reactive reads inside accessors, memos, effects, or JSX.

## Extraction

The static extractor supports class-based machines and literal metadata syntax. The CLI lives at `scripts/extract-statechart.ts`, validates with `schemas/xstate-schema.json`, and can write JSON, Mermaid, or both. CLI runtime packages must remain production dependencies because the published `extract` binary imports them.

## Testing pitfalls

- Tests use Vitest and import from `vitest`.
- For context-only matching fixtures, prefer `createContext(context)` over `createMachine(context, {})`.
- Add runtime tests and, where relevant, compile-time assertions for type-level changes.
- Framework entry points need direct tests; root-entry tests do not exercise their packaging conflicts.

## Documentation

README and `docs/api.md` define the supported contract. Focused guides may explain deeper patterns. Historical comparison and design essays are not API specifications. Whenever behavior changes, update the canonical docs in the same change.
