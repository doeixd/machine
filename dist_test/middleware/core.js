"use strict";
/**
 * @file Core middleware types and basic middleware creation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CANCEL = void 0;
exports.createMiddleware = createMiddleware;
exports.withLogging = withLogging;
exports.withAnalytics = withAnalytics;
exports.withValidation = withValidation;
exports.withPermissions = withPermissions;
exports.withErrorReporting = withErrorReporting;
exports.withPerformanceMonitoring = withPerformanceMonitoring;
exports.withRetry = withRetry;
exports.createCustomMiddleware = createCustomMiddleware;
/**
 * Symbol used to cancel a transition from a before hook.
 */
exports.CANCEL = Symbol('CANCEL');
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
function createMiddleware(machine, hooks, options = {}) {
    const { continueOnError = false, logErrors = true, onError } = options;
    // Create a wrapped machine that intercepts all transition calls
    const wrappedMachine = { ...machine };
    // Copy any extra properties from the original machine (for middleware composition)
    for (const prop in machine) {
        if (!Object.prototype.hasOwnProperty.call(machine, prop))
            continue;
        if (prop !== 'context' && typeof machine[prop] !== 'function') {
            wrappedMachine[prop] = machine[prop];
        }
    }
    // Wrap each transition function
    for (const prop in machine) {
        if (!Object.prototype.hasOwnProperty.call(machine, prop))
            continue;
        const value = machine[prop];
        if (typeof value === 'function' && prop !== 'context') {
            wrappedMachine[prop] = function (...args) {
                const transitionName = prop;
                const context = wrappedMachine.context;
                // Helper function to execute the transition and after hooks
                const executeTransition = () => {
                    // 2. Execute the actual transition
                    let nextMachine;
                    try {
                        nextMachine = value.apply(this, args);
                    }
                    catch (error) {
                        // 3. Execute error hooks if transition failed
                        if (hooks.error) {
                            try {
                                // Error hooks are called synchronously for now
                                hooks.error({
                                    transitionName,
                                    context,
                                    args: [...args],
                                    error: error
                                });
                            }
                            catch (hookError) {
                                if (!continueOnError)
                                    throw hookError;
                                if (logErrors)
                                    console.error(`Middleware error hook error for ${transitionName}:`, hookError);
                                onError === null || onError === void 0 ? void 0 : onError(hookError, 'error', { transitionName, context, args, error });
                            }
                        }
                        throw error; // Re-throw the original error
                    }
                    // Ensure the returned machine has the same extra properties as the wrapped machine
                    const ensureMiddlewareProperties = (machine) => {
                        if (machine && typeof machine === 'object' && machine.context) {
                            // Copy extra properties from the wrapped machine to the returned machine
                            for (const prop in wrappedMachine) {
                                if (!Object.prototype.hasOwnProperty.call(wrappedMachine, prop))
                                    continue;
                                if (prop !== 'context' && !(prop in machine)) {
                                    machine[prop] = wrappedMachine[prop];
                                }
                            }
                            // Also wrap the transition functions on the returned machine
                            for (const prop in machine) {
                                if (!Object.prototype.hasOwnProperty.call(machine, prop))
                                    continue;
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
                        const asyncResult = nextMachine.then((resolvedMachine) => {
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
                                }
                                catch (error) {
                                    if (!continueOnError)
                                        throw error;
                                    if (logErrors)
                                        console.error(`Middleware after hook error for ${transitionName}:`, error);
                                    onError === null || onError === void 0 ? void 0 : onError(error, 'after', {
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
                    }
                    else {
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
                                    return result.then(() => nextMachine).catch((error) => {
                                        if (!continueOnError)
                                            throw error;
                                        if (logErrors)
                                            console.error(`Middleware after hook error for ${transitionName}:`, error);
                                        onError === null || onError === void 0 ? void 0 : onError(error, 'after', {
                                            transitionName,
                                            prevContext: context,
                                            nextContext: nextMachine.context,
                                            args
                                        });
                                        return nextMachine;
                                    });
                                }
                            }
                            catch (error) {
                                if (!continueOnError)
                                    throw error;
                                if (logErrors)
                                    console.error(`Middleware after hook error for ${transitionName}:`, error);
                                onError === null || onError === void 0 ? void 0 : onError(error, 'after', {
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
                            return result.then((hookResult) => {
                                if (hookResult === exports.CANCEL) {
                                    return wrappedMachine;
                                }
                                return executeTransition();
                            }).catch((error) => {
                                if (!continueOnError)
                                    throw error;
                                if (logErrors)
                                    console.error(`Middleware before hook error for ${transitionName}:`, error);
                                onError === null || onError === void 0 ? void 0 : onError(error, 'before', { transitionName, context, args });
                                return executeTransition();
                            });
                        }
                        // Check if transition should be cancelled
                        if (result === exports.CANCEL) {
                            return wrappedMachine; // Return the same machine instance
                        }
                    }
                    catch (error) {
                        if (!continueOnError)
                            throw error;
                        if (logErrors)
                            console.error(`Middleware before hook error for ${transitionName}:`, error);
                        onError === null || onError === void 0 ? void 0 : onError(error, 'before', { transitionName, context, args });
                    }
                }
                ;
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
function withLogging(machine, options = {}) {
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
function withAnalytics(machine, track, options = {}) {
    const { eventPrefix = 'state_transition', includePrevContext = false, includeArgs = false } = options;
    return createMiddleware(machine, {
        after: ({ transitionName, prevContext, nextContext, args }) => {
            const event = `${eventPrefix}.${transitionName}`;
            const data = { transition: transitionName };
            if (includePrevContext)
                data.from = prevContext;
            data.to = nextContext;
            if (includeArgs)
                data.args = args;
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
function withValidation(machine, validator) {
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
function withPermissions(machine, checker) {
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
function withErrorReporting(machine, reporter, options = {}) {
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
function withPerformanceMonitoring(machine, tracker) {
    const startTimes = new Map();
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
function withRetry(machine, options = {}) {
    var _a, _b;
    const { maxAttempts = (_a = options.maxRetries) !== null && _a !== void 0 ? _a : 3, shouldRetry = () => true, backoffMs = (_b = options.delay) !== null && _b !== void 0 ? _b : 100, backoffMultiplier = 2, onRetry } = options;
    // Create a wrapped machine that adds retry logic
    const wrappedMachine = { ...machine };
    // Wrap each transition function with retry logic
    for (const prop in machine) {
        if (!Object.prototype.hasOwnProperty.call(machine, prop))
            continue;
        const value = machine[prop];
        if (typeof value === 'function' && prop !== 'context') {
            wrappedMachine[prop] = async function (...args) {
                let lastError;
                let attempt = 0;
                while (attempt < maxAttempts) {
                    try {
                        return await value.apply(this, args);
                    }
                    catch (error) {
                        lastError = error;
                        attempt++;
                        if (attempt < maxAttempts && shouldRetry(lastError, attempt)) {
                            onRetry === null || onRetry === void 0 ? void 0 : onRetry(lastError, attempt);
                            const baseDelay = typeof backoffMs === 'function' ? backoffMs(attempt) : backoffMs;
                            const delay = baseDelay * Math.pow(backoffMultiplier, attempt - 1);
                            await new Promise(resolve => setTimeout(resolve, delay));
                        }
                        else {
                            throw lastError;
                        }
                    }
                }
                throw lastError;
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
function createCustomMiddleware(hooks, options) {
    return (machine) => createMiddleware(machine, hooks, options);
}
