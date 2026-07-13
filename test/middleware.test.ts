import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createMachine,
  createAsyncMachine,
  CANCEL,
  createMiddleware,
  withLogging,
  withAnalytics,
  withValidation,
  withPermissions,
  withErrorReporting,
  withPerformanceMonitoring,
  withRetry,
  withHistory,
  withSnapshot,
  withTimeTravel,
  compose,
  createCustomMiddleware,
  composeTyped,
  createPipeline,
  createMiddlewareRegistry,
  when,
  inDevelopment,
  whenContext,
  combine,
  branch,
  isMiddlewareFn,
  isConditionalMiddleware,
  type MiddlewareContext,
  type MiddlewareResult,
  type MiddlewareError
} from '../src/index';

describe('createMiddleware', () => {
  it('should call before hook before transition', async () => {
    const beforeHook = vi.fn();
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const instrumented = createMiddleware(machine, { before: beforeHook });
    instrumented.increment.call(instrumented);

    expect(beforeHook).toHaveBeenCalledWith({
      transitionName: 'increment',
      context: { count: 0 },
      args: []
    });
  });

  it('should call after hook after transition', async () => {
    const afterHook = vi.fn();
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const instrumented = createMiddleware(machine, { after: afterHook });
    instrumented.increment.call(instrumented);

    expect(afterHook).toHaveBeenCalledWith({
      transitionName: 'increment',
      prevContext: { count: 0 },
      nextContext: { count: 1 },
      args: []
    });
  });

  it('should call error hook on transition failure', async () => {
    const errorHook = vi.fn();
    const machine = createMachine({ count: 0 }, {
      throwError: function() {
        throw new Error('Test error');
      }
    });

    const instrumented = createMiddleware(machine, { error: errorHook });

    expect(() => {
      instrumented.throwError.call(instrumented);
    }).toThrow('Test error');

    expect(errorHook).toHaveBeenCalled();
    const call = errorHook.mock.calls[0][0] as MiddlewareError<{ count: number }>;
    expect(call.transitionName).toBe('throwError');
    expect(call.error.message).toBe('Test error');
  });

  it('should recover from synchronous transition failures with a fallback machine', () => {
    const machine = createMachine({ count: 0 }, {
      fail() {
        throw new Error('failed');
      },
      increment() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });
    const instrumented = createMiddleware(machine, {
      error: () => createMachine({ count: 10 }, machine),
    });

    const recovered = instrumented.fail.call(instrumented);
    const next = recovered.increment.call(recovered);

    expect(recovered.context.count).toBe(10);
    expect(next.context.count).toBe(11);
  });

  it('should recover from rejected transitions with an async fallback', async () => {
    const errorHook = vi.fn(async () => createAsyncMachine({ count: 10 }, machine));
    const machine = createAsyncMachine({ count: 0 }, {
      async fail() {
        throw new Error('failed');
      },
      async increment() {
        return createAsyncMachine({ count: this.context.count + 1 }, this);
      }
    });
    const instrumented = createMiddleware(machine, { error: errorHook });

    const recovered = await instrumented.fail.call(instrumented);
    const next = await recovered.increment.call(recovered);

    expect(errorHook).toHaveBeenCalledWith(expect.objectContaining({
      transitionName: 'fail',
      error: expect.objectContaining({ message: 'failed' }),
    }));
    expect(recovered.context.count).toBe(10);
    expect(next.context.count).toBe(11);
  });

  it('should not retry a rejected transition as a before-hook failure', async () => {
    let attempts = 0;
    const machine = createAsyncMachine({ count: 0 }, {
      async fail() {
        attempts += 1;
        throw new Error('failed');
      }
    });
    const instrumented = createMiddleware(machine, {
      before: async () => undefined,
      error: () => undefined,
    }, { continueOnError: true, logErrors: false });

    await expect(instrumented.fail.call(instrumented)).rejects.toThrow('failed');
    expect(attempts).toBe(1);
  });

  it('should apply continueOnError to async after hooks on async transitions', async () => {
    const onError = vi.fn();
    const machine = createAsyncMachine({ count: 0 }, {
      async increment() {
        return createAsyncMachine({ count: this.context.count + 1 }, this);
      }
    });
    const instrumented = createMiddleware(machine, {
      after: async () => {
        throw new Error('after failed');
      },
    }, { continueOnError: true, logErrors: false, onError });

    const result = await instrumented.increment.call(instrumented);

    expect(result.context.count).toBe(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'after failed' }),
      'after',
      expect.objectContaining({ nextContext: { count: 1 } }),
    );
  });

  it('should pass arguments to hooks', async () => {
    const beforeHook = vi.fn();
    const machine = createMachine({ count: 0 }, {
      add: function(n: number) {
        return createMachine({ count: this.context.count + n }, this);
      }
    });

    const instrumented = createMiddleware(machine, { before: beforeHook });
    instrumented.add.call(instrumented, 5);

    expect(beforeHook).toHaveBeenCalledWith({
      transitionName: 'add',
      context: { count: 0 },
      args: [5]
    });
  });

  it('should not wrap context property', () => {
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const instrumented = createMiddleware(machine, {});
    expect(instrumented.context).toEqual({ count: 0 });
  });

  it('should preserve this binding', async () => {
    const machine = createMachine({ count: 5 }, {
      double: function() {
        return createMachine({ count: this.context.count * 2 }, this);
      }
    });

    const instrumented = createMiddleware(machine, {});
    const result = instrumented.double.call(instrumented);

    expect(result.context.count).toBe(10);
  });

  it('should report the current context after chained transitions', () => {
    const beforeHook = vi.fn();
    const afterHook = vi.fn();
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    let instrumented = createMiddleware(machine, {
      before: beforeHook,
      after: afterHook,
    });
    instrumented = instrumented.increment.call(instrumented);
    instrumented = instrumented.increment.call(instrumented);

    expect(beforeHook.mock.calls.map(([call]) => call.context.count)).toEqual([0, 1]);
    expect(afterHook.mock.calls.map(([call]) => call.prevContext.count)).toEqual([0, 1]);
    expect(afterHook.mock.calls.map(([call]) => call.nextContext.count)).toEqual([1, 2]);
  });

  it('should wrap prototype transition methods across chained snapshots', () => {
    class Counter {
      constructor(readonly context: { count: number }) {}

      increment() {
        return new Counter({ count: this.context.count + 1 });
      }
    }

    const afterHook = vi.fn();
    let instrumented = createMiddleware(new Counter({ count: 0 }), { after: afterHook });
    instrumented = instrumented.increment.call(instrumented);
    instrumented = instrumented.increment.call(instrumented);

    expect(instrumented.context.count).toBe(2);
    expect(afterHook.mock.calls.map(([call]) => call.prevContext.count)).toEqual([0, 1]);
  });

  it('should return the current snapshot when a chained transition is canceled', () => {
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    let cancel = false;
    let instrumented = createMiddleware(machine, {
      before: () => cancel ? CANCEL : undefined,
    });
    instrumented = instrumented.increment.call(instrumented);
    cancel = true;

    const canceled = instrumented.increment.call(instrumented);
    expect(canceled).toBe(instrumented);
    expect(canceled.context.count).toBe(1);
  });

  it('should return the current snapshot when an async hook cancels a chained transition', async () => {
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    let cancel = false;
    let instrumented = createMiddleware(machine, {
      before: async () => cancel ? CANCEL : undefined,
    });
    instrumented = await instrumented.increment.call(instrumented);
    cancel = true;

    const canceled = await instrumented.increment.call(instrumented);
    expect(canceled).toBe(instrumented);
    expect(canceled.context.count).toBe(1);
  });

  it('should handle async transitions', async () => {
    const beforeHook = vi.fn();
    const afterHook = vi.fn();

    const machine = createAsyncMachine({ count: 0 }, {
      asyncIncrement: async function() {
        await new Promise(resolve => setTimeout(resolve, 10));
        return createAsyncMachine({ count: this.context.count + 1 }, this);
      }
    });

    const instrumented = createMiddleware(machine, {
      before: beforeHook,
      after: afterHook
    });

    const result = await instrumented.asyncIncrement.call(instrumented);

    expect(beforeHook).toHaveBeenCalled();
    expect(afterHook).toHaveBeenCalled();
    expect(result.context.count).toBe(1);
  });

  it('should allow before hook to prevent transition by throwing', async () => {
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const instrumented = createMiddleware(machine, {
      before: ({ transitionName }) => {
        if (transitionName === 'increment') {
          throw new Error('Blocked');
        }
      }
    });

    expect(() => {
      instrumented.increment.call(instrumented);
    }).toThrow('Blocked');
  });
});

