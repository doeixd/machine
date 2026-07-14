/**
 * @fileoverview A minimal, type-safe typestate library.
 */

// ============================================================================
// CORE TYPES (MUST BE IN THIS FILE FOR INFERENCE)
// ============================================================================

/**
 * A flat immutable snapshot combining state data with transition methods.
 *
 * Unlike the main API's `Machine`, minimal-machine data is read directly from
 * the object (`machine.count`) rather than through `machine.context.count`.
 *
 * @typeParam C - Object shape containing the snapshot's state data.
 * @typeParam T - Object shape containing its transition methods.
 */
export type Machine<C extends object, T> = C & T;

// Re-export utilities
export * from './types';
import { type Tagged, type TagOf, type Cleanup } from './types';

/**
 * Explicit type for a callback that constructs a named next-machine shape.
 *
 * This is an inference escape hatch for recursive blueprints. Prefer
 * {@link factory} or {@link union} when they can infer the recursive result.
 *
 * @typeParam M - Machine shape returned by the callback.
 * @example
 * ```ts
 * const next: NextOf<Counter> = context => createCounter(context);
 * ```
 */
export type NextOf<M> = (context: any) => M;

/**
 * Explicitly types the transition blueprint accepted by {@link machine}.
 *
 * @typeParam C - State-data shape accepted by the blueprint and `next`.
 * @typeParam T - Transition object returned by the blueprint.
 */
export type Blueprint<C, T> = (ctx: C, next: (context: C) => C & T) => T;

declare const NEXT_STATE: unique symbol;
type NextState<C> = { readonly [NEXT_STATE]: C };
type TransitionRecord = Record<string, (...args: any[]) => any>;

/**
 * Recursively typed single-state snapshot produced by {@link factory}.
 *
 * Each transition keeps its declared parameters and returns another
 * `FactoryMachine<C, T>`.
 *
 * @typeParam C - Stable state-data shape.
 * @typeParam T - Transition blueprint shape.
 */
export type FactoryMachine<C extends object, T extends TransitionRecord> = C & {
  [K in keyof T]: T[K] extends (...args: infer A) => any
    ? (...args: A) => FactoryMachine<C, T>
    : never;
};

type UnionFactories<C extends Tagged> = {
  [K in TagOf<C>]: (
    context: Extract<C, { tag: K }>,
    next: <N extends C>(context: N) => NextState<N>
  ) => TransitionRecord;
};

type ResolveUnionNext<C extends Tagged, F extends UnionFactories<C>, R> =
  R extends NextState<infer N extends C>
    ? Extract<UnionMachine<C, F>, { tag: N['tag'] }>
    : R;

type UnionBranch<C extends Tagged, F extends UnionFactories<C>, K extends TagOf<C>> =
  Extract<C, { tag: K }> & {
    [P in keyof ReturnType<F[K]>]: ReturnType<F[K]>[P] extends (...args: infer A) => infer R
      ? (...args: A) => ResolveUnionNext<C, F, R>
      : never;
  };

/**
 * Fully resolved typestate union produced by {@link union}.
 *
 * A transition returning `next(tag(...))` is rewritten to the corresponding
 * branch, so the returned snapshot exposes only that branch's transitions.
 *
 * @typeParam C - Tagged state-data union.
 * @typeParam F - Complete mapping from tags to transition blueprints.
 */
export type UnionMachine<C extends Tagged, F extends UnionFactories<C>> = {
  [K in TagOf<C>]: UnionBranch<C, F, K>
}[TagOf<C>];

// ============================================================================
// CORE: machine()
// ============================================================================

/**
 * Creates one flat immutable machine snapshot.
 *
 * The blueprint receives the current data and a `next` function. Calling
 * `next` reconstructs the same blueprint over new data; the current snapshot
 * remains unchanged. Returning the current data by reference returns the same
 * snapshot instance.
 *
 * Use {@link factory} for a reusable recursively typed single-state machine,
 * or {@link union} when transitions move between different typestate APIs.
 *
 * @typeParam C - State-data shape accepted by this blueprint.
 * @typeParam T - Transition object inferred from the blueprint.
 * @param context - Initial state data copied onto the snapshot.
 * @param factory - Blueprint that creates transition methods for each snapshot.
 * @returns A flat object containing `context` fields and transition methods.
 *
 * @example
 * ```ts
 * const counter = machine({ count: 0 }, (state, next) => ({
 *   increment: () => next({ count: state.count + 1 }),
 * }));
 *
 * const updated = counter.increment();
 * console.log(counter.count, updated.count); // 0, 1
 * ```
 */
