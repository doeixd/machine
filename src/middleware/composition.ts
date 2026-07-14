/**
 * @file Middleware composition and pipeline utilities
 */

import type { BaseMachine, Context } from '../index';
import type {
  MiddlewareContext,
  MiddlewareResult,
  MiddlewareError,
  MiddlewareHooks,
  MiddlewareOptions
} from './core';
import {
  withLogging,
  withAnalytics,
  withValidation,
  withPermissions,
  withErrorReporting,
  withPerformanceMonitoring,
  withRetry
} from './core';
import { withHistory, type HistoryEntry, type HistoryTrackedMachine, type Serializer } from './history';
import { withSnapshot, type SnapshotTrackedMachine } from './snapshot';
import { withTimeTravel, type WithTimeTravel } from './time-travel';

// =============================================================================
// SECTION: COMPOSITION TYPES
// =============================================================================

/**
 * A middleware function that transforms a machine.
 * @template M - The input machine type
 * @template R - The output machine type (usually extends M)
 */
export type MiddlewareFn<M extends BaseMachine<any>, R extends BaseMachine<any> = M> = (machine: M) => R;

/**
 * A conditional middleware that may or may not be applied based on a predicate.
 * @template M - The machine type
 */
export type ConditionalMiddleware<M extends BaseMachine<any>> = {
  /** The middleware function to apply */
  middleware: MiddlewareFn<M>;
  /** Predicate function that determines if the middleware should be applied */
  when: (machine: M) => boolean;
};

/**
 * A named middleware entry for registry-based composition.
 * @template M - The machine type
 */
export type NamedMiddleware<M extends BaseMachine<any>> = {
  /** Unique name for the middleware */
  name: string;
  /** The middleware function */
  middleware: MiddlewareFn<M>;
  /** Optional description */
  description?: string;
  /** Optional priority for ordering (higher numbers = applied later) */
  priority?: number;
};

/**
 * Configuration for middleware pipeline execution.
 */
export interface PipelineConfig {
  /** Whether to continue execution if a middleware throws an error */
  continueOnError?: boolean;
  /** Whether to log errors from middlewares */
  logErrors?: boolean;
  /** Custom error handler */
  onError?: (error: Error, middlewareIndex: number, middlewareName?: string) => void;
}

/**
 * The machine returned by a middleware pipeline.
 *
 * @typeParam M - Final machine type produced by the pipeline.
 */
export type PipelineResult<M extends BaseMachine<any>> = M;

// =============================================================================
// SECTION: TYPE-LEVEL COMPOSITION
// =============================================================================

/**
 * Type-level utility for composing middleware return types.
 * This enables perfect TypeScript inference when chaining middlewares.
 *
 * @typeParam M - Initial machine type.
 * @typeParam Ms - Ordered tuple of middleware transformations.
 */
export type ComposeResult<
  M extends BaseMachine<any>,
  Ms extends readonly MiddlewareFn<any, any>[]
> = Ms extends readonly [infer First, ...infer Rest]
  ? First extends MiddlewareFn<any, infer R>
    ? Rest extends readonly MiddlewareFn<any, any>[]
      ? ComposeResult<R, Rest>
      : R
    : M
  : M;

// =============================================================================
// SECTION: COMPOSITION FUNCTIONS
// =============================================================================

/**
 * Compose multiple middleware functions into a single middleware stack.
 * Middleware is applied left-to-right (first middleware wraps outermost).
 *
 * @template M - The machine type
 * @param machine - The base machine
 * @param middlewares - Array of middleware functions
 * @returns A new machine with all middleware applied
 */
export function compose<M extends BaseMachine<any>>(
  machine: M,
  ...middlewares: Array<(m: M) => M>
): M {
  return middlewares.reduce((acc, middleware) => middleware(acc), machine);
}

/**
 * Type-safe middleware composition with perfect inference.
 * Composes multiple middlewares into a single transformation chain.
 *
 * @template M - The input machine type
 * @template Ms - Array of middleware functions
 * @param machine - The machine to enhance
 * @param middlewares - Middleware functions to apply in order
 * @returns The machine with all middlewares applied, with precise type inference
 */
export function composeTyped<
  M extends BaseMachine<any>,
  Ms extends readonly MiddlewareFn<any, any>[]