describe('withLogging', () => {
  it('should log transition calls', async () => {
    const logger = vi.fn();
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const logged = withLogging(machine, { logger });
    logged.increment.call(logged);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logger).toHaveBeenCalledWith('→ increment');
    expect(logger).toHaveBeenCalledWith('✓ increment {"count":1}');
  });

  it('should include arguments in logs when enabled', async () => {
    const logger = vi.fn();
    const machine = createMachine({ count: 0 }, {
      add: function(n: number) {
        return createMachine({ count: this.context.count + n }, this);
      }
    });

    const logged = withLogging(machine, { logger, includeArgs: true });
    logged.add.call(logged, 5);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logger).toHaveBeenCalledWith('→ add [5]');
  });

  it('should not include context when disabled', async () => {
    const logger = vi.fn();
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const logged = withLogging(machine, { logger, includeContext: false });
    logged.increment.call(logged);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logger).toHaveBeenCalledWith('✓ increment');
  });
});

describe('withAnalytics', () => {
  it('should track state transitions', async () => {
    const track = vi.fn();
    const machine = createMachine({ count: 0, status: 'idle' }, {
      start: function() {
        return createMachine({ count: 0, status: 'running' }, this);
      }
    });

    const tracked = withAnalytics(machine, track);
    tracked.start.call(tracked);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(track).toHaveBeenCalledWith(
      'state_transition.start',
      expect.objectContaining({
        transition: 'start',
        to: { count: 0, status: 'running' }
      })
    );
  });

  it('should include previous context when enabled', async () => {
    const track = vi.fn();
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const tracked = withAnalytics(machine, track, { includePrevContext: true });
    tracked.increment.call(tracked);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(track).toHaveBeenCalledWith(
      'state_transition.increment',
      expect.objectContaining({
        from: { count: 0 },
        to: { count: 1 }
      })
    );
  });

  it('should use custom event prefix', async () => {
    const track = vi.fn();
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const tracked = withAnalytics(machine, track, { eventPrefix: 'custom_event' });
    tracked.increment.call(tracked);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(track).toHaveBeenCalledWith('custom_event.increment', expect.any(Object));
  });
});

