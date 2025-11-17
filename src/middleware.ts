/**
 * @file Middleware/interception system for state machines
 * @description Provides composable middleware for logging, analytics, validation, and more.
 */

import type { Context, BaseMachine } from './index';

// =============================================================================
// SECTION: MIDDLEWARE TYPES
// =============================================================================

/**
 * Context object passed to middleware hooks containing transition metadata.
 * @template C - The context object type
 */
export interface MiddlewareContext<C extends object> {
  /** The name of the transition being called */
  transitionName: string;
  /** The current machine context before the transition */
  context: Readonly<C>;
  /** Arguments passed to the transition function */
  args: any[];
}

/**
 * Result object passed to after hooks containing transition outcome.
 * @template C - The context object type
 */
export interface MiddlewareResult<C extends object> {
  /** The name of the transition that was called */
  transitionName: string;
  /** The context before the transition */
  prevContext: Readonly<C>;
  /** The context after the transition */
  nextContext: Readonly<C>;
  /** Arguments that were passed to the transition */
  args: any[];
}

/**
 * Error context passed to error hooks.
 * @template C - The context object type
 */
export interface MiddlewareError<C extends object> {
  /** The name of the transition that failed */
  transitionName: string;
  /** The context when the error occurred */
  context: Readonly<C>;
  /** Arguments that were passed to the transition */
  args: any[];
  /** The error that was thrown */
  error: Error;
}

/**
 * Configuration object for middleware hooks.
 * All hooks are optional - provide only the ones you need.
 * @template C - The context object type
 */
/**
 * Strongly typed middleware hooks with precise context and return types.
 * All hooks are optional - provide only the ones you need.
 *
 * @template C - The machine context type for precise type inference
 */
export interface MiddlewareHooks<C extends object> {
  /**
   * Called before a transition executes.
   * Can be used for validation, logging, analytics, etc.
   *
   * @param ctx - Transition context with machine state and transition details
   * @returns void to continue, CANCEL to abort silently, or Promise for async validation
   *
   * @example
   * ```typescript
   * before: ({ transitionName, args, context }) => {
   *   if (transitionName === 'withdraw' && context.balance < args[0]) {
   *     throw new Error('Insufficient funds');
   *   }
   * }
   * ```
   */
  before?: (ctx: MiddlewareContext<C>) => void | typeof CANCEL | Promise<void | typeof CANCEL>;

  /**
   * Called after a transition successfully executes.
   * Receives both the previous and next context.
   * Cannot prevent the transition (it already happened).
   *
   * @param result - Transition result with before/after contexts and transition details
   *
   * @example
   * ```typescript
   * after: ({ transitionName, before, after }) => {
   *   console.log(`${transitionName}: ${before.count} -> ${after.count}`);
   * }
   * ```
   */
  after?: (result: MiddlewareResult<C>) => void | Promise<void>;

  /**
   * Called if a transition throws an error.
   * Can be used for error logging, Sentry reporting, fallback states, etc.
   *
   * @param error - Error context with transition details and the thrown error
   * @returns
   * - void/undefined/null: Re-throw the original error (default)
   * - BaseMachine: Use this as fallback state instead of throwing
   * - throw new Error: Transform the error
   *
   * @example
   * ```typescript
   * error: ({ transitionName, error, context }) => {
   *   // Log to error reporting service
   *   reportError(error, { transitionName, context });
   *
   *   // Return fallback state for recoverable errors
   *   if (error.message.includes('network')) {
   *     return createMachine({ ...context, error: 'offline' }, transitions);
   *   }
   * }
   * ```
   */
  error?: (error: MiddlewareError<C>) => void | null | BaseMachine<C> | Promise<void | null | BaseMachine<C>>;
}

/**
 * Options for middleware configuration.
 */
export interface MiddlewareOptions {
  /**
   * Execution mode for middleware hooks.
   * - 'sync': Hooks must be synchronous, throws if hooks return Promise
   * - 'async': Always await hooks and transition
   * - 'auto' (default): Adaptive mode - starts synchronously, automatically handles async results if encountered
   *
   * Note: 'auto' mode provides the best of both worlds - zero overhead for sync transitions
   * while seamlessly handling async ones when they occur.
   * @default 'auto'
   */
  mode?: 'sync' | 'async' | 'auto';

  /**
   * Properties to exclude from middleware interception.
   * Useful for excluding utility methods or getters.
   * @default ['context']
   */
  exclude?: string[];
}

// =============================================================================
// SECTION: CANCELLATION SUPPORT
// =============================================================================

/**
 * Special symbol that can be returned from before hooks to cancel a transition.
 * When returned, the transition will not execute and the current machine state is preserved.
 *
 * @example
 * createMiddleware(machine, {
 *   before: ({ transitionName, context }) => {
 *     if (shouldCancel(context)) {
 *       return CANCEL; // Abort transition without throwing
 *     }
 *   }
 * });
 */
export const CANCEL = Symbol('CANCEL');

// =============================================================================
// SECTION: UTILITY TYPES FOR AUGMENTED MACHINES
// =============================================================================

/**
 * Augmented machine type with history tracking capabilities.
 * @template M - The base machine type
 * @template C - The context type
 */
export type WithHistory<M extends BaseMachine<any>> = M & {
  /** Array of recorded transition history entries */
  history: HistoryEntry[];
  /** Clear all history entries */
  clearHistory: () => void;
};

/**
 * Augmented machine type with snapshot tracking capabilities.
 * @template M - The base machine type
 * @template C - The context type
 */
export type WithSnapshot<M extends BaseMachine<any>, C extends object = Context<M>> = M & {
  /** Array of recorded context snapshots */
  snapshots: ContextSnapshot<C>[];
  /** Clear all snapshots */
  clearSnapshots: () => void;
  /** Restore machine to a previous context state */
  restoreSnapshot: (context: C) => M;
};

/**
 * Augmented machine type with full time-travel debugging capabilities.
 * Combines both history and snapshot tracking.
 * @template M - The base machine type
 * @template C - The context type
 */
export type WithTimeTravel<M extends BaseMachine<any>, C extends object = Context<M>> = M & {
  /** Array of recorded transition history entries */
  history: HistoryEntry[];
  /** Array of recorded context snapshots */
  snapshots: ContextSnapshot<C>[];
  /** Clear all history and snapshots */
  clearTimeTravel: () => void;
  /** Restore machine to a previous context state */
  restoreSnapshot: (context: C) => M;
  /** Replay all transitions from a specific snapshot */
  replayFrom: (snapshotIndex: number) => M;
};

// =============================================================================
// SECTION: CORE MIDDLEWARE FUNCTION
// =============================================================================

/**
 * Wraps a machine with middleware hooks that intercept all transitions.
 * Uses direct property wrapping for optimal performance (3x faster than Proxy).
 *
 * The middleware preserves:
 * - Full type safety (return type matches input machine)
 * - `this` binding for transitions
 * - Async and sync transitions
 * - Machine immutability
 *
 * @template M - The machine type
 * @param machine - The machine to wrap with middleware
 * @param hooks - Middleware hooks (before, after, error)
 * @param options - Configuration options
 * @returns A new machine with middleware applied
 *
 * @example
 * const instrumented = createMiddleware(counter, {
 *   before: ({ transitionName, context, args }) => {
 *     console.log(`→ ${transitionName}`, args);
 *   },
 *   after: ({ transitionName, prevContext, nextContext }) => {
 *     console.log(`✓ ${transitionName}`, nextContext);
 *   },
 *   error: ({ transitionName, error }) => {
 *     console.error(`✗ ${transitionName}:`, error);
 *   }
 * });
 */
