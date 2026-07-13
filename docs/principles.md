# State Machines from First Principles

The library starts from one idea: a machine is a state snapshot whose transition functions return the next snapshot. This is a direct, executable representation of a state machine rather than a separate configuration interpreted at runtime.

## The formal model

A classic finite-state machine is commonly written as `(S, Σ, δ, s₀, F)`:

| Part | Meaning | Library representation |
| --- | --- | --- |
| `S` | Finite set of control states | A typestate union, tagged-state union, or set of state classes |
| `Σ` | Input alphabet | Transition names and their typed arguments |
| `δ` | State transition function | Methods that consume the current snapshot and input and return the next snapshot |
| `s₀` | Initial state | The snapshot supplied to a machine factory or runner |
| `F` | Accepting/final states | Optional terminal typestates with no outgoing methods |

The transition function is often partial in application code. A transition that is illegal from a state is omitted from that typestate instead of being accepted as a string and rejected later.

Most useful programs are extended state machines. They have a finite set of control states plus data—called `context` in the main API—whose possible values may be unbounded. Keeping these concepts separate avoids the inaccurate claim that every possible context value must form a finite set.

## Why transitions are typed functions

An input such as `login(username)` is an ordinary method call. TypeScript checks that the current state has a `login` transition and that its payload is correct. Renames and parameter changes use normal editor tooling, and a returned value is the complete next snapshot.

This also keeps the core open to ordinary language features. A guard can evaluate a condition, an action can call another function, and an async transition can await a service. Higher-level runners and actors add event dispatch only where ownership, queues, or subscriptions require it.

## The guarantees and their boundary

Typestate can make many illegal transitions unrepresentable at compile time. The API encourages immutable snapshots and transitions that depend only on the current snapshot and input.

JavaScript cannot enforce all of those properties. Code can mutate nested objects, read global state, perform effects, inspect history, or choose nondeterministically. The library therefore does not claim that purity, deep immutability, determinism, or the Markov property is automatically enforced. Those remain explicit design rules, with runtime validation available where appropriate.

## Metadata without a second machine definition

Executable functions are less mechanically inspectable than declarative data. When a project needs diagrams, documentation, or generated statecharts, metadata decorators annotate the transition that actually runs:

```ts
const login = pipe(
  (username: string) => new LoggedIn(username),
  transitionTo(LoggedIn),
  describe('Log in'),
  guarded({ name: 'hasUsername' }),
);
```

The decorators preserve the transition's call signature, attach non-enumerable runtime metadata, and expose metadata to the static extractor. They can also be nested in their original two-argument form. This keeps behavior as the source of truth while making formal analysis available when it is valuable.
