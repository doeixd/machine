/**
 * @file Core middleware types and basic middleware creation
 */

import type { Context, BaseMachine } from '../index';

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
export interface MiddlewareHooks<C extends object> {
  /**
   * Called before a transition executes.
   * Can be used for validation, logging, analytics, etc.
   *
   * @param ctx - Transition context with machine state and transition details
   * @returns void to continue, CANCEL to abort silently, or Promise for async validation
   */
  before?: (ctx: MiddlewareContext<C>) => void | typeof CANCEL | Promise<void | typeof CANCEL>;

  /**
   * Called after a transition successfully executes.
   * Receives both the previous and next context.
   * Cannot prevent the transition (it already happened).
   *
   * @param result - Transition result with before/after contexts and transition details
   */
  after?: (result: MiddlewareResult<C>) => void | Promise<void>;

  /**
   * Called when a transition throws an error.
   * Can be used for error reporting, recovery, etc.
   *
   * @param error - Error context with transition details and error information
   */
  error?: (error: MiddlewareError<C>) => void | Promise<void>;
}

/**
 * Options for configuring middleware behavior.
 */
export interface MiddlewareOptions {
  /** Whether to continue execution if a hook throws an error */
  continueOnError?: boolean;
  /** Whether to log errors from hooks */
  logErrors?: boolean;
  /** Custom error handler for hook errors */
  onError?: (error: Error, hookName: string, ctx: any) => void;
}

/**
 * Symbol used to cancel a transition from a before hook.
 */
export const CANCEL = Symbol('CANCEL');

// =============================================================================
// SECTION: CORE MIDDLEWARE FUNCTIONS
// =============================================================================

/**
 * Creates a middleware function that wraps machine transitions with hooks.
 *
 * @template M - The machine type
 * @param machine - The machine to instrument
 * @param hooks - Middleware hooks to execute
 * @param options - Middleware configuration options
 * @returns A new machine with middleware applied
 */
export function createMiddleware<M extends BaseMachine<any>>(
  machine: M,
  hooks: MiddlewareHooks<Context<M>>,
  options: MiddlewareOptions = {}
): M {
  const { continueOnError = false, logErrors = true, onError } = options;

  // Create a wrapped machine that intercepts all transition calls
  const wrappedMachine: any = { ...machine };

  // Copy any extra properties from the original machine (for middleware composition)
  for (const prop in machine) {
    if (!Object.prototype.hasOwnProperty.call(machine, prop)) continue;
    if (prop !== 'context' && typeof machine[prop] !== 'function') {
      wrappedMachine[prop] = machine[prop];
    }
  }

  // Wrap each transition function
  for (const prop in machine) {
    if (!Object.prototype.hasOwnProperty.call(machine, prop)) continue;
    const value = machine[prop];
    if (typeof value === 'function' && prop !== 'context') {
      wrappedMachine[prop] = function (this: any, ...args: any[]) {
        const transitionName = prop;
        const context = wrappedMachine.context;

        // Helper function to execute the transition and after hooks
        const executeTransition = () => {
          // 2. Execute the actual transition
          let nextMachine: any;
          try {
            nextMachine = value.apply(this, args);
          } catch (error) {
            // 3. Execute error hooks if transition failed
            if (hooks.error) {
              try {
                // Error hooks are called synchronously for now
                hooks.error({
                  transitionName,
                  context,
                  args: [...args],
                  error: error as Error
                });
              } catch (hookError) {
                if (!continueOnError) throw hookError;
                if (logErrors) console.error(`Middleware error hook error for ${transitionName}:`, hookError);
                onError?.(hookError as Error, 'error', { transitionName, context, args, error });
              }
            }
            throw error; // Re-throw the original error
          }

          // Ensure the returned machine has the same extra properties as the wrapped machine
          const ensureMiddlewareProperties = (machine: any) => {
            if (machine && typeof machine === 'object' && machine.context) {
              // Copy extra properties from the wrapped machine to the returned machine
              for (const prop in wrappedMachine) {
                if (!Object.prototype.hasOwnProperty.call(wrappedMachine, prop)) continue;
                if (prop !== 'context' && !(prop in machine)) {
                  machine[prop] = wrappedMachine[prop];
                }
              }

              // Also wrap the transition functions on the returned machine
              for (const prop in machine) {
                if (!Object.prototype.hasOwnProperty.call(machine, prop)) continue;
                const value = machine[prop];
                if (typeof value === 'function' && prop !== 'context' && wrappedMachine[prop]) {
                  machine[prop] = wrappedMachine[prop];
                }
              }
            }
            return machine;
          };

          // Check if the transition is async (returns a Promise)
          if (nextMachine && typeof nextMachine.then === 'function') {
            // For async transitions, we need to handle the after hooks after the promise resolves
            const asyncResult = nextMachine.then((resolvedMachine: any) => {
              // Ensure middleware properties are attached
              ensureMiddlewareProperties(resolvedMachine);

              // Execute after hooks with the resolved machine
              if (hooks.after) {
                try {
                  const result = hooks.after({
                    transitionName,
                    prevContext: context,
                    nextContext: resolvedMachine.context,
                    args: [...args]
                  });

                  // Handle async after hooks
                  if (result && typeof result.then === 'function') {
                    return result.then(() => resolvedMachine);
                  }
                } catch (error) {
                  if (!continueOnError) throw error;
                  if (logErrors) console.error(`Middleware after hook error for ${transitionName}:`, error);
                  onError?.(error as Error, 'after', {
                    transitionName,
                    prevContext: context,
                    nextContext: resolvedMachine.context,
                    args
                  });
                }
              }
              return resolvedMachine;
            });

            return asyncResult;
          } else {
            // Ensure middleware properties are attached to synchronous transitions
            ensureMiddlewareProperties(nextMachine);

            // Synchronous transition
            // 4. Execute after hooks
            if (hooks.after) {
              try {
                const result = hooks.after({
                  transitionName,
                  prevContext: context,
                  nextContext: nextMachine.context,
                  args: [...args]
                });

                // Handle async after hooks
                if (result && typeof result === 'object' && result && 'then' in result) {
                  return result.then(() => nextMachine).catch((error: Error) => {
                    if (!continueOnError) throw error;
                    if (logErrors) console.error(`Middleware after hook error for ${transitionName}:`, error);
                    onError?.(error, 'after', {
                      transitionName,
                      prevContext: context,
                      nextContext: nextMachine.context,
                      args
                    });
                    return nextMachine;
                  });
                }
              } catch (error) {
                if (!continueOnError) throw error;
                if (logErrors) console.error(`Middleware after hook error for ${transitionName}:`, error);
                onError?.(error as Error, 'after', {
                  transitionName,
                  prevContext: context,
                  nextContext: nextMachine.context,
                  args
                });
              }
            }

            // 5. Return the next machine state
            return nextMachine;
          }
        };

        // 1. Execute before hooks synchronously if possible
        if (hooks.before) {
          try {
            const result = hooks.before({
              transitionName,
              context,
              args: [...args]
            });

            // Handle async hooks
            if (result && typeof result === 'object' && result && 'then' in result) {
              // For async hooks, return a promise that executes the transition after
              return result.then((hookResult: any) => {
                if (hookResult === CANCEL) {
                  return wrappedMachine;
                }
                return executeTransition();
              }).catch((error: Error) => {
                if (!continueOnError) throw error;
                if (logErrors) console.error(`Middleware before hook error for ${transitionName}:`, error);
                onError?.(error, 'before', { transitionName, context, args });
                return executeTransition();
              });
            }

            // Check if transition should be cancelled
            if (result === CANCEL) {
              return wrappedMachine; // Return the same machine instance
            }
          } catch (error) {
            if (!continueOnError) throw error;
            if (logErrors) console.error(`Middleware before hook error for ${transitionName}:`, error);
            onError?.(error as Error, 'before', { transitionName, context, args });
          }
        };

        return executeTransition();
      };
    }
  }

  return wrappedMachine;
}