export function createMiddleware<M extends BaseMachine<any>>(
  machine: M,
  hooks: MiddlewareHooks<Context<M>>,
  options: MiddlewareOptions = {}
): M {
  const { mode = 'auto', exclude = ['context'] } = options;

  // Build wrapped machine object with direct property iteration
  const wrapped: any = {};

  // Copy all properties and wrap functions
  for (const prop in machine) {
    if (!Object.prototype.hasOwnProperty.call(machine, prop)) continue;

    const value = machine[prop];

    // Always copy context
    if (prop === 'context') {
      wrapped.context = value;
      continue;
    }

    // Skip excluded properties
    if (exclude.includes(prop)) {
      wrapped[prop] = value;
      continue;
    }

    // Skip non-functions and private methods
    if (typeof value !== 'function' || prop.startsWith('_')) {
      wrapped[prop] = value;
      continue;
    }

    // Wrap transition function
    wrapped[prop] = createTransitionWrapper(
      prop,
      value,
      machine,
      hooks,
      mode
    );
  }

  return wrapped as M;
}

/**
 * Creates a wrapped transition function with middleware hooks.
 * Extracted as a separate function for clarity and reusability.
 *
 * @internal
 */
function createTransitionWrapper<M extends BaseMachine<any>>(
  transitionName: string,
  originalFn: Function,
  machine: M,
  hooks: MiddlewareHooks<Context<M>>,
  mode: 'sync' | 'async' | 'auto'
): Function {
  return function wrappedTransition(this: any, ...args: any[]) {
    // Get current context (might be different from initial if machine changed)
    const context = machine.context;

    const middlewareCtx: MiddlewareContext<Context<M>> = {
      transitionName,
      context,
      args
    };

    // Helper for sync execution
    const executeSyncTransition = () => {
      try {
        // Call before hook (must be sync or throw)
        if (hooks.before) {
          const beforeResult = hooks.before(middlewareCtx);
          // Check for cancellation
          if (beforeResult === CANCEL) {
            return machine; // Return current machine unchanged
          }
          // If before hook returns a promise in sync mode, throw
          if (beforeResult instanceof Promise) {
            throw new Error(
              `Middleware mode is 'sync' but before hook returned Promise for transition: ${transitionName}`
            );
          }
        }

        // Execute the actual transition
        const result = originalFn.call(this, ...args);

        // If result is async, switch to async handling
        if (result instanceof Promise) {
          return handleAsyncResult(result, context);
        }

        // Call after hook (must be sync or throw)
        if (hooks.after) {
          const middlewareResult: MiddlewareResult<Context<M>> = {
            transitionName,
            prevContext: context,
            nextContext: result.context,
            args
          };
          const afterResult = hooks.after(middlewareResult);
          if (afterResult instanceof Promise) {
            throw new Error(
              `Middleware mode is 'sync' but after hook returned Promise for transition: ${transitionName}`
            );
          }
        }

        return result;
      } catch (err) {
        // Call error hook and check for fallback state
        if (hooks.error) {
          const middlewareError: MiddlewareError<Context<M>> = {
            transitionName,
            context,
            args,
            error: err as Error
          };
          const errorResult = hooks.error(middlewareError);

          // Handle async error hook in sync mode
          if (errorResult instanceof Promise) {
            // Fire-and-forget for async error hooks in sync mode
            errorResult.catch(() => {});
            throw err; // Re-throw original error
          }

          // Check if error hook returned a fallback machine
          if (errorResult && typeof errorResult === 'object' && 'context' in errorResult) {
            return errorResult as M; // Return fallback state
          }
        }

        // Re-throw the error
        throw err;
      }
    };

    // Helper for handling async transition results
    const handleAsyncResult = async (resultPromise: Promise<any>, ctx: any) => {
      try {
        const result = await resultPromise;

        // Call after hook
        if (hooks.after) {
          const middlewareResult: MiddlewareResult<Context<M>> = {
            transitionName,
            prevContext: ctx,
            nextContext: result.context,
            args
          };
          await hooks.after(middlewareResult);
        }

        return result;
      } catch (err) {
        // Call error hook and check for fallback state
        if (hooks.error) {
          const middlewareError: MiddlewareError<Context<M>> = {
            transitionName,
            context: ctx,
            args,
            error: err as Error
          };
          const errorResult = await hooks.error(middlewareError);

          // Check if error hook returned a fallback machine
          if (errorResult && typeof errorResult === 'object' && 'context' in errorResult) {
            return errorResult as M; // Return fallback state
          }
        }

        // Re-throw the error
        throw err;
      }
    };

    // Helper for fully async execution
    const executeAsyncTransition = async () => {
      try {
        // Call before hook
        if (hooks.before) {
          const beforeResult = await hooks.before(middlewareCtx);
          // Check for cancellation
          if (beforeResult === CANCEL) {
            return machine; // Return current machine unchanged
          }
        }

        // Execute the actual transition
        const result = await originalFn.call(this, ...args);

        // Call after hook
        if (hooks.after) {
          const middlewareResult: MiddlewareResult<Context<M>> = {
            transitionName,
            prevContext: context,
            nextContext: result.context,
            args
          };
          await hooks.after(middlewareResult);
        }

        return result;
      } catch (err) {
        // Call error hook and check for fallback state
        if (hooks.error) {
          const middlewareError: MiddlewareError<Context<M>> = {
            transitionName,
            context,
            args,
            error: err as Error
          };
          const errorResult = await hooks.error(middlewareError);

          // Check if error hook returned a fallback machine
          if (errorResult && typeof errorResult === 'object' && 'context' in errorResult) {
            return errorResult as M; // Return fallback state
          }
        }

        // Re-throw the error
        throw err;
      }
    };

    // Choose execution mode
    if (mode === 'async') {
      // Force async execution
      return executeAsyncTransition();
    } else if (mode === 'sync') {
      // Force sync execution
      return executeSyncTransition();
    } else {
      // Auto mode (adaptive): Starts synchronously for zero overhead,
      // but automatically switches to async if the transition returns a Promise.
      // This provides optimal performance for sync transitions while
      // seamlessly handling async ones when they occur.
      return executeSyncTransition();
    }
  };
}

// =============================================================================
// SECTION: COMPOSABLE MIDDLEWARE HELPERS
// =============================================================================

/**
 * Logging middleware that logs transition calls and results to console.
 * Useful for debugging and development.
 *
 * @template M - The machine type
 * @param machine - The machine to add logging to
 * @param options - Optional configuration for logging format
 * @returns A new machine with logging middleware
 *
 * @example
 * const logged = withLogging(counter);
 * logged.increment(); // Console: "→ increment []" then "✓ increment { count: 1 }"
 */
export function withLogging<M extends BaseMachine<any>>(
  machine: M,
  options: {
    /** Custom logger function (default: console.log) */
    logger?: (message: string, ...args: any[]) => void;
    /** Include context in logs (default: true) */
    includeContext?: boolean;
    /** Include arguments in logs (default: true) */
    includeArgs?: boolean;
  } = {}
): M {
  const {
    logger = console.log,
    includeContext = true,
    includeArgs = true
  } = options;

  return createMiddleware(machine, {
    before: ({ transitionName, args }) => {
      const argsStr = includeArgs && args.length > 0 ? ` ${JSON.stringify(args)}` : '';
      logger(`→ ${transitionName}${argsStr}`);
    },
    after: ({ transitionName, nextContext }) => {
      const contextStr = includeContext ? ` ${JSON.stringify(nextContext)}` : '';
      logger(`✓ ${transitionName}${contextStr}`);
    }
  });
}