>(
  machine: M,
  ...middlewares: Ms
): ComposeResult<M, Ms> {
  return middlewares.reduce((acc, middleware) => middleware(acc), machine) as ComposeResult<M, Ms>;
}

// =============================================================================
// SECTION: FLUENT API
// =============================================================================

/**
 * Fluent middleware composer for building complex middleware chains.
 * Provides excellent TypeScript inference and IntelliSense.
 */
class MiddlewareChainBuilder<M extends BaseMachine<any>> {
  constructor(private machine: M) {}

  /**
   * Add a middleware to the composition chain.
   * @param middleware - The middleware function to add
   * @returns A new composer with the middleware applied
   */
  with<M2 extends MiddlewareFn<any, any>>(
    middleware: M2
  ): MiddlewareChainBuilder<ReturnType<M2> extends BaseMachine<any> ? ReturnType<M2> : M> {
    const result = middleware(this.machine);
    return new MiddlewareChainBuilder(result as any);
  }

  /**
   * Build the final machine with all middlewares applied.
   */
  build(): M {
    return this.machine;
  }
}

/**
 * Create a fluent middleware chain builder.
 *
 * @typeParam M - Initial machine type.
 * @param machine - Machine to transform.
 * @returns A builder containing the current machine.
 *
 * @example
 * ```typescript
 * const enhanced = chain(counter)
 *   .with(withHistory())
 *   .with(withSnapshot())
 *   .with(withTimeTravel())
 *   .build();
 * ```
 */
export function chain<M extends BaseMachine<any>>(machine: M) {
  return new MiddlewareChainBuilder(machine);
}

// =============================================================================
// SECTION: CONDITIONAL MIDDLEWARE
// =============================================================================

/**
 * Create a conditional middleware that only applies when a predicate is true.
 *
 * @template M - The machine type
 * @param middleware - The middleware to conditionally apply
 * @param predicate - Function that determines when to apply the middleware
 * @returns A conditional middleware that can be called directly or used in pipelines
 */
export function when<M extends BaseMachine<any>>(
  middleware: MiddlewareFn<M>,
  predicate: (machine: M) => boolean
): ConditionalMiddleware<M> & MiddlewareFn<M> {
  const conditional: ConditionalMiddleware<M> & MiddlewareFn<M> = function(machine: M) {
    return predicate(machine) ? middleware(machine) : machine;
  };

  conditional.middleware = middleware;
  conditional.when = predicate;

  return conditional;
}

/**
 * Create a middleware that only applies in development mode.
 *
 * @template M - The machine type
 * @param middleware - The middleware to apply in development
 * @returns A conditional middleware for development mode
 */
export function inDevelopment<M extends BaseMachine<any>>(
  middleware: MiddlewareFn<M>
): ConditionalMiddleware<M> & MiddlewareFn<M> {
  return when(middleware, () => {
    return typeof process !== 'undefined'
      ? process.env.NODE_ENV === 'development'
      : typeof window !== 'undefined'
        ? !window.location.hostname.includes('production')
        : false;
  });
}

/**
 * Create a middleware that only applies when a context property matches a value.
 *
 * @template M - The machine type
 * @template K - The context key
 * @param key - The context property key
 * @param value - The value to match
 * @param middleware - The middleware to apply when the condition matches
 * @returns A conditional middleware
 */
export function whenContext<M extends BaseMachine<any>, K extends keyof Context<M>>(
  key: K,
  value: Context<M>[K],
  middleware: MiddlewareFn<M>
): ConditionalMiddleware<M> & MiddlewareFn<M> {
  return when(middleware, (machine) => machine.context[key] === value);
}

// =============================================================================
// SECTION: MIDDLEWARE REGISTRY
// =============================================================================

/**
 * Create a middleware registry for managing reusable middleware configurations.
 *
 * @typeParam M - Machine type accepted by registered middleware.
 * @returns An isolated registry with registration, inspection, and application methods.
 * @throws {Error} `register` rejects duplicate names and `apply` rejects unknown names.
 */
