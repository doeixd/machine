/**
 * @file Advanced Pattern Matching for State Machines
 * @description
 * Provides type-safe pattern matching utilities for discriminating between machine types.
 * Supports three complementary APIs: type guards, exhaustive pattern matching, and simple matching.
 *
 * @example
 * ```typescript
 * // Define a matcher for class-based machines
 * const match = createMatcher(
 *   classCase('idle', IdleMachine),
 *   classCase('loading', LoadingMachine),
 *   classCase('success', SuccessMachine)
 * );
 *
 * // API 1: Type Guards
 * if (match.is.loading(machine)) {
 *   // machine is narrowed to LoadingMachine
 * }
 *
 * // API 2: Exhaustive Pattern Matching
 * const result = match.when(machine).is<string>(
 *   match.case.idle(() => 'idle'),
 *   match.case.loading(() => 'loading'),
 *   match.case.success(m => m.context.data),
 *   match.exhaustive
 * );
 *
 * // API 3: Simple Match
 * const name = match(machine); // 'idle' | 'loading' | 'success' | null
 * ```
 */

import type { Machine, Context } from './index';
import { hasState } from './index';

// =============================================================================
// SECTION: CORE TYPES
// =============================================================================

/**
 * A matcher case tuple that defines a state pattern.
 *
 * @template Name - The unique name for this case (used for type guards and pattern matching)
 * @template M - The machine type this case matches
 * @template Pred - The predicate function that determines if a machine matches this case
 */
export type MatcherCase<
  Name extends string,
  M,
  Pred extends (m: any) => m is M
> = readonly [
  name: Name,
  machineType: M,
  predicate: Pred
];

/**
 * Extracts the machine type from a MatcherCase.
 */
type CaseToMachine<C> = C extends MatcherCase<any, infer M, any> ? M : never;

/**
 * Extracts the case name from a MatcherCase.
 */
type CaseToName<C> = C extends MatcherCase<infer Name, any, any> ? Name : never;

/**
 * Builds a mapping from case names to their machine types.
 */
export type CasesToMapping<Cases extends readonly MatcherCase<any, any, any>[]> = {
  [C in Cases[number]as CaseToName<C>]: CaseToMachine<C>;
};

/**
 * Creates a union of all possible machine types from the cases.
 */
export type MatcherUnion<Cases extends readonly MatcherCase<any, any, any>[]> =
  Cases[number] extends MatcherCase<any, infer M, any> ? M : never;

/**
 * Extracts the union of all case names.
 */
export type CaseNames<Cases extends readonly MatcherCase<any, any, any>[]> =
  CaseToName<Cases[number]>;

/**
 * A branded type representing a case handler in pattern matching.
 * This is used internally to track which cases have been handled.
 */
export type CaseHandler<Name extends string, M, R> = {
  readonly __brand: 'CaseHandler';
  readonly __name: Name;
  readonly __machine: M;
  readonly __return: R;
  readonly handler: (machine: M) => R;
};

/**
 * Exhaustiveness marker - signals that all cases must be handled.
 */
export type ExhaustivenessMarker = {
  readonly __exhaustive: true;
};

/**
 * Extracts machine types from an array of case handlers.
 */
type ExtractHandledMachines<H extends readonly any[]> =
  H extends readonly [infer First, ...infer Rest]
  ? (First extends CaseHandler<any, infer M, any> ? M : never) | ExtractHandledMachines<Rest>
  : never;

/**
 * Extracts return types from an array of case handlers.
 */
type ExtractHandlerReturn<H extends readonly any[]> =
  H extends readonly CaseHandler<any, any, infer R>[] ? R : never;

/**
 * Checks if all machine types in Union have been handled.
 * Returns true if exhaustive, otherwise returns an error type with missing cases.
 */
export type IsExhaustive<Union, Handled> =
  Exclude<Union, Handled> extends never
  ? true
  : {
    readonly __error: 'Non-exhaustive match - missing cases';
    readonly __missing: Exclude<Union, Handled>;
  };

/**
 * Pattern matching builder returned by matcher.when().
 */
export interface WhenBuilder<
  _Cases extends readonly MatcherCase<any, any, any>[],
  M