/**
 * Analytics middleware that tracks state transitions.
 * Compatible with any analytics service (Segment, Mixpanel, GA, etc.).
 *
 * @template M - The machine type
 * @param machine - The machine to track
 * @param track - Analytics tracking function
 * @param options - Optional configuration for event naming
 * @returns A new machine with analytics middleware
 *
 * @example
 * const tracked = withAnalytics(machine, (event, props) => {
 *   analytics.track(event, props);
 * });
 */
export function withAnalytics<M extends BaseMachine<any>>(
  machine: M,
  track: (event: string, properties: Record<string, any>) => void | Promise<void>,
  options: {
    /** Prefix for event names (default: "state_transition") */
    eventPrefix?: string;
    /** Include previous context in properties (default: false) */
    includePrevContext?: boolean;
    /** Include arguments in properties (default: true) */
    includeArgs?: boolean;
  } = {}
): M {
  const {
    eventPrefix = 'state_transition',
    includePrevContext = false,
    includeArgs = true
  } = options;

  return createMiddleware(machine, {
    after: async ({ transitionName, prevContext, nextContext, args }) => {
      const properties: Record<string, any> = {
        transition: transitionName,
        to: nextContext
      };

      if (includePrevContext) {
        properties.from = prevContext;
      }

      if (includeArgs && args.length > 0) {
        properties.args = args;
      }

      await track(`${eventPrefix}.${transitionName}`, properties);
    }
  }, { mode: 'async' });
}

/**
 * Validation middleware that validates transitions before they execute.
 * Throws an error if validation fails, preventing the transition.
 *
 * @template M - The machine type
 * @param machine - The machine to validate
 * @param validate - Validation function that throws or returns false on invalid transitions
 * @returns A new machine with validation middleware
 *
 * @example
 * const validated = withValidation(counter, ({ transitionName, context, args }) => {
 *   if (transitionName === 'decrement' && context.count === 0) {
 *     throw new Error('Cannot decrement below zero');
 *   }
 * });
 */
export function withValidation<M extends BaseMachine<any>>(
  machine: M,
  validate: (ctx: MiddlewareContext<Context<M>>) => void | boolean | Promise<void | boolean>,
  options?: Pick<MiddlewareOptions, 'mode'>
): M {
  return createMiddleware(machine, {
    before: (ctx) => {
      const result = validate(ctx);
      if (result instanceof Promise) {
        return result.then(r => {
          if (r === false) {
            throw new Error(`Validation failed for transition: ${ctx.transitionName}`);
          }
          return undefined;
        });
      }
      if (result === false) {
        throw new Error(`Validation failed for transition: ${ctx.transitionName}`);
      }
      return undefined;
    }
  }, { mode: 'auto', ...options });
}

/**
 * Permission/authorization middleware that checks if a transition is allowed.
 * Useful for implementing role-based access control (RBAC) in state machines.
 *
 * @template M - The machine type
 * @param machine - The machine to protect
 * @param canPerform - Function that checks if the transition is allowed
 * @returns A new machine with permission checks
 *
 * @example
 * const protected = withPermissions(machine, (user) => ({ transitionName }) => {
 *   if (transitionName === 'delete' && user.role !== 'admin') {
 *     return false;
 *   }
 *   return true;
 * });
 */
export function withPermissions<M extends BaseMachine<any>>(
  machine: M,
  canPerform: (ctx: MiddlewareContext<Context<M>>) => boolean | Promise<boolean>,
  options?: Pick<MiddlewareOptions, 'mode'>
): M {
  return createMiddleware(machine, {
    before: (ctx) => {
      const result = canPerform(ctx);
      if (result instanceof Promise) {
        return result.then(allowed => {
          if (!allowed) {
            throw new Error(`Unauthorized transition: ${ctx.transitionName}`);
          }
          return undefined;
        });
      }
      if (!result) {
        throw new Error(`Unauthorized transition: ${ctx.transitionName}`);
      }
      return undefined;
    }
  }, { mode: 'auto', ...options });
}

/**
 * Error reporting middleware that sends errors to an error tracking service.
 * Compatible with Sentry, Bugsnag, Rollbar, etc.
 *
 * @template M - The machine type
 * @param machine - The machine to monitor
 * @param captureError - Error capture function (e.g., Sentry.captureException)
 * @param options - Optional configuration for error context
 * @returns A new machine with error reporting
 *
 * @example
 * const monitored = withErrorReporting(machine, (error, context) => {
 *   Sentry.captureException(error, { extra: context });
 * });
 */
export function withErrorReporting<M extends BaseMachine<any>>(
  machine: M,
  captureError: (error: Error, context: Record<string, any>) => void | Promise<void>,
  options: {
    /** Include machine context in error report (default: true) */
    includeContext?: boolean;
    /** Include arguments in error report (default: true) */
    includeArgs?: boolean;
    /** Middleware execution mode */
    mode?: MiddlewareOptions['mode'];
  } = {}
): M {
  const { includeContext = true, includeArgs = true, mode } = options;

  return createMiddleware(machine, {
    error: async ({ transitionName, context, args, error }) => {
      const errorContext: Record<string, any> = {
        transition: transitionName
      };

      if (includeContext) {
        errorContext.context = context;
      }

      if (includeArgs && args.length > 0) {
        errorContext.args = args;
      }

      await Promise.resolve(captureError(error, errorContext));
    }
  }, { mode });
}

/**
 * Performance monitoring middleware that tracks transition execution time.
 * Useful for identifying slow transitions and performance bottlenecks.
 *
 * @template M - The machine type
 * @param machine - The machine to monitor
 * @param onMetric - Callback to receive performance metrics
 * @returns A new machine with performance monitoring
 *
 * @example
 * const monitored = withPerformanceMonitoring(machine, ({ transition, duration }) => {
 *   if (duration > 100) {
 *     console.warn(`Slow transition: ${transition} took ${duration}ms`);
 *   }
 * });
 */
export function withPerformanceMonitoring<M extends BaseMachine<any>>(
  machine: M,
  onMetric: (metric: {
    transitionName: string;
    duration: number;
    context: Readonly<Context<M>>;
  }) => void | Promise<void>
): M {
  const timings = new Map<string, number>();

  return createMiddleware(machine, {
    before: ({ transitionName }) => {
      timings.set(transitionName, performance.now());
      return undefined;
    },
    after: ({ transitionName, nextContext }) => {
      const startTime = timings.get(transitionName);
      if (startTime) {
        const duration = performance.now() - startTime;
        timings.delete(transitionName);
        const result = onMetric({ transitionName, duration, context: nextContext });
        if (result instanceof Promise) {
          return result;
        }
      }
      return undefined;
    }
  }, { mode: 'auto' });
}

/**
 * Retry middleware that automatically retries failed transitions.
 * Uses direct property wrapping for optimal performance.
 * Useful for handling transient failures in async operations.
 *
 * @template M - The machine type
 * @param machine - The machine to add retry logic to
 * @param options - Retry configuration
 * @returns A new machine with retry logic
 *
 * @example
 * const resilient = withRetry(machine, {
 *   maxRetries: 3,
 *   delay: 1000,
 *   shouldRetry: (error) => error.message.includes('network')
 * });
 */