export function createMiddlewareRegistry<M extends BaseMachine<any>>() {
  const registry = new Map<string, NamedMiddleware<M>>();

  return {
    /**
     * Register a middleware by name.
     */
    register(
      name: string,
      middleware: MiddlewareFn<M>,
      description?: string,
      priority?: number
    ): typeof this {
      if (registry.has(name)) {
        throw new Error(`Middleware '${name}' is already registered`);
      }

      registry.set(name, { name, middleware, description, priority });
      return this;
    },

    /**
     * Unregister a middleware by name.
     */
    unregister(name: string): boolean {
      return registry.delete(name);
    },

    /**
     * Check if a middleware is registered.
     */
    has(name: string): boolean {
      return registry.has(name);
    },

    /**
     * Get a registered middleware by name.
     */
    get(name: string): NamedMiddleware<M> | undefined {
      return registry.get(name);
    },

    /**
     * List all registered middlewares.
     */
    list(): NamedMiddleware<M>[] {
      return Array.from(registry.values()).sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    },

    /**
     * Apply a selection of registered middlewares to a machine.
     * Middlewares are applied in priority order (lowest to highest).
     */
    apply(machine: M, middlewareNames: string[]): M {
      const middlewares = middlewareNames
        .map(name => {
          const entry = registry.get(name);
          if (!entry) {
            throw new Error(`Middleware '${name}' is not registered`);
          }
          return entry;
        })
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

      return composeTyped(machine, ...middlewares.map(m => m.middleware));
    },

    /**
     * Apply all registered middlewares to a machine in priority order.
     */
    applyAll(machine: M): M {
      const middlewares = this.list();
      return composeTyped(machine, ...middlewares.map(m => m.middleware));
    }
  };
}

// =============================================================================
// SECTION: PIPELINES
// =============================================================================

/**
 * Create a middleware pipeline with error handling and conditional execution.
 *
 * @template M - The machine type
 * @param config - Pipeline configuration
 * @returns A function that executes middlewares in a pipeline
 */
export function createPipeline<M extends BaseMachine<any>>(
  config: PipelineConfig = {}
): {
  <Ms extends Array<MiddlewareFn<M> | ConditionalMiddleware<M>>>(
    machine: M,
    ...middlewares: Ms
  ): { machine: M; errors: Array<{ error: Error; middlewareIndex: number; middlewareName?: string }>; success: boolean };
} {
  const {
    continueOnError = false,
    logErrors = true,
    onError
  } = config;

  return (machine: M, ...middlewares: Array<MiddlewareFn<M> | ConditionalMiddleware<M>>) => {
    let currentMachine = machine;
    const errors: Array<{ error: Error; middlewareIndex: number; middlewareName?: string }> = [];
    let success = true;

    for (let i = 0; i < middlewares.length; i++) {
      const middleware = middlewares[i];

      try {
        // Handle conditional middleware
        if ('middleware' in middleware && 'when' in middleware) {
          if (!middleware.when(currentMachine)) {
            continue; // Skip this middleware
          }
          currentMachine = middleware.middleware(currentMachine);
        } else {
          // Regular middleware
          currentMachine = (middleware as MiddlewareFn<M>)(currentMachine);
        }
      } catch (error) {
        success = false;
        if (!continueOnError) {
          throw error;
        }

        errors.push({
          error: error as Error,
          middlewareIndex: i,
          middlewareName: (middleware as any).name
        });

        if (logErrors) {
          console.error(`Pipeline middleware error at index ${i}:`, error);
        }

        onError?.(error as Error, i, (middleware as any).name);
      }
    }

    return { machine: currentMachine, errors, success };
  };
}

// =============================================================================
// SECTION: UTILITY FUNCTIONS
// =============================================================================

/**
 * Combine middleware into one reusable left-to-right transformation.
 *
 * Despite the historical name, every supplied middleware runs; use {@link branch}
 * when only one transformation should be selected.
 *
 * @typeParam M - Machine accepted and returned by every middleware.
 * @param middlewares - Transformations to apply in declaration order.
 * @returns A middleware function that applies the complete sequence.
 */
export function combine<M extends BaseMachine<any>>(
  ...middlewares: Array<MiddlewareFn<M>>
): MiddlewareFn<M> {
  return (machine: M) => composeTyped(machine, ...middlewares);
}