> {
  /**
   * Execute pattern matching with exhaustiveness checking.
   *
   * @template R - The return type of all handlers
   * @param handlers - Array of case handlers followed by exhaustiveness marker
   * @returns The result of the matched handler, or compile error if not exhaustive
   *
   * @example
   * ```typescript
   * match.when(machine).is<string>(
   *   match.case.idle(() => 'idle'),
   *   match.case.loading(() => 'loading'),
   *   match.exhaustive
   * );
   * ```
   */
  /**
   * Overload 1: Infer return type from handlers (Enables exhaustiveness checking).
   */
  is<H extends readonly CaseHandler<CaseNames<_Cases>, any, any>[]>(
    ...handlers: [...H, ExhaustivenessMarker]
  ): IsExhaustive<M, ExtractHandledMachines<H>> extends true
    ? ExtractHandlerReturn<H>
    : IsExhaustive<M, ExtractHandledMachines<H>>;

  /**
   * Overload 2: Explicit return type (No exhaustiveness checking).
   */
  is<R>(
    ...handlers: [...CaseHandler<CaseNames<_Cases>, any, R>[], ExhaustivenessMarker]
  ): R;
}

/**
 * The main Matcher interface with three APIs.
 */
export interface Matcher<Cases extends readonly MatcherCase<any, any, any>[]> {
  /**
   * API 1: Type guard access via dynamic properties.
   *
   * @example
   * ```typescript
   * if (match.is.loading(machine)) {
   *   // machine is narrowed to LoadingMachine
   * }
   * ```
   */
  readonly is: {
    [Name in CaseNames<Cases>]: (
      machine: any
    ) => machine is CasesToMapping<Cases>[Name];
  };

  /**
   * API 2a: Pattern matching builder.
   *
   * @example
   * ```typescript
   * match.when(machine).is<string>(
   *   match.case.idle(() => 'idle'),
   *   match.case.loading(() => 'loading'),
   *   match.exhaustive
   * );
   * ```
   */
  when: <M>(
    machine: M
  ) => WhenBuilder<Cases, M>;

  /**
   * API 2b: Case handler creator for pattern matching.
   *
   * @example
   * ```typescript
   * match.case.loading((m) => `Loading: ${m.context.startTime}`)
   * ```
   */
  readonly case: {
    [Name in CaseNames<Cases>]: <R>(
      handler: (machine: CasesToMapping<Cases>[Name]) => R
    ) => CaseHandler<Name, CasesToMapping<Cases>[Name], R>;
  };

  /**
   * API 2c: Exhaustiveness marker for pattern matching.
   */
  readonly exhaustive: ExhaustivenessMarker;

  /**
   * API 3: Simple match - returns the name of the matched case or null.
   *
   * @example
   * ```typescript
   * const name = match(machine); // 'idle' | 'loading' | 'success' | null
   * ```
   */
  <M>(machine: M): M extends MatcherUnion<Cases>
    ? CaseNames<Cases> | null
    : null;
}

// =============================================================================
// SECTION: MATCHER CREATION
// =============================================================================

/**
 * Creates a type-safe matcher for discriminating between machine types.
 *
 * @template Cases - Tuple of [name, MachineType, predicate] configurations
 * @param cases - Array of matcher case definitions
 * @returns A matcher object with three APIs: is (type guards), when (pattern matching), and direct call (simple match)
 *
 * @example
 * ```typescript
 * // Class-based matching
 * const match = createMatcher(
 *   ['idle', IdleMachine, (m): m is IdleMachine => m instanceof IdleMachine],
 *   ['loading', LoadingMachine, (m): m is LoadingMachine => m instanceof LoadingMachine]
 * );
 *
 * // Or use helper functions
 * const match = createMatcher(
 *   classCase('idle', IdleMachine),
 *   classCase('loading', LoadingMachine)
 * );
 * ```
 */
export function createMatcher<
  const Cases extends readonly MatcherCase<string, any, (m: any) => m is any>[]
