"use strict";
/**
 * @file Middleware composition and pipeline utilities
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MiddlewareBuilder = void 0;
exports.compose = compose;
exports.composeTyped = composeTyped;
exports.chain = chain;
exports.when = when;
exports.inDevelopment = inDevelopment;
exports.whenContext = whenContext;
exports.createMiddlewareRegistry = createMiddlewareRegistry;
exports.createPipeline = createPipeline;
exports.combine = combine;
exports.branch = branch;
exports.isMiddlewareFn = isMiddlewareFn;
exports.isConditionalMiddleware = isConditionalMiddleware;
exports.isMiddlewareResult = isMiddlewareResult;
exports.isMiddlewareContext = isMiddlewareContext;
exports.isMiddlewareError = isMiddlewareError;
exports.isMiddlewareHooks = isMiddlewareHooks;
exports.isMiddlewareOptions = isMiddlewareOptions;
exports.isNamedMiddleware = isNamedMiddleware;
exports.isPipelineConfig = isPipelineConfig;
exports.middlewareBuilder = middlewareBuilder;
exports.createMiddlewareFactory = createMiddlewareFactory;
exports.withDebugging = withDebugging;
const core_1 = require("./core");
const history_1 = require("./history");
const snapshot_1 = require("./snapshot");
const time_travel_1 = require("./time-travel");
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
function compose(machine, ...middlewares) {
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
function composeTyped(machine, ...middlewares) {
    return middlewares.reduce((acc, middleware) => middleware(acc), machine);
}
// =============================================================================
// SECTION: FLUENT API
// =============================================================================
/**
 * Fluent middleware composer for building complex middleware chains.
 * Provides excellent TypeScript inference and IntelliSense.
 */