export function machine<C extends object, T>(
  context: C,
  factory: (ctx: C, next: (context: C) => any) => T
): C & T {
  let self!: C & T;
  const next = (newContext: C): any => (newContext === context ? self : machine(newContext, factory));
  self = Object.assign({}, context, factory(context, next)) as C & T;
  return self;
}

// ============================================================================
// PATTERN MATCHING: match()
// ============================================================================

/**
 * Exhaustive handler map consumed by {@link match}.
 *
 * @typeParam T - Tagged union being matched.
 * @typeParam R - Common handler result type.
 */
export type MatchCases<T extends Tagged, R> = {
  [K in TagOf<T>]: (state: Extract<T, { tag: K }>) => R;
};

/**
 * Exhaustively matches a tagged value and narrows it for the selected handler.
 *
 * @typeParam T - Tagged union being matched.
 * @typeParam R - Result returned by every handler.
 * @param state - Current tagged value.
 * @param cases - One handler for every tag in `T`.
 * @returns The selected handler's result.
 *
 * @example
 * ```ts
 * const text = match(request, {
 *   idle: () => 'Waiting',
 *   loading: state => `Loading ${state.url}`,
 *   success: state => state.data,
 * });
 * ```
 */
export function match<T extends Tagged, R>(
  state: T,
  cases: MatchCases<T, R>
): R {
  const handler = cases[state.tag as TagOf<T>];
  return handler(state as Extract<T, { tag: typeof state.tag }>);
}

// ============================================================================
// EFFECTS: runnable() + run()
// ============================================================================

/**
 * Entry behavior for one tagged state used by {@link runnable}.
 *
 * @typeParam E - Event names the entry callback may dispatch.
 */
export interface Lifecycle<E extends string = string> {
  /**
   * Runs after the runner enters the state. Return a function to clean up
   * before the next entry or when the runner stops.
   */
  onEnter?: (send: Send<E>) => Cleanup;
}

/**
 * Imperative event sender supplied to lifecycle callbacks.
 *
 * @typeParam E - Allowed event-name union.
 */
export type Send<E extends string = string> = (event: E, ...args: unknown[]) => void;

type TransitionNameOf<M> = M extends unknown ? {
  [K in keyof M]-?: M[K] extends (...args: any[]) => any ? K : never
}[keyof M] & string : never;

type TransitionOf<M, K extends PropertyKey> = M extends unknown
  ? K extends keyof M
    ? Extract<M[K], (...args: any[]) => any>
    : never
  : never;

/**
 * Transition dispatcher derived from every branch in a machine union.
 *
 * Event names and argument tuples are taken directly from transition methods.
 * Availability is checked at runtime against the current branch.
 *
 * @typeParam M - Machine or typestate union to inspect.
 */
export type SendFor<M> = <K extends TransitionNameOf<M>>(
  event: K,
  ...args: Parameters<TransitionOf<M, K>>
) => void;

/**
 * Optional lifecycle configuration keyed by state tag.
 *
 * @typeParam Tags - Tag-name union accepted by the map.
 */
export type LifecycleMap<Tags extends string> = {
  [K in Tags]?: Lifecycle<string>;
};

const LIFECYCLE = Symbol('lifecycle');

/**
 * Machine carrying lifecycle metadata for {@link run}.
 *
 * @typeParam M - Underlying tagged machine type.
 * @typeParam Tags - State tags covered by lifecycle configuration.
 */
export type RunnableMachine<M, Tags extends string> = M & {
  [LIFECYCLE]?: LifecycleMap<Tags>;
};

/**
 * Attaches state-entry lifecycle definitions without starting a runner.
 *
 * The returned value is a shallow copy; the input snapshot is unchanged.
 * Lifecycle metadata is carried forward by transitions processed by {@link run}.
 *
 * @typeParam M - Initial tagged machine type.
 * @typeParam Tags - Tags accepted by the lifecycle map.
 * @param initialMachine - Snapshot to decorate.
 * @param lifecycles - Entry callbacks indexed by tag.
 * @returns A snapshot containing symbol-keyed runner lifecycle metadata.
 *
 * @example
 * ```ts
 * const executable = runnable(createToggle(tag('off')), {
 *   on: { onEnter: () => () => console.log('leaving on') },
 * });
 * ```
 */