/**
 * Creates a simple logging middleware that logs all transitions.
 *
 * @template M - The machine type
 * @param machine - The machine to add logging to
 * @param options - Logging configuration options
 * @returns A new machine with logging middleware
 */
export function withLogging<M extends BaseMachine<any>>(
  machine: M,
  options: {
    logger?: (message: string) => void;
    includeArgs?: boolean;
    includeContext?: boolean;
  } = {}
): M {
  const { logger = console.log, includeArgs = false, includeContext = true } = options;

  return createMiddleware(machine, {
    before: ({ transitionName, args }) => {
      const message = includeArgs ? `→ ${transitionName} [${args.join(', ')}]` : `→ ${transitionName}`;
      logger(message);
    },
     after: ({ transitionName, nextContext }) => {
       const contextStr = includeContext ? ` ${JSON.stringify(nextContext)}` : '';
       logger(`✓ ${transitionName}${contextStr}`);
     },
    error: ({ transitionName, error }) => {
      console.error(`[Machine] ${transitionName} failed:`, error);
    }
  });
}

/**
 * Creates analytics tracking middleware.
 *
 * @template M - The machine type
 * @param machine - The machine to track
 * @param track - Analytics tracking function
 * @param options - Configuration options
 * @returns A new machine with analytics tracking
 */
export function withAnalytics<M extends BaseMachine<any>>(
  machine: M,
  track: (event: string, data?: any) => void,
  options: {
    eventPrefix?: string;
    includePrevContext?: boolean;
    includeArgs?: boolean;
  } = {}
): M {
  const { eventPrefix = 'state_transition', includePrevContext = false, includeArgs = false } = options;

  return createMiddleware(machine, {
    after: ({ transitionName, prevContext, nextContext, args }) => {
      const event = `${eventPrefix}.${transitionName}`;
      const data: any = { transition: transitionName };
      if (includePrevContext) data.from = prevContext;
      data.to = nextContext;
      if (includeArgs) data.args = args;
      track(event, data);
    }
  });
}

/**
 * Creates validation middleware that runs before transitions.
 *
 * @template M - The machine type
 * @param machine - The machine to validate
 * @param validator - Validation function
 * @returns A new machine with validation
 */