/**
 * Select the first middleware whose predicate matches a machine.
 *
 * @typeParam M - Machine type inspected and transformed.
 * @param branches - Ordered predicate/middleware pairs. Only the first match runs.
 * @param fallback - Transformation used when no predicate matches. Without one,
 * the original machine is returned.
 * @returns A reusable branching middleware.
 *
 * @example
 * ```ts
 * const instrument = branch([
 *   [machine => machine.context.debug, withLogging],
 * ], machine => machine);
 * ```
 */
export function branch<M extends BaseMachine<any>>(
  branches: Array<[predicate: (machine: M) => boolean, middleware: MiddlewareFn<M>]>,
  fallback?: MiddlewareFn<M>
): MiddlewareFn<M> {
  return (machine: M) => {
    for (const [predicate, middleware] of branches) {
      if (predicate(machine)) {
        return middleware(machine);
      }
    }
    return fallback ? fallback(machine) : machine;
  };
}

// =============================================================================
// SECTION: ENHANCED TYPE GUARDS
// =============================================================================

/**
 * Test whether a value has the unary function shape used by middleware.
 *
 * This is a structural check only; it cannot prove what machine the function
 * accepts or returns.
 *
 * @typeParam M - Assumed input machine type after narrowing.
 * @typeParam R - Assumed result machine type after narrowing.
 * @param value - Unknown value to inspect.
 */
export function isMiddlewareFn<M extends BaseMachine<any>, R extends BaseMachine<any> = M>(
  value: any
): value is MiddlewareFn<M, R> {
  return typeof value === 'function' && value.length === 1;
}

/**
 * Test whether a value contains callable `middleware` and `when` members.
 *
 * @typeParam M - Assumed machine type after narrowing.
 * @param value - Unknown value to inspect.
 */
export function isConditionalMiddleware<M extends BaseMachine<any>>(
  value: any
): value is ConditionalMiddleware<M> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    'middleware' in value &&
    'when' in value &&
    isMiddlewareFn(value.middleware) &&
    typeof value.when === 'function'
  );
}

/**
 * Test whether a value has the runtime shape of a middleware result.
 *
 * Passing `contextType` only checks that contexts are non-null objects; generic
 * object properties cannot be validated at runtime without a schema.
 *
 * @typeParam C - Expected context type after narrowing.
 * @param value - Unknown value to inspect.
 * @param contextType - Optional sample used to request the shallow context check.
 */
export function isMiddlewareResult<C extends object>(
  value: any,
  contextType?: C
): value is MiddlewareResult<C> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'transitionName' in value &&
    'prevContext' in value &&
    'nextContext' in value &&
    'args' in value &&
    typeof value.transitionName === 'string' &&
    Array.isArray(value.args) &&
    (!contextType || (
      isValidContext(value.prevContext, contextType) &&
      isValidContext(value.nextContext, contextType)
    ))
  );
}

/**
 * Test whether a value has the runtime shape passed to a `before` hook.
 *
 * @typeParam C - Expected context type after narrowing.
 * @param value - Unknown value to inspect.
 * @param contextType - Optional sample used to request a shallow object check.
 */
export function isMiddlewareContext<C extends object>(
  value: any,
  contextType?: C
): value is MiddlewareContext<C> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'transitionName' in value &&
    'context' in value &&
    'args' in value &&
    typeof value.transitionName === 'string' &&
    Array.isArray(value.args) &&
    (!contextType || isValidContext(value.context, contextType))
  );
}

/**
 * Test whether a value has middleware error fields and an `Error` instance.
 *
 * @typeParam C - Expected context type after narrowing.
 * @param value - Unknown value to inspect.
 * @param contextType - Optional sample used to request a shallow object check.
 */
export function isMiddlewareError<C extends object>(
  value: any,
  contextType?: C
): value is MiddlewareError<C> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'transitionName' in value &&
    'context' in value &&
    'args' in value &&
    'error' in value &&
    typeof value.transitionName === 'string' &&
    Array.isArray(value.args) &&
    value.error instanceof Error &&
    (!contextType || isValidContext(value.context, contextType))
  );
}

/**
 * Test whether every present middleware hook is callable.
 *
 * @typeParam C - Context type associated with the narrowed hooks.
 * @param value - Unknown value to inspect.
 */