describe('withValidation', () => {
  it('should validate transitions before execution', async () => {
    const machine = createMachine({ count: 0 }, {
      decrement: function() {
        return createMachine({ count: this.context.count - 1 }, this);
      }
    });

    const validated = withValidation(machine, ({ transitionName, context }) => {
      if (transitionName === 'decrement' && context.count === 0) {
        throw new Error('Cannot decrement below zero');
      }
    });

    expect(() => {
      validated.decrement.call(validated);
    }).toThrow('Cannot decrement below zero');
  });

  it('should allow valid transitions', async () => {
    const machine = createMachine({ count: 5 }, {
      decrement: function() {
        return createMachine({ count: this.context.count - 1 }, this);
      }
    });

    const validated = withValidation(machine, ({ transitionName, context }) => {
      if (transitionName === 'decrement' && context.count === 0) {
        throw new Error('Cannot decrement below zero');
      }
    });

    const result = await validated.decrement.call(validated);
    expect(result.context.count).toBe(4);
  });

  it('should throw if validation returns false', async () => {
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const validated = withValidation(machine, () => false);

    expect(() => {
      validated.increment.call(validated);
    }).toThrow('Validation failed');
  });
});

describe('withPermissions', () => {
  it('should block unauthorized transitions', async () => {
    const machine = createMachine({ count: 0 }, {
      adminAction: function() {
        return createMachine({ count: 999 }, this);
      }
    });

    const protectedMachine = withPermissions(machine, ({ transitionName }) => {
      return transitionName !== 'adminAction';
    });

    expect(() => {
      protectedMachine.adminAction.call(protectedMachine);
    }).toThrow('Unauthorized transition: adminAction');
  });

  it('should allow authorized transitions', async () => {
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const protectedMachine = withPermissions(machine, () => true);

    const result = await protectedMachine.increment.call(protectedMachine);
    expect(result.context.count).toBe(1);
  });
});

