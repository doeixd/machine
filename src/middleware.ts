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

          // Check if the transition is async (returns a Promise)
          if (nextMachine && typeof nextMachine.then === 'function') {
            // For async transitions, we need to handle the after hooks after the promise resolves
            const asyncResult = nextMachine.then((resolvedMachine: any) => {
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

// =============================================================================
// SECTION: HISTORY TRACKING
// =============================================================================

/**
 * A single history entry recording a transition.
 */
export interface HistoryEntry {
  /** Unique ID for this history entry */
  id: string;
  /** Name of the transition that was called */
  transitionName: string;
  /** Arguments passed to the transition */
  args: any[];
  /** Timestamp when the transition occurred */
  timestamp: number;
  /** Optional serialized version of args for persistence */
  serializedArgs?: string;
}

/**
 * Serializer interface for converting context/args to/from strings.
 */
export interface Serializer<T = any> {
  serialize: (value: T) => string;
  deserialize: (str: string) => T;
}

/**
 * Creates a machine with history tracking capabilities.
 * Records all transitions that occur, allowing you to see the sequence of state changes.
 *
 * @template M - The machine type
 * @param machine - The machine to track
 * @param options - Configuration options
 * @returns A new machine with history tracking
 *
 * @example
 * ```typescript
 * const tracked = withHistory(counter, { maxSize: 50 });
 * tracked.increment();
 * console.log(tracked.history); // [{ id: "entry-1", transitionName: "increment", ... }]
 * ```
 */
export function withHistory<M extends BaseMachine<any>>(
  machine: M,
  options: {
    /** Maximum number of history entries to keep (default: unlimited) */
    maxSize?: number;
    /** Optional serializer for transition arguments */
    serializer?: Serializer<any[]>;
    /** Callback when a transition occurs */
    onEntry?: (entry: HistoryEntry) => void;
  } = {}
): M & { history: HistoryEntry[]; clearHistory: () => void } {
  const { maxSize, serializer, onEntry } = options;
  const history: HistoryEntry[] = [];
  let entryId = 0;

  const instrumentedMachine = createMiddleware(machine, {
    before: ({ transitionName, args }) => {
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

      // Enforce max size
      if (maxSize && history.length > maxSize) {
        history.shift();
      }

      onEntry?.(entry);
    }
  });

  // Attach history properties to the machine
  return Object.assign(instrumentedMachine, {
    history,
    clearHistory: () => { history.length = 0; entryId = 0; }
  });
}

// =============================================================================
// SECTION: SNAPSHOT TRACKING
// =============================================================================

/**
 * A snapshot of machine context before and after a transition.
 */
export interface ContextSnapshot<C extends object> {
  /** Unique ID for this snapshot */
  id: string;
  /** Name of the transition that caused this snapshot */
  transitionName: string;
  /** Context before the transition */
  before: C;
  /** Context after the transition */
  after: C;
  /** Timestamp of the snapshot */
  timestamp: number;
  /** Optional serialized versions of contexts */
  serializedBefore?: string;
  serializedAfter?: string;
  /** Optional diff information */
  diff?: any;
}

/**
 * Creates a machine with snapshot tracking capabilities.
 * Records context state before and after each transition for debugging and inspection.
 *
 * @template M - The machine type
 * @param machine - The machine to track
 * @param options - Configuration options
 * @returns A new machine with snapshot tracking
 *
 * @example
 * ```typescript
 * const tracked = withSnapshot(counter, {
 *   maxSize: 50,
 *   serializer: {
 *     serialize: (ctx) => JSON.stringify(ctx),
 *     deserialize: (str) => JSON.parse(str)
 *   }
 * });
 *
 * tracked.increment();
 * console.log(tracked.snapshots); // [{ before: { count: 0 }, after: { count: 1 }, ... }]
 * ```
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
    onlyOnChange?: boolean;
  } = {}
): M & {
  snapshots: ContextSnapshot<Context<M>>[];
  clearSnapshots: () => void;
  restoreSnapshot: (snapshot: ContextSnapshot<Context<M>>['before']) => M;
} {
  const {
    maxSize,
    serializer,
    captureSnapshot,
    onlyOnChange = false
  } = options;

  const snapshots: ContextSnapshot<Context<M>>[] = [];
  let snapshotId = 0;

  const instrumentedMachine = createMiddleware(machine, {
    after: ({ transitionName, prevContext, nextContext }) => {
      // Skip if only capturing on change and context didn't change
      if (onlyOnChange && JSON.stringify(prevContext) === JSON.stringify(nextContext)) {
        return;
      }

      const snapshot: ContextSnapshot<Context<M>> = {
        id: `snapshot-${snapshotId++}`,
        transitionName,
        before: { ...prevContext },
        after: { ...nextContext },
        timestamp: Date.now()
      };

      // Serialize contexts if serializer provided
      if (serializer) {
        try {
          snapshot.serializedBefore = serializer.serialize(prevContext);
          snapshot.serializedAfter = serializer.serialize(nextContext);
        } catch (err) {
          console.error('Failed to serialize snapshot:', err);
        }
      }

      // Capture custom snapshot data
      if (captureSnapshot) {
        try {
          snapshot.diff = captureSnapshot(prevContext, nextContext);
        } catch (err) {
          console.error('Failed to capture snapshot:', err);
        }
      }

      snapshots.push(snapshot);

      // Enforce max size
      if (maxSize && snapshots.length > maxSize) {
        snapshots.shift();
      }
    }
  });

  // Helper to restore machine to a previous state
  const restoreSnapshot = (context: Context<M>): M => {
    // Find the machine's transition functions (excluding context and snapshot properties)
    const transitions = Object.fromEntries(
      Object.entries(machine).filter(([key]) =>
        key !== 'context' &&
        key !== 'snapshots' &&
        key !== 'clearSnapshots' &&
        key !== 'restoreSnapshot' &&
        typeof machine[key as keyof M] === 'function'
      )
    );

    return Object.assign({ context }, transitions) as M;
  };

  // Attach snapshot properties to the machine
  return Object.assign(instrumentedMachine, {
    snapshots,
    clearSnapshots: () => { snapshots.length = 0; snapshotId = 0; },
    restoreSnapshot
  });
}

// =============================================================================
// SECTION: TIME TRAVEL DEBUGGING
// =============================================================================

/**
 * A machine enhanced with history tracking capabilities.
 */
export type WithHistory<M extends BaseMachine<any>> = M & {
  /** History of all transitions */
  history: HistoryEntry[];
  /** Clear all history */
  clearHistory: () => void;
};

/**
 * A machine enhanced with snapshot tracking capabilities.
 */
export type WithSnapshot<M extends BaseMachine<any>> = M & {
  /** Snapshots of context before/after each transition */
  snapshots: ContextSnapshot<Context<M>>[];
  /** Clear all snapshots */
  clearSnapshots: () => void;
  /** Restore machine to a previous context state */
  restoreSnapshot: (context: Context<M>) => M;
};

/**
 * A machine enhanced with time travel capabilities.
 */
export type WithTimeTravel<M extends BaseMachine<any>> = M & {
  /** History of all transitions */
  history: HistoryEntry[];
  /** Snapshots of context before/after each transition */
  snapshots: ContextSnapshot<Context<M>>[];
  /** Clear all history and snapshots */
  clearTimeTravel: () => void;
  /** Clear just the history */
  clearHistory: () => void;
  /** Clear just the snapshots */
  clearSnapshots: () => void;
  /** Restore machine to a previous context state */
  restoreSnapshot: (context: Context<M>) => M;
  /** Replay transitions from a specific point in history */
  replayFrom: (startIndex: number) => M;
};

/**
 * Creates a machine with full time travel debugging capabilities.
 * Combines history tracking, snapshots, and replay functionality.
 *
 * @template M - The machine type
 * @param machine - The machine to enhance
 * @param options - Configuration options
 * @returns A machine with time travel capabilities
 *
 * @example
 * ```typescript
 * const debugMachine = withTimeTravel(counter);
 *
 * // Make some transitions
 * debugMachine.increment();
 * debugMachine.increment();
 * debugMachine.decrement();
 *
 * // Time travel to previous states
 * const previousState = debugMachine.replayFrom(0); // Replay from start
 * const undoLast = debugMachine.restoreSnapshot(debugMachine.snapshots[1].before);
 *
 * // Inspect history
 * console.log(debugMachine.history);
 * console.log(debugMachine.snapshots);
 * ```
 */
export function withTimeTravel<M extends BaseMachine<any>>(
  machine: M,
  options: {
    /** Maximum number of history entries/snapshots to keep */
    maxSize?: number;
    /** Optional serializer for persistence */
    serializer?: Serializer;
    /** Callback when history/snapshot events occur */
    onRecord?: (type: 'history' | 'snapshot', data: any) => void;
  } = {}
): WithTimeTravel<M> {
  const { maxSize, serializer, onRecord } = options;

  // Create separate history and snapshot tracking
  const history: HistoryEntry[] = [];
  const snapshots: ContextSnapshot<Context<M>>[] = [];
  let historyId = 0;
  let snapshotId = 0;

  // Create middleware that handles both history and snapshots
  const instrumentedMachine = createMiddleware(machine, {
    before: ({ transitionName, args }) => {
      const entry: HistoryEntry = {
        id: `entry-${historyId++}`,
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

      // Enforce max size
      if (maxSize && history.length > maxSize) {
        history.shift();
      }

      onRecord?.('history', entry);
    },
    after: ({ transitionName, prevContext, nextContext }) => {
      const snapshot: ContextSnapshot<Context<M>> = {
        id: `snapshot-${snapshotId++}`,
        transitionName,
        before: { ...prevContext },
        after: { ...nextContext },
        timestamp: Date.now()
      };

      // Serialize contexts if serializer provided
      if (serializer) {
        try {
          snapshot.serializedBefore = serializer.serialize(prevContext);
          snapshot.serializedAfter = serializer.serialize(nextContext);
        } catch (err) {
          console.error('Failed to serialize snapshot:', err);
        }
      }

      snapshots.push(snapshot);

      // Enforce max size
      if (maxSize && snapshots.length > maxSize) {
        snapshots.shift();
      }

      onRecord?.('snapshot', snapshot);
    }
  });

  // Helper to restore machine to a previous state
  const restoreSnapshot = (context: Context<M>): M => {
    // Find the machine's transition functions (excluding context and snapshot properties)
    const transitions = Object.fromEntries(
      Object.entries(machine).filter(([key]) =>
        key !== 'context' &&
        key !== 'history' &&
        key !== 'snapshots' &&
        key !== 'clearHistory' &&
        key !== 'clearSnapshots' &&
        key !== 'restoreSnapshot' &&
        key !== 'clearTimeTravel' &&
        key !== 'replayFrom' &&
        typeof machine[key as keyof M] === 'function'
      )
    );

    return Object.assign({ context }, transitions) as M;
  };

  // Create replay functionality
  const replayFrom = (startIndex: number): M => {
    if (startIndex < 0 || startIndex >= history.length) {
      throw new Error(`Invalid replay start index: ${startIndex}`);
    }

    // Start from the context at the specified history index
    let currentContext = snapshots[startIndex]?.before;
    if (!currentContext) {
      throw new Error(`No snapshot available for index ${startIndex}`);
    }

    // Get all transitions from start index to end
    const transitionsToReplay = history.slice(startIndex);

    // Create a fresh machine instance
    const freshMachine = Object.assign(
      { context: currentContext },
      Object.fromEntries(
        Object.entries(machine).filter(([key]) =>
          key !== 'context' &&
          typeof machine[key as keyof M] === 'function'
        )
      )
    ) as M;

    // Replay each transition
    let replayedMachine = freshMachine;
    for (const entry of transitionsToReplay) {
      const transitionFn = replayedMachine[entry.transitionName as keyof M] as Function;
      if (transitionFn) {
        replayedMachine = transitionFn.apply(replayedMachine.context, entry.args);
      }
    }

    return replayedMachine;
  };

  // Return machine with all time travel capabilities
  return Object.assign(instrumentedMachine, {
    history,
    snapshots,
    clearHistory: () => { history.length = 0; historyId = 0; },
    clearSnapshots: () => { snapshots.length = 0; snapshotId = 0; },
    clearTimeTravel: () => {
      history.length = 0;
      snapshots.length = 0;
      historyId = 0;
      snapshotId = 0;
    },
    restoreSnapshot,
    replayFrom
  }) as WithTimeTravel<M>;
}

// =============================================================================
// SECTION: MIDDLEWARE COMPOSITION
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
// SECTION: TYPE-LEVEL COMPOSITION
// =============================================================================

/**
 * Type-level utility for composing middleware return types.
 * This enables perfect TypeScript inference when chaining middlewares.
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
 * Result of pipeline execution.
 */
export type PipelineResult<M extends BaseMachine<any>> = M;

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
 * Combine multiple middlewares with short-circuiting.
 */
export function combine<M extends BaseMachine<any>>(
  ...middlewares: Array<MiddlewareFn<M>>
): MiddlewareFn<M> {
  return (machine: M) => composeTyped(machine, ...middlewares);
}

/**
 * Create a middleware that applies different middlewares based on context.
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
// SECTION: TYPE GUARDS
// =============================================================================

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

// =============================================================================
// SECTION: COMMON COMBINATIONS
// =============================================================================

/**
 * Common middleware combination types for better DX.
 */
export type WithDebugging<M extends BaseMachine<any>> = WithTimeTravel<WithSnapshot<WithHistory<M>>>;

/**
 * Convenience function for the most common debugging middleware stack.
 */
export function withDebugging<M extends BaseMachine<any>>(machine: M): WithDebugging<M> {
  return withTimeTravel(withSnapshot(withHistory(machine)));
}