export function isMiddlewareHooks<C extends object>(
  value: any,
  _contextType?: C
): value is MiddlewareHooks<C> {
  if (value === null || typeof value !== 'object') return false;

  const hooks = value as Partial<MiddlewareHooks<C>>;

  // Check before hook
  if ('before' in hooks && hooks.before !== undefined) {
    if (typeof hooks.before !== 'function') return false;
  }

  // Check after hook
  if ('after' in hooks && hooks.after !== undefined) {
    if (typeof hooks.after !== 'function') return false;
  }

  // Check error hook
  if ('error' in hooks && hooks.error !== undefined) {
    if (typeof hooks.error !== 'function') return false;
  }

  return true;
}

/**
 * Type guard to check if a value is middleware options with strict type checking.
 */
export function isMiddlewareOptions(value: any): value is MiddlewareOptions {
  return (
    value === undefined ||
    (value !== null &&
     typeof value === 'object' &&
     ('continueOnError' in value ? typeof value.continueOnError === 'boolean' : true) &&
     ('logErrors' in value ? typeof value.logErrors === 'boolean' : true) &&
     ('onError' in value ? typeof value.onError === 'function' || value.onError === undefined : true))
  );
}

/**
 * Helper function to validate context objects.
 */
function isValidContext<C extends object>(value: any, _contextType: C): value is C {
  return value !== null && typeof value === 'object';
}

/**
 * Test whether a value is a valid named registry entry.
 *
 * @typeParam M - Machine type associated with the narrowed middleware.
 * @param value - Unknown value to inspect.
 */
export function isNamedMiddleware<M extends BaseMachine<any>>(
  value: any
): value is NamedMiddleware<M> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'name' in value &&
    'middleware' in value &&
    typeof value.name === 'string' &&
    isMiddlewareFn(value.middleware) &&
    ('description' in value ? typeof value.description === 'string' || value.description === undefined : true) &&
    ('priority' in value ? typeof value.priority === 'number' || value.priority === undefined : true)
  );
}

/**
 * Type guard to check if a value is pipeline config with strict type checking.
 */
export function isPipelineConfig(value: any): value is PipelineConfig {
  return (
    value === undefined ||
    (value !== null &&
     typeof value === 'object' &&
     ('continueOnError' in value ? typeof value.continueOnError === 'boolean' : true) &&
     ('logErrors' in value ? typeof value.logErrors === 'boolean' : true) &&
     ('onError' in value ? typeof value.onError === 'function' || value.onError === undefined : true))
  );
}

// =============================================================================
// SECTION: GENERIC MIDDLEWARE BUILDER
// =============================================================================

/**
 * Configuration for logging middleware.
 */
export interface LoggingOptions {
  logger?: (message: string) => void;
  includeArgs?: boolean;
  includeContext?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Configuration for analytics middleware.
 */
export interface AnalyticsOptions {
  eventPrefix?: string;
  includePrevContext?: boolean;
  includeArgs?: boolean;
  includeTiming?: boolean;
}

/**
 * Configuration for validation middleware.
 */
export interface ValidationOptions {
  throwOnFailure?: boolean;
  logFailures?: boolean;
}

/**
 * Configuration for error reporting middleware.
 */
export interface ErrorReportingOptions {
  includeArgs?: boolean;
  includeStackTrace?: boolean;
  reportTo?: string[];
}

/**
 * Configuration for performance monitoring middleware.
 */
export interface PerformanceOptions {
  includeArgs?: boolean;
  includeContext?: boolean;
  warnThreshold?: number;
}

/**
 * Configuration for retry middleware.
 */
export interface RetryOptions {
  maxAttempts?: number;
  maxRetries?: number;
  shouldRetry?: (error: Error, attempt: number) => boolean;
  backoffMs?: number | ((attempt: number) => number);
  delay?: number | ((attempt: number) => number);
  backoffMultiplier?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Configuration for history middleware.
 */
export interface HistoryOptions {
  maxSize?: number;
  serializer?: Serializer<any[]>;
  onEntry?: (entry: HistoryEntry) => void;
  includeTimestamps?: boolean;
}

/**
 * Configuration for snapshot middleware.
 */
export interface SnapshotOptions {
  maxSize?: number;
  serializer?: Serializer<Context<any>>;
  captureSnapshot?: (before: Context<any>, after: Context<any>) => any;
  onlyOnChange?: boolean;
  includeDiff?: boolean;
}

/**
 * Configuration for time travel middleware.
 */
export interface TimeTravelOptions {
  maxSize?: number;
  serializer?: Serializer;
  onRecord?: (type: 'history' | 'snapshot', data: any) => void;
  enableReplay?: boolean;
}

/**
 * Fluent, lazy middleware configuration for one machine.
 *
 * Calls such as `withHistory()` record transformations; {@link build} applies
 * them in order. Capability-adding methods update the builder's static type so
 * the resulting debugging members appear in editor completion.
 *
 * @typeParam M - Machine type currently produced by the configured chain.
 */
export class MiddlewareBuilder<M extends BaseMachine<any>> {
  private middlewares: Array<(machine: any) => any> = [];