describe('withErrorReporting', () => {
  it('should report errors to error tracking service', async () => {
    const captureError = vi.fn();
    const machine = createMachine({ count: 0 }, {
      throwError: function() {
        throw new Error('Test error');
      }
    });

    const monitored = withErrorReporting(machine, captureError);

    expect(() => {
      monitored.throwError.call(monitored);
    }).toThrow('Test error');

    expect(captureError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Test error' }),
      expect.objectContaining({
        transition: 'throwError',
        context: { count: 0 }
      })
    );
  });

  it('should include args in error context when enabled', async () => {
    const captureError = vi.fn();
    const machine = createMachine({ count: 0 }, {
      throwWithArgs: function(n: number) {
        throw new Error('Test error');
      }
    });

    const monitored = withErrorReporting(machine, captureError, { includeArgs: true });

    expect(() => {
      monitored.throwWithArgs.call(monitored, 42);
    }).toThrow('Test error');

    expect(captureError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        args: [42]
      })
    );
  });
});

describe('withPerformanceMonitoring', () => {
  it('should track transition execution time', async () => {
    const onMetric = vi.fn();
    const machine = createAsyncMachine({ count: 0 }, {
      slowTransition: async function() {
        await new Promise(resolve => setTimeout(resolve, 50));
        return createAsyncMachine({ count: 1 }, this);
      }
    });

    const monitored = withPerformanceMonitoring(machine, onMetric);
    await monitored.slowTransition.call(monitored);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(onMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        transitionName: 'slowTransition',
        duration: expect.any(Number),
        context: { count: 1 }
      })
    );

    const duration = onMetric.mock.calls[0][0].duration;
    expect(duration).toBeGreaterThanOrEqual(50);
  });
});

describe('withRetry', () => {
  it('should retry failed transitions', async () => {
    let attempts = 0;
    const machine = createAsyncMachine({ count: 0 }, {
      flaky: async function() {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return createAsyncMachine({ count: 1 }, this);
      }
    });

    const resilient = withRetry(machine, { maxRetries: 3, delay: 10 });
    const result = await resilient.flaky.call(resilient);

    expect(result.context.count).toBe(1);
    expect(attempts).toBe(3);
  });

  it('should call onRetry callback', async () => {
    let attempts = 0;
    const onRetry = vi.fn();

    const machine = createAsyncMachine({ count: 0 }, {
      flaky: async function() {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        return createAsyncMachine({ count: 1 }, this);
      }
    });

    const resilient = withRetry(machine, { maxRetries: 3, delay: 10, onRetry });
    await resilient.flaky.call(resilient);

    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
  });

  it('should not retry if shouldRetry returns false', async () => {
    let attempts = 0;
    const machine = createAsyncMachine({ count: 0 }, {
      permanent: async function() {
        attempts++;
        throw new Error('Permanent failure');
      }
    });

    const resilient = withRetry(machine, {
      maxRetries: 3,
      delay: 10,
      shouldRetry: (error) => !error.message.includes('Permanent')
    });

    await expect(resilient.permanent.call(resilient)).rejects.toThrow('Permanent failure');
    expect(attempts).toBe(1);
  });

  it('should apply exponential backoff', async () => {
    let attempts = 0;
    const timestamps: number[] = [];

    const machine = createAsyncMachine({ count: 0 }, {
      flaky: async function() {
        attempts++;
        timestamps.push(Date.now());
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return createAsyncMachine({ count: 1 }, this);
      }
    });

    const resilient = withRetry(machine, {
      maxRetries: 3,
      delay: 50,
      backoffMultiplier: 2
    });

    await resilient.flaky.call(resilient);

    // Check that delays increase exponentially (50ms, 100ms)
    const delay1 = timestamps[1] - timestamps[0];
    const delay2 = timestamps[2] - timestamps[1];

    expect(delay1).toBeGreaterThanOrEqual(45);
    expect(delay2).toBeGreaterThanOrEqual(95);
  });
});