export function runnable<
  M extends Tagged,
  Tags extends string = TagOf<M>
>(
  initialMachine: M,
  lifecycles: LifecycleMap<Tags>
): RunnableMachine<M, Tags> {
  const result = { ...initialMachine } as RunnableMachine<M, Tags>;
  result[LIFECYCLE] = lifecycles;
  return result;
}

/**
 * Synchronous owner returned by {@link run}.
 *
 * @typeParam M - Complete machine union owned by the runner.
 */
export interface Runner<M> {
  /** Returns the current immutable snapshot. */
  get: () => M;
  /** Dispatches a transition by method name and argument tuple. */
  send: SendFor<M>;
  /** Runs active cleanup and removes every subscriber. */
  stop: () => void;
  /** Observes successful state changes; returns an unsubscribe callback. */
  subscribe: (listener: (state: M) => void) => () => void;
}

/**
 * Owns a tagged machine and dispatches its transitions synchronously.
 *
 * Events unavailable on the current branch are ignored. Successful tagged
 * results replace the current snapshot, run entry cleanup/behavior, and notify
 * subscribers. This runner does not queue promises; use the main actor API for
 * serialized asynchronous transitions.
 *
 * @typeParam M - Complete tagged machine union.
 * @param initial - Runnable initial snapshot.
 * @returns A synchronous runner with `get`, `send`, `subscribe`, and `stop`.
 *
 * @example
 * ```ts
 * const runner = run(runnable(createToggle(tag('off')), {}));
 * runner.send('turnOn');
 * console.log(runner.get().tag); // on
 * runner.stop();
 * ```
 */