  constructor(private machine: M) {}

  /**
   * Add logging middleware with type-safe configuration.
   */
  withLogging(options?: LoggingOptions): MiddlewareBuilder<M> {
    this.middlewares.push((machine: M) => withLogging(machine, options));
    return this;
  }

  /**
   * Add analytics middleware with type-safe configuration.
   */
  withAnalytics(
    track: (event: string, data?: any) => void,
    options?: AnalyticsOptions
  ): MiddlewareBuilder<M> {
    this.middlewares.push((machine: M) => withAnalytics(machine, track, options));
    return this;
  }

  /**
   * Add validation middleware with type-safe configuration.
   */
  withValidation(
    validator: (ctx: MiddlewareContext<Context<M>>) => boolean | void,
    _options?: ValidationOptions
  ): MiddlewareBuilder<M> {
    this.middlewares.push((machine: M) => withValidation(machine, validator));
    return this;
  }

  /**
   * Add permission checking middleware with type-safe configuration.
   */
  withPermissions(
    checker: (ctx: MiddlewareContext<Context<M>>) => boolean
  ): MiddlewareBuilder<M> {
    this.middlewares.push((machine: M) => withPermissions(machine, checker));
    return this;
  }

  /**
   * Add error reporting middleware with type-safe configuration.
   */
  withErrorReporting(
    reporter: (error: Error, ctx: MiddlewareError<Context<M>>) => void,
    options?: ErrorReportingOptions
  ): MiddlewareBuilder<M> {
    this.middlewares.push((machine: M) => withErrorReporting(machine, reporter, options));
    return this;
  }

  /**
   * Add performance monitoring middleware with type-safe configuration.
   */
  withPerformanceMonitoring(
    tracker: (metric: { transitionName: string; duration: number; context: Context<M> }) => void,
    _options?: PerformanceOptions
  ): MiddlewareBuilder<M> {
    this.middlewares.push((machine: M) => withPerformanceMonitoring(machine, tracker));
    return this;
  }

  /**
   * Add retry middleware with type-safe configuration.
   */
  withRetry(options?: RetryOptions): MiddlewareBuilder<M> {
    this.middlewares.push((machine: M) => withRetry(machine, options));
    return this;
  }

  /**
   * Add history tracking middleware with type-safe configuration.
   */
  withHistory(options?: HistoryOptions): MiddlewareBuilder<HistoryTrackedMachine<M>> {
    this.middlewares.push((machine: M) => withHistory(machine, options));
    return this as unknown as MiddlewareBuilder<HistoryTrackedMachine<M>>;
  }

  /**
   * Add snapshot tracking middleware with type-safe configuration.
   */
  withSnapshot(options?: SnapshotOptions): MiddlewareBuilder<SnapshotTrackedMachine<M>> {
    this.middlewares.push((machine: M) => withSnapshot(machine, options));
    return this as unknown as MiddlewareBuilder<SnapshotTrackedMachine<M>>;
  }

  /**
   * Add time travel middleware with type-safe configuration.
   */
  withTimeTravel(options?: TimeTravelOptions): MiddlewareBuilder<WithTimeTravel<M>> {
    this.middlewares.push((machine: M) => withTimeTravel(machine, options));
    return this as unknown as MiddlewareBuilder<WithTimeTravel<M>>;
  }

  /**
   * Add debugging middleware (combination of history, snapshot, and time travel).
   */
  withDebugging(): MiddlewareBuilder<WithDebugging<M>> {
    this.middlewares.push((machine: M) => withDebugging(machine));
    return this as unknown as MiddlewareBuilder<WithDebugging<M>>;
  }