export function withRetry<M extends BaseMachine<any>>(
  machine: M,
  options: {
    /** Maximum number of retry attempts (default: 3) */
    maxRetries?: number;
    /** Delay between retries in milliseconds (default: 1000) */
    delay?: number;
    /** Exponential backoff multiplier (default: 1, no backoff) */
    backoffMultiplier?: number;
    /** Function to determine if error should trigger retry (default: always retry) */
    shouldRetry?: (error: Error) => boolean;
    /** Callback when retry occurs */
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): M {
  const {
    maxRetries = 3,
    delay = 1000,
    backoffMultiplier = 1,
    shouldRetry = () => true,
    onRetry
  } = options;

  // Build wrapped machine object with direct property iteration
  const wrapped: any = {};

  for (const prop in machine) {
    if (!Object.prototype.hasOwnProperty.call(machine, prop)) continue;

    const value = machine[prop];

    // Skip context and non-functions
    if (prop === 'context' || typeof value !== 'function') {
      wrapped[prop] = value;
      continue;
    }

    // Wrap with retry logic
    wrapped[prop] = async function retriableTransition(this: any, ...args: any[]) {
      let lastError: Error | undefined;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await value.call(this, ...args);
        } catch (error) {
          lastError = error as Error;

          // Don't retry if we've exhausted attempts
          if (attempt === maxRetries) {
            break;
          }

          // Don't retry if shouldRetry returns false
          if (!shouldRetry(lastError)) {
            break;
          }

          // Call onRetry callback
          onRetry?.(attempt + 1, lastError);

          // Wait before retrying
          const currentDelay = delay * Math.pow(backoffMultiplier, attempt);
          await new Promise(resolve => setTimeout(resolve, currentDelay));
        }
      }

      // All retries exhausted, throw the last error
      throw lastError;
    };
  }

  return wrapped as M;
}

/**
 * Guard configuration for a single transition.
 */
export interface GuardConfig<C extends object> {
  /** Guard predicate function that returns true if transition is allowed */
  guard: (ctx: MiddlewareContext<C>, ...args: any[]) => boolean | Promise<boolean>;
  /**
   * Action to take when guard fails.
   * - 'throw': Throw an error (default)
   * - 'ignore': Silently cancel the transition
   *
   * Note: For custom fallback machines, use the error hook in createMiddleware:
   * @example
   * createMiddleware(machine, {
   *   error: ({ error, context }) => {
   *     if (error.message.includes('Guard failed')) {
   *       return createMachine({ ...context, error: 'Unauthorized' }, machine);
   *     }
   *   }
   * });
   */
  onFail?: 'throw' | 'ignore';
}

/**
 * Guard middleware that prevents transitions based on predicate functions.
 * Implements fundamental FSM guard concept - transitions only occur when guards pass.
 *
 * @template M - The machine type
 * @param machine - The machine to protect with guards
 * @param guards - Object mapping transition names to guard configurations
 * @returns A new machine with guard checks
 *
 * @example
 * const guarded = withGuards(counter, {
 *   decrement: {
 *     guard: ({ context }) => context.count > 0,
 *     onFail: 'throw' // or 'ignore'
 *   },
 *   delete: {
 *     guard: ({ context }) => context.user?.isAdmin === true,
 *     onFail: 'throw'
 *   }
 * });
 *
 * guarded.decrement(); // Throws if count === 0
 *
 * // For custom fallback machines, combine with error middleware:
 * const guardedWithFallback = createMiddleware(guarded, {
 *   error: ({ error, context }) => {
 *     if (error.message.includes('Guard failed')) {
 *       return createMachine({ ...context, error: 'Unauthorized' }, machine);
 *     }
 *   }
 * });
 */
export function withGuards<M extends BaseMachine<any>>(
  machine: M,
  guards: Record<string, GuardConfig<Context<M>> | ((ctx: MiddlewareContext<Context<M>>, ...args: any[]) => boolean | Promise<boolean>)>,
  options?: Pick<MiddlewareOptions, 'mode'>
): M {
  return createMiddleware(machine, {
    before: async (ctx) => {
      const guardConfig = guards[ctx.transitionName];
      if (!guardConfig) {
        return undefined; // No guard for this transition
      }

      // Handle shorthand: function directly instead of config object
      const guard = typeof guardConfig === 'function' ? guardConfig : guardConfig.guard;
      const onFail = typeof guardConfig === 'object' ? guardConfig.onFail : 'throw';

      // Evaluate guard
      const allowed = await Promise.resolve(guard(ctx, ...ctx.args));

      if (!allowed) {
        if (onFail === 'ignore') {
          return CANCEL; // Silently cancel transition
        } else {
          // Default to 'throw'
          throw new Error(`Guard failed for transition: ${ctx.transitionName}`);
        }
      }
      return undefined;
    }
  }, { mode: 'async', ...options });
}

/**
 * Creates conditional middleware that only applies to specific transitions.
 * Useful for targeted instrumentation without affecting all transitions.
 *
 * @template M - The machine type
 * @param machine - The machine to instrument
 * @param config - Configuration specifying which transitions to instrument
 * @returns A new machine with conditional middleware
 *
 * @example
 * const conditional = createConditionalMiddleware(counter, {
 *   only: ['delete', 'update'], // Only these transitions
 *   hooks: {
 *     before: ({ transitionName }) => console.log('Sensitive operation:', transitionName),
 *     after: ({ transitionName }) => auditLog(transitionName)
 *   }
 * });
 *
 * @example
 * const excluding = createConditionalMiddleware(counter, {
 *   except: ['increment'], // All except these
 *   hooks: {
 *     before: ({ transitionName, args }) => validate(transitionName, args)
 *   }
 * });
 */
export function createConditionalMiddleware<M extends BaseMachine<any>>(
  machine: M,
  config: {
    /** Only apply to these transitions (mutually exclusive with except) */
    only?: string[];
    /** Apply to all except these transitions (mutually exclusive with only) */
    except?: string[];
    /** Middleware hooks to apply */
    hooks: MiddlewareHooks<Context<M>>;
    /** Middleware options */
    options?: MiddlewareOptions;
  }
): M {
  const { only, except, hooks, options } = config;

  if (only && except) {
    throw new Error('Cannot specify both "only" and "except" - choose one');
  }

  // Create filter function
  const shouldApply = (transitionName: string): boolean => {
    if (only) {
      return only.includes(transitionName);
    }
    if (except) {
      return !except.includes(transitionName);
    }
    return true;
  };

  // Wrap hooks to check filter
  const conditionalHooks: MiddlewareHooks<Context<M>> = {
    before: hooks.before
      ? async (ctx) => {
          if (shouldApply(ctx.transitionName)) {
            return await hooks.before!(ctx);
          }
        }
      : undefined,
    after: hooks.after
      ? async (result) => {
          if (shouldApply(result.transitionName)) {
            return await hooks.after!(result);
          }
        }
      : undefined,
    error: hooks.error
      ? async (error) => {
          if (shouldApply(error.transitionName)) {
            return await hooks.error!(error);
          }
        }
      : undefined
  };

  return createMiddleware(machine, conditionalHooks, options);
}

/**
 * Creates state-dependent middleware that only applies when a predicate is true.
 * Allows middleware behavior to change based on current context/state.
 *
 * @template M - The machine type
 * @param machine - The machine to instrument
 * @param config - Configuration with predicate and hooks
 * @returns A new machine with state-dependent middleware
 *
 * @example
 * const stateful = createStateMiddleware(counter, {
 *   when: (ctx) => ctx.debugMode === true,
 *   hooks: {
 *     before: (ctx) => console.log('Debug:', ctx),
 *     after: (result) => console.log('Debug result:', result)
 *   }
 * });
 *
 * // Logging only happens when context.debugMode === true
 */
export function createStateMiddleware<M extends BaseMachine<any>>(
  machine: M,
  config: {
    /** Predicate that determines if middleware should apply */
    when: (ctx: Context<M>) => boolean | Promise<boolean>;
    /** Middleware hooks to apply when predicate is true */
    hooks: MiddlewareHooks<Context<M>>;
    /** Middleware options */
    options?: MiddlewareOptions;
  }
): M {
  const { when, hooks, options } = config;

  // Wrap hooks to check predicate
  const conditionalHooks: MiddlewareHooks<Context<M>> = {
    before: hooks.before
      ? async (ctx) => {
          if (await Promise.resolve(when(ctx.context))) {
            return await hooks.before!(ctx);
          }
        }
      : undefined,
    after: hooks.after
      ? async (result) => {
          if (await Promise.resolve(when(result.prevContext))) {
            return await hooks.after!(result);
          }
        }
      : undefined,
    error: hooks.error
      ? async (error) => {
          if (await Promise.resolve(when(error.context))) {
            return await hooks.error!(error);
          }
        }
      : undefined
  };

  return createMiddleware(machine, conditionalHooks, options);
}