>(
  ...cases: Cases
): Matcher<Cases> {
  // Build lookup map for O(1) case access
  const nameToCase = new Map<string, { predicate: (m: any) => boolean }>();

  for (const [name, _, predicate] of cases) {
    if (nameToCase.has(name)) {
      throw new Error(`Duplicate matcher case name: "${name}"`);
    }
    nameToCase.set(name, { predicate });
  }

  // API 1: Type Guards (using Proxy for dynamic property access)
  const isProxy = new Proxy({} as any, {
    get(_target, prop: string) {
      return function isGuard(machine: any): machine is any {
        const caseConfig = nameToCase.get(prop);
        if (!caseConfig) {
          const available = Array.from(nameToCase.keys()).join(', ');
          throw new Error(
            `Unknown matcher case: "${prop}". Available cases: ${available}`
          );
        }
        return caseConfig.predicate(machine);
      };
    }
  });

  // API 2b: Case Handlers (using Proxy for dynamic property access)
  const caseProxy = new Proxy({} as any, {
    get(_target, prop: string) {
      return function createCaseHandler<R>(
        handler: (machine: any) => R
      ): CaseHandler<any, any, R> {
        // Validate case name exists
        if (!nameToCase.has(prop)) {
          const available = Array.from(nameToCase.keys()).join(', ');
          throw new Error(
            `Unknown matcher case: "${prop}". Available cases: ${available}`
          );
        }

        return {
          __brand: 'CaseHandler' as const,
          __name: prop,
          __machine: undefined as any,
          __return: undefined as any,
          handler
        };
      };
    }
  });

  // API 2c: Exhaustiveness marker
  const exhaustive: ExhaustivenessMarker = { __exhaustive: true };

  // API 2a: Pattern Matching Builder
  function when<M>(machine: M): WhenBuilder<Cases, M> {
    return {
      is<R>(...handlers: any[]): R {
        // Validate we have at least exhaustiveness marker
        if (handlers.length === 0) {
          throw new Error('Pattern match requires at least one handler and exhaustiveness marker');
        }

        // Last element should be exhaustiveness marker
        const lastHandler = handlers[handlers.length - 1];
        if (!lastHandler || typeof lastHandler !== 'object' || !('__exhaustive' in lastHandler)) {
          throw new Error(
            'Pattern match must end with match.exhaustive for compile-time exhaustiveness checking'
          );
        }

        // Remove exhaustiveness marker
        const actualHandlers = handlers.slice(0, -1) as CaseHandler<any, any, R>[];

        // Try each handler in order (first-match-wins)
        for (const caseHandler of actualHandlers) {
          const caseName = caseHandler.__name;
          const caseConfig = nameToCase.get(caseName);

          if (!caseConfig) {
            throw new Error(`Internal error: Unknown matcher case in handler: ${caseName}`);
          }

          if (caseConfig.predicate(machine)) {
            return caseHandler.handler(machine);
          }
        }

        // No handler matched - this means pattern match wasn't actually exhaustive at runtime
        const handledCases = actualHandlers.map(h => h.__name).join(', ');
        const allCases = Array.from(nameToCase.keys()).join(', ');
        throw new Error(
          `Non-exhaustive pattern match at runtime: no handler matched the machine.\n` +
          `Handled cases: [${handledCases}]\n` +
          `All cases: [${allCases}]\n` +
          `This may occur if predicates don't cover all runtime possibilities.`
        );
      }
    };
  }

  // API 3: Simple Match (callable function)
  function simpleMatcher<M>(machine: M): string | null {
    for (const [name, _, predicate] of cases) {
      if (predicate(machine)) {
        return name;
      }
    }
    return null;
  }

  // Combine all APIs into a single object
  return Object.assign(simpleMatcher, {
    is: isProxy,
    when,
    case: caseProxy,
    exhaustive
  }) as any;
}

// =============================================================================
// SECTION: HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a class-based matcher case using instanceof checking.
 * This is the most common pattern for Type-State machines.
 *
 * @template Name - The unique name for this case
 * @template T - The class constructor
 * @param name - The name to use for this case
 * @param machineClass - The class to check with instanceof
 * @returns A matcher case tuple
 *
 * @example
 * ```typescript
 * const match = createMatcher(
 *   classCase('idle', IdleMachine),
 *   classCase('loading', LoadingMachine),
 *   classCase('success', SuccessMachine)
 * );
 * ```
 */
export function classCase<
  Name extends string,
  T extends abstract new (...args: any[]) => any