describe('compose', () => {
  it('should compose multiple middleware functions', async () => {
    const logs: string[] = [];

    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const instrumented = compose(
      machine,
      (m) => withLogging(m, {
        logger: (msg) => logs.push(`log: ${msg}`)
      }),
      (m) => createMiddleware(m, {
        before: ({ transitionName }) => logs.push(`custom: ${transitionName}`)
      })
    );

    instrumented.increment.call(instrumented);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logs).toContain('log: → increment');
    expect(logs).toContain('custom: increment');
  });
});

describe('createCustomMiddleware', () => {
  it('should create reusable middleware', async () => {
    const logs: string[] = [];

    const myMiddleware = createCustomMiddleware({
      before: ({ transitionName }) => logs.push(`before: ${transitionName}`),
      after: ({ transitionName }) => logs.push(`after: ${transitionName}`)
    });

    const machine1 = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const machine2 = createMachine({ value: 'a' }, {
      change: function() {
        return createMachine({ value: 'b' }, this);
      }
    });

    const instrumented1 = myMiddleware(machine1);
    const instrumented2 = myMiddleware(machine2);

    instrumented1.increment.call(instrumented1);
    instrumented2.change.call(instrumented2);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logs).toContain('before: increment');
    expect(logs).toContain('after: increment');
    expect(logs).toContain('before: change');
    expect(logs).toContain('after: change');
  });
});

describe('Complex middleware scenarios', () => {
  it('should handle full middleware stack', async () => {
    const logs: string[] = [];
    const metrics: any[] = [];

    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      },
      add: function(n: number) {
        return createMachine({ count: this.context.count + n }, this);
      }
    });

    const instrumented = compose(
      machine,
      (m) => withLogging(m, { logger: (msg) => logs.push(msg) }),
      (m) => withValidation(m, ({ transitionName, context }) => {
        if (transitionName === 'add' && context.count >= 100) {
          throw new Error('Count too high');
        }
      }),
      (m) => withPerformanceMonitoring(m, (metric) => metrics.push(metric))
    );

    instrumented.increment.call(instrumented);
    instrumented.add.call(instrumented, 5);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(logs).toContain('→ increment');
    expect(logs).toContain('✓ increment {"count":1}');
    expect(metrics.length).toBeGreaterThan(0);
  });

  it('should preserve type safety through middleware', () => {
    const machine = createMachine({ count: 0 }, {
      increment: function(): typeof machine {
        return createMachine({ count: this.context.count + 1 }, this);
      },
      add: function(n: number): typeof machine {
        return createMachine({ count: this.context.count + n }, this);
      }
    });

    const instrumented = withLogging(machine);

    // TypeScript should allow these calls
    const result1 = instrumented.increment.call(instrumented);
    const result2 = instrumented.add.call(instrumented, 5);

    expect(result1.context.count).toBeDefined();
    expect(result2.context.count).toBeDefined();
  });
});

describe('composeTyped', () => {
  it('should compose middlewares with improved type inference', () => {
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const composed = composeTyped(
      machine,
      (m) => withHistory(m),
      (m) => withSnapshot(m)
    );

    // Should have both history and snapshots properties
    expect(composed.history).toBeDefined();
    expect(composed.snapshots).toBeDefined();

    composed.increment.call(composed);
    expect(composed.history).toHaveLength(1);
    expect(composed.snapshots).toHaveLength(1);
  });
});

describe('createPipeline', () => {
  it('should execute middlewares in pipeline with error handling', () => {
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const pipeline = createPipeline({ continueOnError: true });

    const failingMiddleware = () => {
      throw new Error('Test error');
    };

    const result = pipeline(
      machine,
      (m) => withHistory(m),
      failingMiddleware,
      (m) => withSnapshot(m)
    );

    expect(result.machine.history).toBeDefined();
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error.message).toBe('Test error');
    expect(result.success).toBe(false);
  });

  it('should handle conditional middlewares', () => {
    const machine = createMachine({ count: 0, debug: true }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1, debug: this.context.debug }, this);
      }
    });

    const pipeline = createPipeline();

    const result = pipeline(
      machine,
      (m) => withHistory(m),
      { middleware: (m) => withSnapshot(m), when: (m) => m.context.debug }
    );

    expect(result.machine.history).toBeDefined();
    expect(result.machine.snapshots).toBeDefined();
    expect(result.success).toBe(true);
  });
});