// =============================================================================
// SECTION: HISTORY AND SNAPSHOT TRACKING
// =============================================================================

/**
 * Represents a recorded transition call in the history.
 */
export interface HistoryEntry {
  /** Unique ID for this history entry */
  id: string;
  /** The transition that was called */
  transitionName: string;
  /** Arguments passed to the transition */
  args: any[];
  /** Timestamp when the transition was called */
  timestamp: number;
  /** Optional serialized version of args (if serializer provided) */
  serializedArgs?: string;
}

/**
 * Generic serializer/deserializer interface.
 * Used for serializing history arguments, context snapshots, etc.
 * @template T - The type being serialized
 */
export interface Serializer<T = any> {
  /** Serialize data to a string */
  serialize: (data: T) => string;
  /** Deserialize string back to data */
  deserialize: (serialized: string) => T;
}

/**
 * History tracking middleware that records all transition calls.
 * Useful for debugging, replay, undo/redo, and audit logging.
 *
 * @template M - The machine type
 * @param machine - The machine to track
 * @param options - Configuration options
 * @returns A new machine with history tracking and a history array
 *
 * Note: Arguments are shallow-cloned by default. If you need deep cloning or
 * serialization for persistence, provide a serializer:
 *
 * @example
 * const tracked = withHistory(counter, {
 *   maxSize: 100,
 *   serializer: {
 *     serialize: (args) => JSON.stringify(args),  // For deep clone or persistence
 *     deserialize: (str) => JSON.parse(str)
 *   }
 * });
 *
 * tracked.increment();
 * tracked.add(5);
 * console.log(tracked.history); // [{ transitionName: 'increment', args: [], ... }, ...]
 * tracked.clearHistory(); // Clear history
 */
export function withHistory<M extends BaseMachine<any>>(
  machine: M,
  options: {
    /** Maximum number of entries to keep (default: unlimited) */
    maxSize?: number;
    /** Optional serializer for arguments */
    serializer?: Serializer<any[]>;
    /** Filter function to exclude certain transitions from history */
    filter?: (transitionName: string, args: any[]) => boolean;
    /** Callback when new entry is added */
    onEntry?: (entry: HistoryEntry) => void;
    /** Internal flag to prevent rewrapping */
    _isRewrap?: boolean;
  } = {}
): WithHistory<M> {
  const {
    maxSize,
    serializer,
    filter,
    onEntry,
    _isRewrap = false
  } = options;

  const history: HistoryEntry[] = [];
  let entryId = 0;

  const instrumentedMachine = createMiddleware(machine, {
    before: ({ transitionName, args }) => {
      // Check filter
      if (filter && !filter(transitionName, args)) {
        return;
      }

      // Create entry
      const entry: HistoryEntry = {
        id: `entry-${entryId++}`,
        transitionName,
        args: [...args], // Shallow clone args (fast, works with any type)
        timestamp: Date.now()
      };

      // Serialize if serializer provided
      if (serializer) {
        try {
          entry.serializedArgs = serializer.serialize(args);
        } catch (err) {
          console.error('Failed to serialize history args:', err);
        }
      }

      // Add to history
      history.push(entry);

      // Enforce max size
      if (maxSize && history.length > maxSize) {
        history.shift();
      }

      // Call callback
      onEntry?.(entry);
    }
  }, { exclude: ['context', 'history', 'clearHistory'] });

  // Override transitions to propagate history to returned machines
  if (!_isRewrap) {
    for (const prop in instrumentedMachine) {
      if (!Object.prototype.hasOwnProperty.call(instrumentedMachine, prop)) continue;
      const value = instrumentedMachine[prop];
      if (typeof value === 'function' && !prop.startsWith('_') && prop !== 'context' && !['history', 'clearHistory'].includes(prop)) {
        const originalFn = value;
        (instrumentedMachine as any)[prop] = function(this: any, ...args: any[]) {
          const result = originalFn.apply(this, args);
          // If result is a machine, re-wrap it with history tracking using the shared history array
          if (result && typeof result === 'object' && 'context' in result && !('history' in result)) {
            // Create a new wrapped machine that shares the same history array
            const rewrappedResult = createMiddleware(result, {
              before: ({ transitionName, args: transArgs }) => {
                // Check filter
                if (filter && !filter(transitionName, transArgs)) {
                  return;
                }

                // Create entry
                const entry: HistoryEntry = {
                  id: `entry-${entryId++}`,
                  transitionName,
                  args: [...transArgs],
                  timestamp: Date.now()
                };

                // Serialize if serializer provided
                if (serializer) {
                  try {
                    entry.serializedArgs = serializer.serialize(transArgs);
                  } catch (err) {
                    console.error('Failed to serialize history args:', err);
                  }
                }

                // Add to history
                history.push(entry);

                // Enforce max size
                if (maxSize && history.length > maxSize) {
                  history.shift();
                }

                // Call callback
                onEntry?.(entry);
              }
            }, { exclude: ['context', 'history', 'clearHistory'] });

            // Attach the shared history
            return Object.assign(rewrappedResult, {
              history,
              clearHistory: () => {
                history.length = 0;
                entryId = 0;
              }
            });
          }
          return result;
        };
      }
    }
  }

  // Attach history tracking properties to the instrumented machine
  return Object.assign(instrumentedMachine, {
    history,
    clearHistory: () => {
      history.length = 0;
      entryId = 0;
    }
  });
}

/**
 * Represents a snapshot of context at a point in time.
 * @template C - The context type
 */
export interface ContextSnapshot<C extends object = any> {
  /** Unique ID for this snapshot */
  id: string;
  /** The transition that caused this change */
  transitionName: string;
  /** Context before the transition */
  before: C;
  /** Context after the transition */
  after: C;
  /** Timestamp of the snapshot */
  timestamp: number;
  /** Optional serialized version of contexts */
  serializedBefore?: string;
  serializedAfter?: string;
  /** Optional diff information */
  diff?: any;
}

/**
 * Snapshot middleware that records context before/after each transition.
 * Useful for time-travel debugging, undo/redo, and state inspection.
 *
 * @template M - The machine type
 * @param machine - The machine to track
 * @param options - Configuration options
 * @returns A new machine with snapshot tracking and snapshots array
 *
 * @example
 * const tracked = withSnapshot(counter, {
 *   maxSize: 50,
 *   serializer: {
 *     serialize: (ctx) => JSON.stringify(ctx),
 *     deserialize: (str) => JSON.parse(str)
 *   },
 *   captureSnapshot: (before, after) => ({
 *     changed: before.count !== after.count
 *   })
 * });
 *
 * tracked.increment();
 * console.log(tracked.snapshots); // [{ before: { count: 0 }, after: { count: 1 }, ... }]
 *
 * // Time-travel: restore to previous state
 * const previousState = tracked.restoreSnapshot(tracked.snapshots[0].before);
 */