>(
  name: Name,
  machineClass: T
): MatcherCase<Name, InstanceType<T>, (m: any) => m is InstanceType<T>> {
  return [
    name,
    undefined as any, // Type-only, not used at runtime
    (m): m is InstanceType<T> => m instanceof machineClass
  ] as const;
}

/**
 * Creates a discriminated union matcher case based on a context property.
 * This integrates with the existing hasState utility for context-based discrimination.
 *
 * @template Name - The unique name for this case
 * @template M - The machine type (use Machine<YourContextUnion> for proper narrowing)
 * @template K - The context key to check
 * @template V - The value to match
 * @param name - The name to use for this case
 * @param key - The context property to check
 * @param value - The value the property should equal
 * @returns A matcher case tuple
 *
 * @example
 * ```typescript
 * type FetchContext =
 *   | { status: 'idle' }
 *   | { status: 'loading' }
 *   | { status: 'success'; data: string };
 *
 * const match = createMatcher(
 *   discriminantCase<'idle', Machine<FetchContext>, 'status', 'idle'>('idle', 'status', 'idle'),
 *   discriminantCase<'loading', Machine<FetchContext>, 'status', 'loading'>('loading', 'status', 'loading'),
 *   discriminantCase<'success', Machine<FetchContext>, 'status', 'success'>('success', 'status', 'success')
 * );
 * ```
 */
export function discriminantCase<
  Name extends string,
  M extends Machine<any> = Machine<any>,
  K extends keyof Context<M> = any,
  V extends Context<M>[K] = any
>(
  name: Name,
  key: K,
  value: V
): MatcherCase<
  Name,
  M & { context: Extract<Context<M>, { [P in K]: V }> },
  (m: M) => m is M & { context: Extract<Context<M>, { [P in K]: V }> }
> {
  return [
    name,
    undefined as any, // Type-only, not used at runtime
    (m): m is any => hasState(m, key as any, value as any)
  ] as const;
}

/**
 * Creates a custom matcher case with a user-defined predicate.
 * For advanced matching logic beyond instanceof or discriminants.
 *
 * @template Name - The unique name for this case
 * @template M - The machine type this case matches (inferred from predicate)
 * @param name - The name to use for this case
 * @param predicate - A type guard function that determines if a machine matches
 * @returns A matcher case tuple
 *
 * @example
 * ```typescript
 * const match = createMatcher(
 *   customCase('complex', (m): m is ComplexMachine => {
 *     return m.context.value > 10 && m.context.status === 'active';
 *   })
 * );
 * ```
 */
export function customCase<
  const Name extends string,
  M
>(
  name: Name,
  predicate: (m: any) => m is M
): MatcherCase<Name, M, (m: any) => m is M> {
  return [name, undefined as any, predicate] as const;
}

/**
 * Creates a discriminated matcher builder for a specific context union type.
 * Provides better type inference by capturing the context type upfront.
 *
 * @template C - The discriminated union context type
 * @returns A builder object with a `case` method for defining cases with less boilerplate
 *
 * @example
 * ```typescript
 * type FetchContext =
 *   | { status: 'idle' }
 *   | { status: 'loading'; startTime: number }
 *   | { status: 'success'; data: string };
 *
 * const builder = forContext<FetchContext>();
 *
 * const match = createMatcher(
 *   builder.case('idle', 'status', 'idle'),
 *   builder.case('loading', 'status', 'loading'),
 *   builder.case('success', 'status', 'success')
 * );
 *
 * // Full type inference and narrowing works!
 * if (match.is.success(machine)) {
 *   console.log(machine.context.data); // ✓ TypeScript knows data exists
 * }
 * ```
 */
export function forContext<C extends object>() {


  return {
    /**
     * Creates a discriminated union case with full type inference.
     */
    case<
      Name extends string,
      K extends keyof C,
      V extends C[K]
    >(
      name: Name,
      key: K,
      value: V
    ): MatcherCase<
      Name,
      { readonly context: Extract<C, { [P in K]: V }> },
      (m: { readonly context: C }) => m is { readonly context: Extract<C, { [P in K]: V }> }
    > {
      return [
        name,
        undefined as any,
        (m): m is any => hasState(m, key as any, value as any)
      ] as const;
    }
  };
}