class MiddlewareChainBuilder {
    constructor(machine) {
        this.machine = machine;
    }
    /**
     * Add a middleware to the composition chain.
     * @param middleware - The middleware function to add
     * @returns A new composer with the middleware applied
     */
    with(middleware) {
        const result = middleware(this.machine);
        return new MiddlewareChainBuilder(result);
    }
    /**
     * Build the final machine with all middlewares applied.
     */
    build() {
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
function chain(machine) {
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
function when(middleware, predicate) {
    const conditional = function (machine) {
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
function inDevelopment(middleware) {
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
function whenContext(key, value, middleware) {
    return when(middleware, (machine) => machine.context[key] === value);
}
// =============================================================================
// SECTION: MIDDLEWARE REGISTRY
// =============================================================================
/**
 * Create a middleware registry for managing reusable middleware configurations.
 */
function createMiddlewareRegistry() {
    const registry = new Map();
    return {
        /**
         * Register a middleware by name.
         */
        register(name, middleware, description, priority) {
            if (registry.has(name)) {
                throw new Error(`Middleware '${name}' is already registered`);
            }
            registry.set(name, { name, middleware, description, priority });
            return this;
        },
        /**
         * Unregister a middleware by name.
         */
        unregister(name) {
            return registry.delete(name);
        },
        /**
         * Check if a middleware is registered.
         */
        has(name) {
            return registry.has(name);
        },
        /**
         * Get a registered middleware by name.
         */
        get(name) {
            return registry.get(name);
        },
        /**
         * List all registered middlewares.
         */
        list() {
            return Array.from(registry.values()).sort((a, b) => { var _a, _b; return ((_a = a.priority) !== null && _a !== void 0 ? _a : 0) - ((_b = b.priority) !== null && _b !== void 0 ? _b : 0); });
        },
        /**
         * Apply a selection of registered middlewares to a machine.
         * Middlewares are applied in priority order (lowest to highest).
         */
        apply(machine, middlewareNames) {
            const middlewares = middlewareNames
                .map(name => {
                const entry = registry.get(name);
                if (!entry) {
                    throw new Error(`Middleware '${name}' is not registered`);
                }
                return entry;
            })
                .sort((a, b) => { var _a, _b; return ((_a = a.priority) !== null && _a !== void 0 ? _a : 0) - ((_b = b.priority) !== null && _b !== void 0 ? _b : 0); });
            return composeTyped(machine, ...middlewares.map(m => m.middleware));
        },
        /**
         * Apply all registered middlewares to a machine in priority order.
         */
        applyAll(machine) {
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
function createPipeline(config = {}) {
    const { continueOnError = false, logErrors = true, onError } = config;
    return (machine, ...middlewares) => {
        let currentMachine = machine;
        const errors = [];
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
                }
                else {
                    // Regular middleware
                    currentMachine = middleware(currentMachine);
                }
            }
            catch (error) {
                success = false;
                if (!continueOnError) {
                    throw error;
                }
                errors.push({
                    error: error,
                    middlewareIndex: i,
                    middlewareName: middleware.name
                });
                if (logErrors) {
                    console.error(`Pipeline middleware error at index ${i}:`, error);
                }
                onError === null || onError === void 0 ? void 0 : onError(error, i, middleware.name);
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
function combine(...middlewares) {
    return (machine) => composeTyped(machine, ...middlewares);
}
/**
 * Create a middleware that applies different middlewares based on context.
 */
function branch(branches, fallback) {
    return (machine) => {
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
 * Enhanced type guard to check if a value is a middleware function with better inference.
 */
function isMiddlewareFn(value) {
    return typeof value === 'function' && value.length === 1;
}
/**
 * Enhanced type guard to check if a value is a conditional middleware with better inference.
 */
function isConditionalMiddleware(value) {
    return (value !== null &&
        (typeof value === 'object' || typeof value === 'function') &&
        'middleware' in value &&
        'when' in value &&
        isMiddlewareFn(value.middleware) &&
        typeof value.when === 'function');
}
/**
 * Type guard to check if a value is a middleware result with strict type checking.
 */
function isMiddlewareResult(value, contextType) {
    return (value !== null &&
        typeof value === 'object' &&
        'transitionName' in value &&
        'prevContext' in value &&
        'nextContext' in value &&
        'args' in value &&
        typeof value.transitionName === 'string' &&
        Array.isArray(value.args) &&
        (!contextType || (isValidContext(value.prevContext, contextType) &&
            isValidContext(value.nextContext, contextType))));
}
/**
 * Type guard to check if a value is middleware context with strict type checking.
 */
function isMiddlewareContext(value, contextType) {
    return (value !== null &&
        typeof value === 'object' &&
        'transitionName' in value &&
        'context' in value &&
        'args' in value &&
        typeof value.transitionName === 'string' &&
        Array.isArray(value.args) &&
        (!contextType || isValidContext(value.context, contextType)));
}
/**
 * Type guard to check if a value is middleware error with strict type checking.
 */
function isMiddlewareError(value, contextType) {
    return (value !== null &&
        typeof value === 'object' &&
        'transitionName' in value &&
        'context' in value &&
        'args' in value &&
        'error' in value &&
        typeof value.transitionName === 'string' &&
        Array.isArray(value.args) &&
        value.error instanceof Error &&
        (!contextType || isValidContext(value.context, contextType)));
}
/**
 * Type guard to check if a value is middleware hooks with strict type checking.
 */
function isMiddlewareHooks(value, _contextType) {
    if (value === null || typeof value !== 'object')
        return false;
    const hooks = value;
    // Check before hook
    if ('before' in hooks && hooks.before !== undefined) {
        if (typeof hooks.before !== 'function')
            return false;
    }
    // Check after hook
    if ('after' in hooks && hooks.after !== undefined) {
        if (typeof hooks.after !== 'function')
            return false;
    }
    // Check error hook
    if ('error' in hooks && hooks.error !== undefined) {
        if (typeof hooks.error !== 'function')
            return false;
    }
    return true;
}
/**
 * Type guard to check if a value is middleware options with strict type checking.
 */
function isMiddlewareOptions(value) {
    return (value === undefined ||
        (value !== null &&
            typeof value === 'object' &&
            ('continueOnError' in value ? typeof value.continueOnError === 'boolean' : true) &&
            ('logErrors' in value ? typeof value.logErrors === 'boolean' : true) &&
            ('onError' in value ? typeof value.onError === 'function' || value.onError === undefined : true)));
}
/**
 * Helper function to validate context objects.
 */
function isValidContext(value, _contextType) {
    return value !== null && typeof value === 'object';
}
/**
 * Type guard to check if a value is a named middleware with strict type checking.
 */
function isNamedMiddleware(value) {
    return (value !== null &&
        typeof value === 'object' &&
        'name' in value &&
        'middleware' in value &&
        typeof value.name === 'string' &&
        isMiddlewareFn(value.middleware) &&
        ('description' in value ? typeof value.description === 'string' || value.description === undefined : true) &&
        ('priority' in value ? typeof value.priority === 'number' || value.priority === undefined : true));
}
/**
 * Type guard to check if a value is pipeline config with strict type checking.
 */
function isPipelineConfig(value) {
    return (value === undefined ||
        (value !== null &&
            typeof value === 'object' &&
            ('continueOnError' in value ? typeof value.continueOnError === 'boolean' : true) &&
            ('logErrors' in value ? typeof value.logErrors === 'boolean' : true) &&
            ('onError' in value ? typeof value.onError === 'function' || value.onError === undefined : true)));
}
/**
 * Generic middleware builder with perfect TypeScript inference.
 * Provides a fluent API for configuring and applying middleware.
 */
class MiddlewareBuilder {
    constructor(machine) {
        this.machine = machine;
        this.middlewares = [];
    }
    /**
     * Add logging middleware with type-safe configuration.
     */
    withLogging(options) {
        this.middlewares.push((machine) => (0, core_1.withLogging)(machine, options));
        return this;
    }
    /**
     * Add analytics middleware with type-safe configuration.
     */
    withAnalytics(track, options) {
        this.middlewares.push((machine) => (0, core_1.withAnalytics)(machine, track, options));
        return this;
    }
    /**
     * Add validation middleware with type-safe configuration.
     */
    withValidation(validator, _options) {
        this.middlewares.push((machine) => (0, core_1.withValidation)(machine, validator));
        return this;
    }
    /**
     * Add permission checking middleware with type-safe configuration.
     */
    withPermissions(checker) {
        this.middlewares.push((machine) => (0, core_1.withPermissions)(machine, checker));
        return this;
    }
    /**
     * Add error reporting middleware with type-safe configuration.
     */
    withErrorReporting(reporter, options) {
        this.middlewares.push((machine) => (0, core_1.withErrorReporting)(machine, reporter, options));
        return this;
    }
    /**
     * Add performance monitoring middleware with type-safe configuration.
     */
    withPerformanceMonitoring(tracker, _options) {
        this.middlewares.push((machine) => (0, core_1.withPerformanceMonitoring)(machine, tracker));
        return this;
    }
    /**
     * Add retry middleware with type-safe configuration.
     */
    withRetry(options) {
        this.middlewares.push((machine) => (0, core_1.withRetry)(machine, options));
        return this;
    }
    /**
     * Add history tracking middleware with type-safe configuration.
     */
    withHistory(options) {
        this.middlewares.push((machine) => (0, history_1.withHistory)(machine, options));
        return this;
    }
    /**
     * Add snapshot tracking middleware with type-safe configuration.
     */
    withSnapshot(options) {
        this.middlewares.push((machine) => (0, snapshot_1.withSnapshot)(machine, options));
        return this;
    }
    /**
     * Add time travel middleware with type-safe configuration.
     */
    withTimeTravel(options) {
        this.middlewares.push((machine) => (0, time_travel_1.withTimeTravel)(machine, options));
        return this;
    }
    /**
     * Add debugging middleware (combination of history, snapshot, and time travel).
     */
    withDebugging() {
        this.middlewares.push((machine) => withDebugging(machine));
        return this;
    }
    /**
     * Add a custom middleware function.
     */
    withCustom(middleware) {
        this.middlewares.push(middleware);
        return this;
    }
    /**
     * Add a conditional middleware.
     */
    withConditional(middleware, predicate) {
        this.middlewares.push(when(middleware, predicate));
        return this;
    }
    /**
     * Build the final machine with all configured middleware applied.
     */
    build() {
        let result = this.machine;
        for (const middleware of this.middlewares) {
            result = middleware(result);
        }
        return result;
    }
    /**
     * Get the middleware chain without building (for inspection or further composition).
     */
    getChain() {
        return [...this.middlewares];
    }
    /**
     * Clear all configured middleware.
     */
    clear() {
        this.middlewares = [];
        return this;
    }
}
exports.MiddlewareBuilder = MiddlewareBuilder;
/**
 * Create a typed middleware builder for a machine.
 * Provides perfect TypeScript inference for middleware configuration.
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
function middlewareBuilder(machine) {
    return new MiddlewareBuilder(machine);
}
/**
 * Create a middleware factory function with pre-configured options.
 * Useful for creating reusable middleware configurations.
 */
function createMiddlewareFactory(defaultOptions = {}) {
    return {
        create: (machine) => {
            const builder = middlewareBuilder(machine);
            if (defaultOptions.logging) {
                builder.withLogging(defaultOptions.logging);
            }
            if (defaultOptions.analytics) {
                builder.withAnalytics(defaultOptions.analytics.track, defaultOptions.analytics.options);
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
/**
 * Convenience function for the most common debugging middleware stack.
 */
function withDebugging(machine) {
    return (0, time_travel_1.withTimeTravel)((0, snapshot_1.withSnapshot)((0, history_1.withHistory)(machine)));
}