describe('createMiddlewareRegistry', () => {
  it('should register and apply named middlewares', () => {
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const registry = createMiddlewareRegistry<typeof machine>()
      .register('history', (m) => withHistory(m), 'Track transitions')
      .register('snapshot', (m) => withSnapshot(m), 'Take snapshots', 10);

    const applied = registry.apply(machine, ['history', 'snapshot']);

    expect(applied.history).toBeDefined();
    expect(applied.snapshots).toBeDefined();
  });

  it('should apply all middlewares in priority order', () => {
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const registry = createMiddlewareRegistry<typeof machine>()
      .register('low', (m) => ({ ...m, lowPriority: true }))
      .register('high', (m) => ({ ...m, highPriority: true }), '', 10);

    const applied = registry.applyAll(machine);

    expect(applied.lowPriority).toBe(true);
    expect(applied.highPriority).toBe(true);
  });
});

describe('when', () => {
  it('should conditionally apply middleware', () => {
    const machine = createMachine({ count: 0, enabled: true }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1, enabled: this.context.enabled }, this);
      }
    });

    const conditional = when((m) => withHistory(m), (m) => m.context.enabled);
    const applied = conditional(machine);

    expect(applied.history).toBeDefined();

    const disabledMachine = createMachine({ count: 0, enabled: false }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1, enabled: this.context.enabled }, this);
      }
    });

    const notApplied = conditional(disabledMachine);
    expect(notApplied.history).toBeUndefined();
  });
});

describe('inDevelopment', () => {
  it('should apply middleware only in development', () => {
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    // Mock development environment
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const devMiddleware = inDevelopment((m) => withHistory(m));
    const applied = devMiddleware(machine);

    expect(applied.history).toBeDefined();

    // Restore
    process.env.NODE_ENV = originalEnv;
  });
});

describe('whenContext', () => {
  it('should apply middleware based on context property', () => {
    const machine = createMachine({ count: 0, mode: 'debug' }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1, mode: this.context.mode }, this);
      }
    });

    const conditional = whenContext('mode', 'debug', (m) => withHistory(m));
    const applied = conditional(machine);

    expect(applied.history).toBeDefined();
  });
});

describe('combine', () => {
  it('should combine multiple middlewares', () => {
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const combined = combine(
      (m) => withHistory(m),
      (m) => withSnapshot(m)
    );
    const applied = combined(machine);

    expect(applied.history).toBeDefined();
    expect(applied.snapshots).toBeDefined();
  });
});

describe('branch', () => {
  it('should apply different middlewares based on conditions', () => {
    const debugMachine = createMachine({ count: 0, mode: 'debug' }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1, mode: this.context.mode }, this);
      }
    });

    const prodMachine = createMachine({ count: 0, mode: 'production' }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1, mode: this.context.mode }, this);
      }
    });

    const branching = branch([
      [(m) => m.context.mode === 'debug', (m) => withTimeTravel(m)],
      [(m) => m.context.mode === 'production', (m) => withHistory(m)]
    ]);

    const debugApplied = branching(debugMachine);
    const prodApplied = branching(prodMachine);

    expect(debugApplied.history).toBeDefined();
    expect(debugApplied.snapshots).toBeDefined();
    expect(debugApplied.replayFrom).toBeDefined();

    expect(prodApplied.history).toBeDefined();
    expect(prodApplied.snapshots).toBeUndefined();
  });
});

describe('type guards', () => {
  it('should identify middleware functions and conditional middlewares', () => {
    const machine = createMachine({ count: 0 }, {
      increment: function() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const middlewareFn = (m) => withHistory(m);
    const conditional = when((m) => withHistory(m), () => true);

    expect(isMiddlewareFn(middlewareFn)).toBe(true);
    expect(isConditionalMiddleware(conditional)).toBe(true);
    expect(isMiddlewareFn(conditional)).toBe(true); // Conditional middlewares are also callable functions
    expect(isConditionalMiddleware(middlewareFn)).toBe(false);
  });
});