export function run<M extends Tagged>(
  initial: RunnableMachine<M, string>
): Runner<M> {
  let current: RunnableMachine<M, string> = initial;
  let cleanup: Cleanup | null = null;
  const listeners = new Set<(state: M) => void>();

  const notify = () => {
    listeners.forEach((fn) => fn(current as M));
  };

  const enter = () => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
    const lifecycles = current[LIFECYCLE];
    const tagValue = (current as Tagged).tag;
    const lifecycle = lifecycles?.[tagValue];
    if (lifecycle?.onEnter) {
      cleanup = lifecycle.onEnter(send as Send<string>);
    }
  };

  const send = ((event: string, ...args: unknown[]) => {
    const transition = (current as Record<string, unknown>)[event];
    if (typeof transition === 'function') {
      const nextValue = (transition as (...a: unknown[]) => unknown)(...args);
      if (nextValue && typeof nextValue === 'object' && 'tag' in nextValue) {
        const nextMachine = nextValue as RunnableMachine<M, string>;
        if (!nextMachine[LIFECYCLE] && current[LIFECYCLE]) {
          nextMachine[LIFECYCLE] = current[LIFECYCLE];
        }
        current = nextMachine;
        enter();
        notify();
      }
    }
  }) as SendFor<M>;

  enter();

  return {
    get: () => current as M,
    send,
    stop: () => {
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
      listeners.clear();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

// ============================================================================
// COMPOSITION: withChildren()
// ============================================================================

/**
 * Parent snapshot with namespaced proxy APIs for each child.
 *
 * @typeParam P - Parent-owned fields.
 * @typeParam C - Mapping of child names to child snapshot shapes.
 */
export type ParentMachine<P extends object, C extends Record<string, object>> =
  P & { [K in keyof C]: ChildProxy<P, C, C[K]> };

type ChildProxy<P extends object, C extends Record<string, object>, Child extends object> = {
  [K in keyof Child]: Child[K] extends (...args: infer A) => unknown
  ? (...args: A) => ParentMachine<P, C>
  : Child[K];
};

/**
 * Namespaces child machines under a shallow immutable parent snapshot.
 *
 * Calling a child transition returns a new parent containing that child's next
 * snapshot. Other children and parent fields are retained. This helper does not
 * propagate events, run effects, or implement hierarchical-statechart entry,
 * exit, or history semantics.
 *
 * @typeParam P - Parent-owned field shape.
 * @typeParam C - Child-name to child-snapshot mapping.
 * @param parent - Parent fields to retain across child transitions.
 * @param children - Named child snapshots to expose through proxies.
 * @returns A parent with namespaced child state and transition methods.
 *
 * @example
 * ```ts
 * const dashboard = withChildren(
 *   { title: 'Overview' },
 *   { counter: createCounter({ count: 0 }) },
 * );
 * const updated = dashboard.counter.increment();
 * ```
 */
export function withChildren<
  P extends object,
  C extends Record<string, object>
>(
  parent: P,
  children: C
): ParentMachine<P, C> {
  const result = { ...parent } as ParentMachine<P, C>;

  for (const key of Object.keys(children) as Array<keyof C>) {
    const child = children[key];

    const childProxy = new Proxy(child, {
      get(target, prop: string | symbol) {
        const value = (target as Record<string | symbol, unknown>)[prop];

        if (typeof value === 'function') {
          return (...args: unknown[]) => {
            const nextChild = (value as (...a: unknown[]) => unknown)(...args);
            return withChildren(
              { ...parent },
              { ...children, [key]: nextChild as object } as C
            );
          };
        }

        return value;
      }
    }) as unknown as ChildProxy<P, C, C[keyof C]>;
    (result as Record<string, unknown>)[key as string] = childProxy;
  }

  return result;
}

// ============================================================================
// UTILITIES
// ============================================================================

// Re-exports from types.ts are enough

/**
 * Creates a reusable single-state minimal-machine factory.
 *
 * Every transition preserves its parameters and recursively returns the same
 * machine shape. Use {@link union} instead when a transition changes which
 * methods are available.
 *
 * @typeParam C - Stable state-data shape used by every snapshot.
 * @returns A blueprint consumer that produces a context-to-machine factory.
 *
 * @example
 * ```ts
 * const createCounter = factory<{ count: number }>()((state, next) => ({
 *   add: (amount: number) => next({ count: state.count + amount }),
 * }));
 * const three = createCounter({ count: 1 }).add(2);
 * ```
 */
export function factory<C extends object>() {
  return <T extends TransitionRecord>(
    transitionFactory: (ctx: C, next: <N extends C>(context: N) => NextState<N>) => T
  ) => {
    type M = FactoryMachine<C, T>;
    const resultFactory = (context: C): M => {
      const next = (c: C) => resultFactory(c);
      return machine(context, (ctx: C) => transitionFactory(ctx, next as any)) as M;
    };
    return resultFactory;
  };
}

/**
 * Extracts every resolved typestate from a {@link union} factory.
 *
 * @typeParam F - Union-factory function to inspect.
 */
export type UnionOf<F extends (...args: any[]) => any> = ReturnType<F>;

/**
 * Creates a tagged typestate factory with branch-specific transition APIs.
 *
 * The outer call fixes the allowed state-data union. The branch map must cover
 * every tag. Inside a branch, `next` rejects unknown tags and invalid payloads;
 * its return is resolved to the destination branch's complete machine type.
 *
 * @typeParam C - Complete tagged state-data union.
 * @returns A branch-map consumer that produces a type-narrowing machine factory.
 *
 * @example
 * ```ts
 * type Toggle = States<{ off: {}; on: {} }>;
 * const createToggle = union<Toggle>()({
 *   off: (_state, next) => ({ turnOn: () => next(tag('on')) }),
 *   on: (_state, next) => ({ turnOff: () => next(tag('off')) }),
 * });
 *
 * const on = createToggle(tag('off')).turnOn();
 * // on.turnOn(); // TypeScript error
 * ```
 */
export function union<C extends Tagged>() {
  return <F extends UnionFactories<C>>(
    factories: F
  ) => {
    type MachineUnion = UnionMachine<C, F>;

    const resultFactory = <T extends C>(context: T): Extract<MachineUnion, { tag: T['tag'] }> => {
      const factoryFn = factories[context.tag as TagOf<C>];
      const next = (c: C) => resultFactory(c as any);
      return machine(context as any, (ctx: any) => factoryFn(ctx as any, next as any)) as any;
    };

    return resultFactory;
  };
}