export function withValidation<M extends BaseMachine<any>>(
  machine: M,
  validator: (ctx: MiddlewareContext<Context<M>>) => boolean | void
): M {
  return createMiddleware(machine, {
    before: (ctx) => {
      const result = validator(ctx);
      if (result === false) {
        throw new Error(`Validation failed for transition: ${ctx.transitionName}`);
      }
    }
  });
}

/**
 * Creates permission-checking middleware.
 *
 * @template M - The machine type
 * @param machine - The machine to protect
 * @param checker - Permission checking function
 * @returns A new machine with permission checks
 */
export function withPermissions<M extends BaseMachine<any>>(
  machine: M,
  checker: (ctx: MiddlewareContext<Context<M>>) => boolean
): M {
  return createMiddleware(machine, {
    before: (ctx) => {
      if (!checker(ctx)) {
        throw new Error(`Unauthorized transition: ${ctx.transitionName}`);
      }
    }
  });
}

/**
 * Creates error reporting middleware.
 *
 * @template M - The machine type
 * @param machine - The machine to monitor
 * @param reporter - Error reporting function
 * @param options - Configuration options
 * @returns A new machine with error reporting
 */
export function withErrorReporting<M extends BaseMachine<any>>(
  machine: M,
  reporter: (error: Error, ctx: any) => void,
  options: { includeArgs?: boolean } = {}
): M {
  const { includeArgs = false } = options;

  return createMiddleware(machine, {
    error: (errorCtx) => {
      // Format the context to match test expectations
      const formattedCtx = {
        transition: errorCtx.transitionName,
        context: errorCtx.context,
        ...(includeArgs && { args: errorCtx.args })
      };
      reporter(errorCtx.error, formattedCtx);
    }
  });
}

/**
 * Creates performance monitoring middleware.
 *
 * @template M - The machine type
 * @param machine - The machine to monitor
 * @param tracker - Performance tracking function
 * @returns A new machine with performance monitoring
 */
export function withPerformanceMonitoring<M extends BaseMachine<any>>(
  machine: M,
  tracker: (metric: { transitionName: string; duration: number; context: Context<M> }) => void
): M {
  const startTimes = new Map<string, number>();

  return createMiddleware(machine, {
    before: (ctx) => {
      startTimes.set(ctx.transitionName, Date.now());
    },
    after: (result) => {
      const startTime = startTimes.get(result.transitionName);
      if (startTime) {
        const duration = Date.now() - startTime;
        startTimes.delete(result.transitionName);
        // For test compatibility, pass a single object as expected
        const testResult = {
          transitionName: result.transitionName,
          duration,
          context: result.nextContext || result.prevContext
        };
        tracker(testResult);
      }
    }
  });
}

/**
 * Creates retry middleware for failed transitions.
 *
 * @template M - The machine type
 * @param machine - The machine to add retry logic to
 * @param options - Retry configuration
 * @returns A new machine with retry logic
 */
export function withRetry<M extends BaseMachine<any>>(
  machine: M,
  options: {
    maxAttempts?: number;
    maxRetries?: number; // alias for maxAttempts
    shouldRetry?: (error: Error, attempt: number) => boolean;
    backoffMs?: number | ((attempt: number) => number);
    delay?: number | ((attempt: number) => number); // alias for backoffMs
    backoffMultiplier?: number; // multiplier for exponential backoff
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): M {
  const {
    maxAttempts = options.maxRetries ?? 3,
    shouldRetry = () => true,
    backoffMs = options.delay ?? 100,
    backoffMultiplier = 2,
    onRetry
  } = options;

  // Create a wrapped machine that adds retry logic
  const wrappedMachine: any = { ...machine };

  // Wrap each transition function with retry logic
  for (const prop in machine) {
    if (!Object.prototype.hasOwnProperty.call(machine, prop)) continue;
    const value = machine[prop];
    if (typeof value === 'function' && prop !== 'context') {
      wrappedMachine[prop] = async function (this: any, ...args: any[]) {
        let lastError: Error;
        let attempt = 0;

        while (attempt < maxAttempts) {
          try {
            return await value.apply(this, args);
          } catch (error) {
            lastError = error as Error;
            attempt++;

            if (attempt < maxAttempts && shouldRetry(lastError, attempt)) {
              onRetry?.(lastError, attempt);
              const baseDelay = typeof backoffMs === 'function' ? backoffMs(attempt) : backoffMs;
              const delay = baseDelay * Math.pow(backoffMultiplier, attempt - 1);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              throw lastError;
            }
          }
        }

        throw lastError!;
        };



      }
    }

    return wrappedMachine;
}

/**
 * Creates custom middleware from hooks.
 *
 * @template M - The machine type
 * @param hooks - Middleware hooks
 * @param options - Middleware options
 * @returns A middleware function
 */
export function createCustomMiddleware<M extends BaseMachine<any>>(
  hooks: MiddlewareHooks<Context<M>>,
  options?: MiddlewareOptions
): (machine: M) => M {
  return (machine: M) => createMiddleware(machine, hooks, options);
}