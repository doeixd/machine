/**
 * @fileoverview A minimal, type-safe typestate library.
 */

// ============================================================================
// CORE TYPES (MUST BE IN THIS FILE FOR INFERENCE)
// ============================================================================

/**
 * A state machine combining context (state data) with transitions (methods).
 */
export type Machine<C extends object, T> = C & T;

// Re-export utilities
export * from './types';
import { type Tagged, type TagOf, type Cleanup } from './types';

// ============================================================================
// CORE: machine()
// ============================================================================

/**
 * Creates a state machine by bundling context with transitions.
 * 
 * Note: 'any' is used in the 'next' callback signature to break recursive 
 * inference cycles. This is required for TypeScript to correctly infer 
 * transitions 'T' from the return object of the factory.
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
 * Handler functions for each case in a tagged union.
 */
export type MatchCases<T extends Tagged, R> = {
  [K in TagOf<T>]: (state: Extract<T, { tag: K }>) => R;
};

/**
 * Exhaustive pattern matching on tagged unions.
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

export interface Lifecycle<E extends string = string> {
  onEnter?: (send: Send<E>) => Cleanup;
}

export type Send<E extends string = string> = (event: E, ...args: unknown[]) => void;

export type LifecycleMap<Tags extends string> = {
  [K in Tags]?: Lifecycle<string>;
};

const LIFECYCLE = Symbol('lifecycle');

export type RunnableMachine<M, Tags extends string> = M & {
  [LIFECYCLE]?: LifecycleMap<Tags>;
};

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

export interface Runner<M> {
  get: () => M;
  send: Send<string>;
  stop: () => void;
  subscribe: (listener: (state: M) => void) => () => void;
}

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
      cleanup = lifecycle.onEnter(send);
    }
  };

  const send: Send<string> = (event, ...args) => {
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
  };

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

export type ParentMachine<P extends object, C extends Record<string, object>> =
  P & { [K in keyof C]: ChildProxy<P, C, C[K]> };

type ChildProxy<P extends object, C extends Record<string, object>, Child extends object> = {
  [K in keyof Child]: Child[K] extends (...args: infer A) => unknown
  ? (...args: A) => ParentMachine<P, C>
  : Child[K];
};

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

export function factory<C extends object>() {
  return <T>(
    transitionFactory: (ctx: C, next: (context: C) => any) => T
  ) => (context: C): C & T => machine(context, transitionFactory);
}

/**
 * Extracts the union of all possible machine states from a union factory.
 */
export type UnionOf<F extends (...args: any[]) => any> = ReturnType<F>;

/**
 * Creates a union factory that routes to different transition factories based on a tag.
 * This is the primary way to define multi-state machines (Type-States) in the minimal API.
 * 
 * @param factories - A map of tags to transition factories.
 * @returns A single factory function that produces the correct machine based on the input context's tag.
 * 
 * @example
 * const auth = union({
 *   idle: (ctx, next) => ({ login: () => next({ tag: 'loggedIn', user: 'alice' }) }),
 *   loggedIn: (ctx, next) => ({ logout: () => next({ tag: 'idle' }) })
 * });
 * 
 * const m = auth({ tag: 'idle' });
 * const next = m.login(); // Transition to loggedIn state
 */
/**
 * Creates a union factory that routes to different transition factories based on a tag.
 * This is the primary way to define multi-state machines (Type-States) in the minimal API.
 * 
 * @example
 * const auth = union<AuthState>()({
 *   idle: (ctx, next) => ({ login: () => next({ tag: 'loggedIn', user: 'alice' }) }),
 *   loggedIn: (ctx, next) => ({ logout: () => next({ tag: 'idle' }) })
 * });
 * 
 * const m = auth({ tag: 'idle' });
 * const next = m.login(); // Transition to loggedIn state
 */
export function union<C extends Tagged>() {
  return <F extends { [K in TagOf<C>]: (ctx: Extract<C, { tag: K }>, next: (c: C) => any) => any }>(
    factories: F
  ) => {
    type MachineMap = {
      [K in TagOf<C> & keyof F]: F[K] extends (ctx: any, next: any) => infer T
      ? Extract<C, { tag: K }> & T
      : never
    };

    const resultFactory = <T extends C>(context: T): MachineMap[T['tag'] & keyof MachineMap] => {
      const factoryFn = (factories as any)[(context as any).tag];
      return machine(context as any, (ctx: any, _next: any) => factoryFn(ctx as any, resultFactory as any)) as any;
    };

    return resultFactory;
  };
}