export function withSnapshot<M extends BaseMachine<any>>(
  machine: M,
  options: {
    /** Maximum number of snapshots to keep (default: unlimited) */
    maxSize?: number;
    /** Optional serializer for context */
    serializer?: Serializer<Context<M>>;
    /** Custom function to capture additional snapshot data */
    captureSnapshot?: (before: Context<M>, after: Context<M>) => any;
    /** Only capture snapshots where context actually changed */
    onlyIfChanged?: boolean;
    /** Filter function to exclude certain transitions from snapshots */
    filter?: (transitionName: string) => boolean;
    /** Callback when new snapshot is taken */
    onSnapshot?: (snapshot: ContextSnapshot<Context<M>>) => void;
    /** Additional properties to exclude from middleware (for composition) */
    _extraExclusions?: string[];
    /** Internal flag to prevent rewrapping */
    _isRewrap?: boolean;
  } = {}
): WithSnapshot<M, Context<M>> {
  const {
    maxSize,
    serializer,
    captureSnapshot,
    onlyIfChanged = false,
    filter,
    onSnapshot,
    _extraExclusions = [],
    _isRewrap = false
  } = options;

  const snapshots: ContextSnapshot<Context<M>>[] = [];
  let snapshotId = 0;

  const instrumentedMachine = createMiddleware(machine, {
    after: ({ transitionName, prevContext, nextContext }) => {
      // Check filter
      if (filter && !filter(transitionName)) {
        return;
      }

      // Check if changed (if required)
      if (onlyIfChanged) {
        const changed = JSON.stringify(prevContext) !== JSON.stringify(nextContext);
        if (!changed) {
          return;
        }
      }

      // Create snapshot
      const snapshot: ContextSnapshot<Context<M>> = {
        id: `snapshot-${snapshotId++}`,
        transitionName,
        before: { ...prevContext as Context<M> }, // Clone
        after: { ...nextContext as Context<M> }, // Clone
        timestamp: Date.now()
      };

      // Serialize if serializer provided
      if (serializer) {
        try {
          snapshot.serializedBefore = serializer.serialize(prevContext as Context<M>);
          snapshot.serializedAfter = serializer.serialize(nextContext as Context<M>);
        } catch (err) {
          console.error('Failed to serialize snapshot:', err);
        }
      }

      // Capture custom snapshot data
      if (captureSnapshot) {
        try {
          snapshot.diff = captureSnapshot(prevContext as Context<M>, nextContext as Context<M>);
        } catch (err) {
          console.error('Failed to capture snapshot:', err);
        }
      }

      // Add to snapshots
      snapshots.push(snapshot);

      // Enforce max size
      if (maxSize && snapshots.length > maxSize) {
        snapshots.shift();
      }

      // Call callback
      onSnapshot?.(snapshot);
    }
  }, { exclude: ['context', 'snapshots', 'clearSnapshots', 'restoreSnapshot', ..._extraExclusions] });

  // Helper to restore machine to a previous context
  const restoreSnapshot = (context: Context<M>): M => {
    const { context: _, ...transitions } = machine;
    return { context, ...transitions } as M;
  };

  // Override transitions to propagate snapshots and history to returned machines
  if (!_isRewrap) {
    for (const prop in instrumentedMachine) {
      if (!Object.prototype.hasOwnProperty.call(instrumentedMachine, prop)) continue;
      const value = instrumentedMachine[prop];
      if (typeof value === 'function' && !prop.startsWith('_') && prop !== 'context' && !['snapshots', 'clearSnapshots', 'restoreSnapshot', 'history', 'clearHistory'].includes(prop)) {
        const originalWrappedFn = value;
        (instrumentedMachine as any)[prop] = function(this: any, ...args: any[]) {
          const result = originalWrappedFn.apply(this, args);
          // If result is a machine, re-wrap it with snapshot tracking using the shared snapshots array
          if (result && typeof result === 'object' && 'context' in result && !('snapshots' in result)) {
            // Manually handle snapshot tracking without calling createMiddleware again
            // to avoid infinite recursion and complex wrapping issues
            
            // Create a proxy that intercepts transition calls to record snapshots
            
            // Wrap each transition to record snapshots
            for (const transProp in result) {
              if (!Object.prototype.hasOwnProperty.call(result, transProp)) continue;
              const transValue = result[transProp];
              if (typeof transValue === 'function' && !transProp.startsWith('_') && transProp !== 'context' && !['snapshots', 'clearSnapshots', 'restoreSnapshot', 'history', 'clearHistory'].includes(transProp)) {
                const origTransFn = transValue;
                (result as any)[transProp] = function(this: any, ...transArgs: any[]) {
                  const prevCtx = result.context;
                  const transResult = origTransFn.apply(this, transArgs);
                  
                  // Record snapshot if we got a machine back
                  if (transResult && typeof transResult === 'object' && 'context' in transResult) {
                    const nextCtx = transResult.context;
                    
                    // Check filter
                    if (!(filter && !filter(transProp))) {
                      // Check if changed (if required)
                      let shouldRecord = true;
                      if (onlyIfChanged) {
                        const changed = JSON.stringify(prevCtx) !== JSON.stringify(nextCtx);
                        shouldRecord = changed;
                      }
                      
                      if (shouldRecord) {
                        // Create snapshot
                        const snapshot: ContextSnapshot<Context<M>> = {
                          id: `snapshot-${snapshotId++}`,
                          transitionName: transProp,
                          before: { ...prevCtx as Context<M> },
                          after: { ...nextCtx as Context<M> },
                          timestamp: Date.now()
                        };

                        // Serialize if serializer provided
                        if (serializer) {
                          try {
                            snapshot.serializedBefore = serializer.serialize(prevCtx as Context<M>);
                            snapshot.serializedAfter = serializer.serialize(nextCtx as Context<M>);
                          } catch (err) {
                            console.error('Failed to serialize snapshot:', err);
                          }
                        }

                        // Capture custom snapshot data
                        if (captureSnapshot) {
                          try {
                            snapshot.diff = captureSnapshot(prevCtx as Context<M>, nextCtx as Context<M>);
                          } catch (err) {
                            console.error('Failed to capture snapshot:', err);
                          }
                        }

                        // Add to snapshots
                        snapshots.push(snapshot);

                        // Enforce max size
                        if (maxSize && snapshots.length > maxSize) {
                          snapshots.shift();
                        }

                        // Call callback
                        onSnapshot?.(snapshot);
                      }
                    }
                  }
                  
                  return transResult;
                };
              }
            }
            
            // Attach the shared snapshots and history
            const resultWithTracking = Object.assign(result, {
              snapshots,
              clearSnapshots: () => {
                snapshots.length = 0;
                snapshotId = 0;
              },
              restoreSnapshot
            });

            // Also propagate history if it exists on the input machine
            if ((machine as any).history) {
              resultWithTracking.history = (machine as any).history;
              resultWithTracking.clearHistory = (machine as any).clearHistory;
            }

            return resultWithTracking;
          }
          return result;
        };
      }
    }
  }

  // Attach snapshot tracking properties to the instrumented machine
  return Object.assign(instrumentedMachine, {
    snapshots,
    clearSnapshots: () => {
      snapshots.length = 0;
      snapshotId = 0;
    },
    restoreSnapshot
  });
}

/**
 * Combined history and snapshot middleware for full time-travel debugging.
 * Records both transition calls and context changes.
 *
 * @template M - The machine type
 * @param machine - The machine to track
 * @param options - Configuration options
 * @returns Machine with both history and snapshot tracking
 *
 * @example
 * const tracker = withTimeTravel(counter, {
 *   maxSize: 100,
 *   serializer: {
 *     serialize: (data) => JSON.stringify(data),
 *     deserialize: (str) => JSON.parse(str)
 *   }
 * });
 *
 * tracker.increment();
 * tracker.add(5);
 *
 * console.log(tracker.history); // All transitions
 * console.log(tracker.snapshots); // All state changes
 *
 * // Replay from a specific snapshot
 * const replayed = tracker.replayFrom(0);
 *
 * // Restore to specific snapshot
 * const restored = tracker.restoreSnapshot(tracker.snapshots[0].before);
 *
 * // Clear all tracking data
 * tracker.clearTimeTravel();
 */