  /**
   * Add a custom middleware function.
   */
  withCustom<R extends BaseMachine<any> = M>(
    middleware: MiddlewareFn<M, R>
  ): MiddlewareBuilder<R> {
    this.middlewares.push(middleware);
    return this as unknown as MiddlewareBuilder<R>;
  }

  /**
   * Add a conditional middleware.
   */
  withConditional(
    middleware: MiddlewareFn<M>,
    predicate: (machine: M) => boolean
  ): MiddlewareBuilder<M> {
    this.middlewares.push(when(middleware, predicate));
    return this;
  }

  /**
   * Build the final machine with all configured middleware applied.
   */
  build(): M {
    let result = this.machine;
    for (const middleware of this.middlewares) {
      result = middleware(result);
    }
    return result;
  }

  /**
   * Get the middleware chain without building (for inspection or further composition).
   */
  getChain(): Array<(machine: any) => any> {
    return [...this.middlewares];
  }

  /**
   * Clear all configured middleware.
   */
  clear(): MiddlewareBuilder<M> {
    this.middlewares = [];
    return this;
  }
}

/**
 * Create a typed middleware builder for a machine.
 * Provides perfect TypeScript inference for middleware configuration.
 *
 * @typeParam M - Initial machine type.
 * @param machine - Machine to configure.
 * @returns A lazy fluent middleware builder.
 *
 * @example
 * ```typescript
 * const enhancedMachine = middlewareBuilder(myMachine)
 *   .withLogging({ includeArgs: true })
 *   .withAnalytics(trackEvent)
 *   .withHistory({ maxSize: 100 })
 *   .withRetry({ maxAttempts: 3 })
 *   .build();
 * ```
 */
export function middlewareBuilder<M extends BaseMachine<any>>(machine: M): MiddlewareBuilder<M> {
  return new MiddlewareBuilder(machine);
}

/**
 * Create reusable defaults for middleware builders.
 *
 * @typeParam M - Machine type accepted by the factory.
 * @param defaultOptions - Middleware enabled for each created builder. Omitted
 * entries are not installed.
 * @returns An object whose `create(machine)` method returns a configured builder;
 * call `.build()` to apply the transformations.
 */
export function createMiddlewareFactory<M extends BaseMachine<any>>(
  defaultOptions: {
    logging?: LoggingOptions;
    analytics?: { track: (event: string, data?: any) => void; options?: AnalyticsOptions };
    history?: HistoryOptions;
    snapshot?: SnapshotOptions;
    timeTravel?: TimeTravelOptions;
    retry?: RetryOptions;
  } = {}
) {
  return {
    create: (machine: M) => {
      const builder = middlewareBuilder(machine);

      if (defaultOptions.logging) {
        builder.withLogging(defaultOptions.logging);
      }

      if (defaultOptions.analytics) {
        builder.withAnalytics(
          defaultOptions.analytics.track,
          defaultOptions.analytics.options
        );
      }

      if (defaultOptions.history) {
        builder.withHistory(defaultOptions.history);
      }

      if (defaultOptions.snapshot) {
        builder.withSnapshot(defaultOptions.snapshot);
      }

      if (defaultOptions.timeTravel) {
        builder.withTimeTravel(defaultOptions.timeTravel);
      }

      if (defaultOptions.retry) {
        builder.withRetry(defaultOptions.retry);
      }

      return builder;
    }
  };
}

// =============================================================================
// SECTION: UTILITY FUNCTIONS
// =============================================================================

// =============================================================================
// SECTION: COMMON COMBINATIONS
// =============================================================================

/**
 * A machine instrumented with transition history, context snapshots, and replay.
 *
 * @typeParam M - Original machine type.
 */
export type WithDebugging<M extends BaseMachine<any>> = WithTimeTravel<SnapshotTrackedMachine<HistoryTrackedMachine<M>>>;

/**
 * Apply history, snapshot, and time-travel instrumentation in one operation.
 *
 * @typeParam M - Machine type to instrument.
 * @param machine - Immutable machine snapshot to wrap.
 * @returns The instrumented machine with debugging methods.
 */
export function withDebugging<M extends BaseMachine<any>>(machine: M): WithDebugging<M> {
  return withTimeTravel(withSnapshot(withHistory(machine)));
}
