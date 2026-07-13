# Documentation

The repository [README](../README.md) is the best starting point: it explains the state-machine model, compares the two primary APIs, and includes runnable examples. The [supported API](api.md) is the concise public-contract reference; generated declarations remain the exhaustive signature reference.

## Pick a path

| Goal | Start here | Continue with |
| --- | --- | --- |
| Model states so invalid transitions disappear from the type | [Minimal API](minimal.md) | [Tagged helpers](tagged-helpers.md), [First principles](principles.md) |
| Build `{ context, ...transitions }` machines | [README: Main API](../README.md#main-api) | [Supported API](api.md), [Transition binding](this-binding.md) |
| Own a changing snapshot | [Actors](actor.md) | [Async cancellation](abort.md), [Event adapters](adapters.md) |
| Add guards or transition wrappers | [Conditional transitions](conditional-transitions.md) | [Middleware](middleware.md) |
| Compose machines | [Delegation](delegate.md) | [Higher-order machines](higher-order.md), [Mixins](mixins.md) |
| Generate diagrams or statecharts | [Statechart extraction](statechart-extraction.md) | [Hierarchical and parallel extraction](ADVANCED_EXTRACTION.md) |
| Choose a package subpath | [Published modules](modules.md) | [Supported API](api.md) |

## Framework integrations

- React is documented in the [README](../README.md#react) and [supported API](api.md#react-entry-doeixdmachinereact).
- Solid is documented in the [README](../README.md#solid) and [supported API](api.md#solid-entry-doeixdmachinesolid).

Both are optional peer integrations. Import them from their explicit subpaths so non-framework consumers do not cross a framework dependency boundary.

## Design and pattern notes

These guides explain trade-offs or less common construction styles. They are useful after the primary guide for your chosen API:

- [Binding strategies](binding-strategies.md)
- [Functional combinators](combinators.md)
- [API evolution](evolution.md)
- [Factories](factories.md)
- [Mutability boundaries](mutability.md)
- [Parallel composition](parallel.md)
- [Patterns guide](patterns-guide.md)
- [Additional patterns](patterns.md)
- [State machines from first principles](principles.md)
- [Services](services.md)
- [Comparison with the State pattern](vs-state-pattern.md)

## Historical and comparative essays

The following documents are retained as design history and discussion, not as the current package contract. Third-party APIs and comparisons may also have changed since they were written:

- [Compiler-oriented design notes](compiler-blog.md)
- [Type-system fixes](type-system-fixes.md)
- [XState comparison](XSTATE_COMPARISON.md)
- [YAGNI and state machines](yagni.md)
- [Zag.js refactoring essay](zag-blog.md)

When documents disagree, use this order of authority:

1. Current TypeScript declarations and tests
2. [Supported API](api.md) and focused supported guides
3. The repository [README](../README.md)
4. Design notes and historical essays

Please treat a disagreement as a documentation bug rather than relying on the older text.