export function withTimeTravel<M extends BaseMachine<any>>(
  machine: M,
  options: {
    /** Maximum size for both history and snapshots */
    maxSize?: number;
    /** Serializer for both args and context */
    serializer?: Serializer<any>;
    /** Callback for each recorded action */
    onRecord?: (type: 'history' | 'snapshot', data: any) => void;
  } = {}
): WithTimeTravel<M, Context<M>> {
  const { maxSize, serializer, onRecord } = options;

  const history: HistoryEntry[] = [];
  const snapshots: ContextSnapshot<Context<M>>[] = [];
  let entryId = 0;
  let snapshotId = 0;

  // Middleware hooks that record to shared arrays
  const recordHistory = (transitionName: string, args: any[]) => {
    const entry: HistoryEntry = {
      id: `entry-${entryId++}`,
      transitionName,
      args: [...args],
      timestamp: Date.now()
    };

    if (serializer) {
      try {
        entry.serializedArgs = serializer.serialize(args);
      } catch (err) {
        console.error('Failed to serialize history args:', err);
      }
    }

    history.push(entry);
    if (maxSize && history.length > maxSize) {
      history.shift();
    }

    onRecord?.('history', entry);
  };

  const recordSnapshot = (transitionName: string, prevContext: Context<M>, nextContext: Context<M>) => {
    const snapshot: ContextSnapshot<Context<M>> = {
      id: `snapshot-${snapshotId++}`,
      transitionName,
      before: { ...prevContext },
      after: { ...nextContext },
      timestamp: Date.now()
    };

    if (serializer) {
      try {
        snapshot.serializedBefore = serializer.serialize(prevContext);
        snapshot.serializedAfter = serializer.serialize(nextContext);
      } catch (err) {
        console.error('Failed to serialize snapshot:', err);
      }
    }

    snapshots.push(snapshot);
    if (maxSize && snapshots.length > maxSize) {
      snapshots.shift();
    }

    onRecord?.('snapshot', snapshot);
  };

  // Helper to restore machine to a previous context
  const restoreSnapshot = (context: Context<M>): M => {
    const { context: _, ...transitions } = machine;
    return Object.assign({ context }, context, transitions) as M;
  };

  // Implementation of replay functionality
  const replayFrom = (snapshotIndex: number = 0): M => {
    if (snapshotIndex < 0 || snapshotIndex >= snapshots.length) {
      throw new Error(`Invalid snapshot index: ${snapshotIndex}`);
    }

    let current = restoreSnapshot(snapshots[snapshotIndex].before);

    // Find the history index that corresponds to this snapshot
    const snapshot = snapshots[snapshotIndex];
    const historyStartIndex = history.findIndex(
      entry => entry.transitionName === snapshot.transitionName && entry.timestamp === snapshot.timestamp
    );

    if (historyStartIndex === -1) {
      throw new Error('Could not find matching history entry for snapshot');
    }

    // Replay all transitions from that point
    for (let i = historyStartIndex; i < history.length; i++) {
      const entry = history[i];
      const transition = (current as any)[entry.transitionName];

      if (typeof transition === 'function') {
        try {
          current = transition.apply(current.context, entry.args);
        } catch (err) {
          console.error(`Replay failed at step ${i}:`, err);
          throw err;
        }
      }
    }

    return current;
  };

  // Helper to wrap a machine with tracking properties and wrapped transitions
  const wrapMachine = (machine: any): any => {
    const wrapped: any = { ...machine };

    // Wrap transition functions
    for (const prop in machine) {
      if (!Object.prototype.hasOwnProperty.call(machine, prop)) continue;
      const value = machine[prop];
      if (typeof value === 'function' && !prop.startsWith('_') && prop !== 'context' &&
          !['history', 'snapshots', 'clearHistory', 'clearSnapshots', 'clearTimeTravel', 'restoreSnapshot', 'replayFrom'].includes(prop)) {
        wrapped[prop] = function(this: any, ...args: any[]) {
          // Record history before transition
          recordHistory(prop, args);

          const prevContext = wrapped.context;
          const result = value.apply(this, args);

          // Record snapshot after transition
          if (result && typeof result === 'object' && 'context' in result) {
            recordSnapshot(prop, prevContext, result.context);
          }

          // Wrap returned machine
          if (result && typeof result === 'object' && 'context' in result) {
            return wrapMachine(result);
          }
          return result;
        };
      }
    }

    // Attach tracking properties
    return Object.assign(wrapped, {
      history,
      snapshots,
      clearHistory: () => { history.length = 0; entryId = 0; },
      clearSnapshots: () => { snapshots.length = 0; snapshotId = 0; },
      clearTimeTravel: () => {
        history.length = 0;
        snapshots.length = 0;
        entryId = 0;
        snapshotId = 0;
      },
      restoreSnapshot,
      replayFrom
    });
  };

  return wrapMachine(machine);
}

/**
 * Compose multiple middleware functions into a single middleware stack.
 * Middleware is applied left-to-right (first middleware wraps outermost).
 *
 * @template M - The machine type
 * @param machine - The base machine
 * @param middlewares - Array of middleware functions
 * @returns A new machine with all middleware applied
 *
 * @example
 * const instrumented = compose(
 *   counter,
 *   withLogging,
 *   withAnalytics(analytics.track),
 *   withValidation(validator),
 *   withErrorReporting(Sentry.captureException)
 * );
 */
export function compose<M extends BaseMachine<any>>(
  machine: M,
  ...middlewares: Array<(m: M) => M>
): M {
  return middlewares.reduce((acc, middleware) => middleware(acc), machine);
}

/**
 * Create a reusable middleware function from hooks.
 * Useful for defining custom middleware that can be applied to multiple machines.
 *
 * @template M - The machine type
 * @param hooks - Middleware hooks configuration
 * @param options - Middleware options
 * @returns A middleware function that can be applied to machines
 *
 * @example
 * const myMiddleware = createCustomMiddleware({
 *   before: ({ transitionName }) => console.log('Before:', transitionName),
 *   after: ({ transitionName }) => console.log('After:', transitionName)
 * });
 *
 * const machine1 = myMiddleware(counter1);
 * const machine2 = myMiddleware(counter2);
 */
export function createCustomMiddleware<M extends BaseMachine<any>>(
  hooks: MiddlewareHooks<Context<M>>,
  options?: MiddlewareOptions
): (machine: M) => M {
  return (machine: M) => createMiddleware(machine, hooks, options);
}

// =============================================================================
// SECTION: TYPESAFE MIDDLEWARE COMPOSITION
// =============================================================================

/**
 * A middleware function that transforms a machine.
 * @template M - The input machine type
 * @template R - The output machine type (usually extends M)
 */
/**
 * A middleware function that transforms a machine.
 * @template M - Input machine type
 * @template R - Output machine type (defaults to same as input if no augmentation)
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
  /** Whether to continue executing remaining middlewares if one fails */
  continueOnError?: boolean;
  /** Whether to log errors to console */
  logErrors?: boolean;
  /** Custom error handler */
  onError?: (error: Error, middlewareName?: string) => void;
}

/**
 * Result of pipeline execution.
 */
export interface PipelineResult<M extends BaseMachine<any>> {
  /** The final machine after all middlewares */
  machine: M;
  /** Any errors that occurred during execution */
  errors: Array<{ error: Error; middlewareIndex: number; middlewareName?: string }>;
  /** Whether the pipeline completed successfully */
  success: boolean;
}

/**
 * Compose multiple middlewares with improved type inference.
 * This is a more typesafe version of the basic compose function.
 *
 * @template M - The initial machine type
 * @template Ms - Array of middleware functions
 * @param machine - The initial machine
 * @param middlewares - Array of middleware functions to apply
 * @returns The machine with all middlewares applied
 *
 * @example
 * const enhanced = composeTyped(
 *   counter,
 *   withHistory(),
 *   withSnapshot(),
 *   withTimeTravel()
 * );
 */
/**
 * Recursively applies middlewares to infer the final machine type.
 * Provides precise type inference for middleware composition chains.
 */
type ComposeResult<
  M extends BaseMachine<any>,
  Ms extends readonly MiddlewareFn<any, any>[]
> = Ms extends readonly []
  ? M
  : Ms extends readonly [infer First, ...infer Rest]
    ? First extends MiddlewareFn<any, infer Output>
      ? Rest extends readonly MiddlewareFn<any, any>[]
        ? ComposeResult<Output, Rest>
        : Output
      : M
    : M;

/**
 * Type-safe middleware composition with perfect inference.
 * Composes multiple middlewares into a single transformation chain.
 *
 * @template M - The input machine type
 * @template Ms - Array of middleware functions
 * @param machine - The machine to enhance
 * @param middlewares - Middleware functions to apply in order
 * @returns The machine with all middlewares applied, with precise type inference
 *
 * @example
 * ```typescript
 * const enhanced = composeTyped(
 *   counter,
 *   withHistory(),
 *   withSnapshot(),
 *   withTimeTravel()
 * );
 * // enhanced: WithTimeTravel<WithSnapshot<WithHistory<Counter>>>
 * // Perfect IntelliSense for all methods and properties
 * ```
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

/**
 * Type-safe middleware composition with fluent API.
 * Allows building middleware chains with method chaining.
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
 * Common middleware combination types for better DX.
 * These types help with inference when using popular middleware combinations.
 */
export type WithDebugging<M extends BaseMachine<any>> = WithTimeTravel<WithSnapshot<WithHistory<M>>>;

/**
 * Convenience function for the most common debugging middleware stack.
 * Combines history, snapshots, and time travel for full debugging capabilities.
 *
 * @example
 * ```typescript
 * const debugMachine = withDebugging(counter);
 * debugMachine.increment();
 * debugMachine.history; // Full transition history
 * debugMachine.snapshots; // Context snapshots
 * debugMachine.replayFrom(0); // Time travel
 * ```
 */
export function withDebugging<M extends BaseMachine<any>>(machine: M): WithDebugging<M> {
  return withTimeTravel(withSnapshot(withHistory(machine)));
}

/**
 * Create a middleware pipeline with error handling and conditional execution.
 *
 * @template M - The machine type
 * @param config - Pipeline configuration
 * @returns A function that executes middlewares in a pipeline
 *
 * @example
 * const pipeline = createPipeline({ continueOnError: true });
 *
 * const result = pipeline(
 *   counter,
 *   withHistory(),
 *   withSnapshot(),
 *   { middleware: withLogging(), when: (m) => m.context.debug }
 * );
 */
export function createPipeline<M extends BaseMachine<any>>(
  config: PipelineConfig = {}
): {
  <Ms extends Array<MiddlewareFn<M> | ConditionalMiddleware<M>>>(
    machine: M,
    ...middlewares: Ms
  ): PipelineResult<M>;
} {
  const {
    continueOnError = false,
    logErrors = true,
    onError
  } = config;

  return (machine: M, ...middlewares: Array<MiddlewareFn<M> | ConditionalMiddleware<M>>): PipelineResult<M> => {
    let currentMachine = machine;
    const errors: Array<{ error: Error; middlewareIndex: number; middlewareName?: string }> = [];

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
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ error: err, middlewareIndex: i });

        if (logErrors) {
          console.error(`Middleware pipeline error at index ${i}:`, err);
        }

        onError?.(err, `middleware-${i}`);

        if (!continueOnError) {
          break;
        }
      }
    }

    return {
      machine: currentMachine,
      errors,
      success: errors.length === 0
    };
  };
}

/**
 * Create a middleware registry for named middleware composition.
 * Useful for building complex middleware stacks from reusable components.
 *
 * @template M - The machine type
 *
 * @example
 * const registry = createMiddlewareRegistry<CounterMachine>()
 *   .register('history', withHistory(), 'Track state changes')
 *   .register('snapshot', withSnapshot(), 'Take context snapshots', 10)
 *   .register('timeTravel', withTimeTravel(), 'Enable time travel debugging', 20);
 *
 * const machine = registry.apply(counter, ['history', 'snapshot', 'timeTravel']);
 */
export function createMiddlewareRegistry<M extends BaseMachine<any>>() {
  const registry = new Map<string, NamedMiddleware<M>>();

  return {
    /**
     * Register a middleware with a name and optional metadata.
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

/**
 * Create a conditional middleware that only applies when a predicate is true.
 *
 * @template M - The machine type
 * @param middleware - The middleware to conditionally apply
 * @param predicate - Function that determines when to apply the middleware
 * @returns A conditional middleware that can be called directly or used in pipelines
 *
 * @example
 * const debugMiddleware = when(
 *   withTimeTravel(),
 *   (machine) => machine.context.debugMode
 * );
 *
 * // Can be called directly
 * const machine = debugMiddleware(baseMachine);
 *
 * // Can also be used in pipelines
 * const pipeline = createPipeline();
 * const result = pipeline(machine, debugMiddleware);
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
 *
 * @example
 * const devMachine = composeTyped(
 *   counter,
 *   inDevelopment(withTimeTravel())
 * );
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
 *
 * @example
 * const adminMachine = composeTyped(
 *   userMachine,
 *   whenContext('role', 'admin', withAdminFeatures())
 * );
 */
export function whenContext<M extends BaseMachine<any>, K extends keyof Context<M>>(
  key: K,
  value: Context<M>[K],
  middleware: MiddlewareFn<M>
): ConditionalMiddleware<M> & MiddlewareFn<M> {
  return when(middleware, (machine) => machine.context[key] === value);
}

/**
 * Combine multiple middlewares with short-circuiting.
 * If any middleware returns a different type, the composition stops.
 *
 * @template M - The machine type
 * @param middlewares - Array of middlewares to combine
 * @returns A combined middleware function
 *
 * @example
 * const combined = combine(
 *   withHistory(),
 *   withSnapshot(),
 *   withValidation()
 * );
 */
export function combine<M extends BaseMachine<any>>(
  ...middlewares: Array<MiddlewareFn<M>>
): MiddlewareFn<M> {
  return (machine: M) => composeTyped(machine, ...middlewares);
}

/**
 * Create a middleware that applies different middlewares based on context.
 *
 * @template M - The machine type
 * @param branches - Array of [predicate, middleware] pairs
 * @param fallback - Optional fallback middleware if no predicates match
 * @returns A branching middleware
 *
 * @example
 * const smartMiddleware = branch(
 *   [(m) => m.context.userType === 'admin', withAdminFeatures()],
 *   [(m) => m.context.debug, withTimeTravel()],
 *   withBasicLogging() // fallback
 * );
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

/**
 * Type guard to check if a value is a middleware function.
 */
export function isMiddlewareFn<M extends BaseMachine<any>>(
  value: any
): value is MiddlewareFn<M> {
  return typeof value === 'function' && value.length === 1;
}

/**
 * Type guard to check if a value is a conditional middleware.
 */
export function isConditionalMiddleware<M extends BaseMachine<any>>(
  value: any
): value is ConditionalMiddleware<M> {
  return (
    value !== null &&
    'middleware' in value &&
    'when' in value &&
    isMiddlewareFn(value.middleware) &&
    typeof value.when === 'function'
  );
}
