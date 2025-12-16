import { describe, it, expect } from 'vitest';
import {
  createContext,
  MachineBase,
  createMatcher,
  classCase,
  discriminantCase,
  customCase,
  forContext,
  type Machine
} from '../src/index';

// =============================================================================
// TEST FIXTURES: Class-based Machines
// =============================================================================

class IdleMachine extends MachineBase<{ status: 'idle' }> {
  constructor() {
    super({ status: 'idle' });
  }

  start() {
    return new LoadingMachine();
  }
}

class LoadingMachine extends MachineBase<{ status: 'loading'; startTime: number }> {
  constructor() {
    super({ status: 'loading', startTime: Date.now() });
  }

  success(data: string) {
    return new SuccessMachine(data);
  }

  error(err: Error) {
    return new ErrorMachine(err);
  }
}

class SuccessMachine extends MachineBase<{ status: 'success'; data: string }> {
  constructor(data: string) {
    super({ status: 'success', data });
  }

  reset() {
    return new IdleMachine();
  }
}

class ErrorMachine extends MachineBase<{ status: 'error'; error: Error }> {
  constructor(error: Error) {
    super({ status: 'error', error });
  }

  retry() {
    return new LoadingMachine();
  }

  reset() {
    return new IdleMachine();
  }
}

type FetchMachine = IdleMachine | LoadingMachine | SuccessMachine | ErrorMachine;

// =============================================================================
// TEST FIXTURES: Discriminated Union Machines
// =============================================================================

type UnionContext =
  | { state: 'idle' }
  | { state: 'loading'; progress: number }
  | { state: 'success'; result: string }
  | { state: 'error'; message: string };

// =============================================================================
// TESTS: API 1 - Type Guards
// =============================================================================

describe('createMatcher - API 1: Type Guards', () => {
  const match = createMatcher(
    classCase('idle', IdleMachine),
    classCase('loading', LoadingMachine),
    classCase('success', SuccessMachine),
    classCase('error', ErrorMachine)
  );

  describe('match.is.<case>', () => {
    it('should return true for matching type', () => {
      const machine: FetchMachine = new IdleMachine();
      expect(match.is.idle(machine)).toBe(true);
    });

    it('should return false for non-matching type', () => {
      const machine: FetchMachine = new LoadingMachine();
      expect(match.is.idle(machine)).toBe(false);
    });

    it('should narrow types correctly', () => {
      const machine: FetchMachine = new LoadingMachine();

      if (match.is.loading(machine)) {
        // TypeScript should know this is LoadingMachine
        expect(machine.context.status).toBe('loading');
        expect(typeof machine.context.startTime).toBe('number');
        expect(typeof machine.success).toBe('function');
        expect(typeof machine.error).toBe('function');
      } else {
        throw new Error('Should have matched loading');
      }
    });

    it('should work with success state', () => {
      const machine: FetchMachine = new SuccessMachine('test data');

      if (match.is.success(machine)) {
        expect(machine.context.data).toBe('test data');
        expect(typeof machine.reset).toBe('function');
      } else {
        throw new Error('Should have matched success');
      }
    });

    it('should work with error state', () => {
      const testError = new Error('test error');
      const machine: FetchMachine = new ErrorMachine(testError);

      if (match.is.error(machine)) {
        expect(machine.context.error).toBe(testError);
        expect(typeof machine.retry).toBe('function');
        expect(typeof machine.reset).toBe('function');
      } else {
        throw new Error('Should have matched error');
      }
    });

    it('should throw on unknown case name', () => {
      const machine: FetchMachine = new IdleMachine();

      expect(() => {
        (match.is as any).unknown(machine);
      }).toThrow('Unknown matcher case: "unknown"');
    });
  });

  describe('type narrowing in if-else chains', () => {
    it('should narrow correctly through multiple conditions', () => {
      const machine = new SuccessMachine('result') as unknown as FetchMachine;

      let message: string;
      if (match.is.idle(machine)) {
        message = 'idle';
      } else if (match.is.loading(machine)) {
        message = `loading: ${machine.context.startTime}`;
      } else if (match.is.success(machine)) {
        message = `success: ${machine.context.data}`;
      } else if (match.is.error(machine)) {
        message = `error: ${machine.context.error.message}`;
      } else {
        message = 'unknown';
      }

      expect(message).toBe('success: result');
    });
  });
});

// =============================================================================
// TESTS: API 2 - Exhaustive Pattern Matching
// =============================================================================

describe('createMatcher - API 2: Pattern Matching', () => {
  const match = createMatcher(
    classCase('idle', IdleMachine),
    classCase('loading', LoadingMachine),
    classCase('success', SuccessMachine),
    classCase('error', ErrorMachine)
  );

  describe('match.when(...).is(...)', () => {
    it('should execute correct handler for idle', () => {
      const machine: FetchMachine = new IdleMachine();

      const result = match.when(machine).is<string>(
        match.case.idle(() => 'Ready to start'),
        match.case.loading(() => 'Loading...'),
        match.case.success(() => 'Done'),
        match.case.error(() => 'Failed'),
        match.exhaustive
      );

      expect(result).toBe('Ready to start');
    });

    it('should execute correct handler for loading', () => {
      const machine: FetchMachine = new LoadingMachine();

      const result = match.when(machine).is<string>(
        match.case.idle(() => 'idle'),
        match.case.loading((m) => `Loading since ${m.context.startTime}`),
        match.case.success(() => 'success'),
        match.case.error(() => 'error'),
        match.exhaustive
      );

      expect(result).toContain('Loading since');
    });

    it('should execute correct handler for success', () => {
      const machine: FetchMachine = new SuccessMachine('test data');

      const result = match.when(machine).is<string>(
        match.case.idle(() => 'idle'),
        match.case.loading(() => 'loading'),
        match.case.success((m) => `Done: ${m.context.data}`),
        match.case.error(() => 'error'),
        match.exhaustive
      );

      expect(result).toBe('Done: test data');
    });

    it('should execute correct handler for error', () => {
      const testError = new Error('Something went wrong');
      const machine: FetchMachine = new ErrorMachine(testError);

      const result = match.when(machine).is<string>(
        match.case.idle(() => 'idle'),
        match.case.loading(() => 'loading'),
        match.case.success(() => 'success'),
        match.case.error((m) => `Error: ${m.context.error.message}`),
        match.exhaustive
      );

      expect(result).toBe('Error: Something went wrong');
    });

    it('should support different return types', () => {
      const machine: FetchMachine = new SuccessMachine('test');

      const result = match.when(machine).is<number>(
        match.case.idle(() => 0),
        match.case.loading(() => 50),
        match.case.success(() => 100),
        match.case.error(() => -1),
        match.exhaustive
      );

      expect(result).toBe(100);
    });

    it('should support object return types', () => {
      const machine: FetchMachine = new LoadingMachine();

      const result = match.when(machine).is<{ status: string; value: any }>(
        match.case.idle(() => ({ status: 'idle', value: null })),
        match.case.loading((m) => ({ status: 'loading', value: m.context.startTime })),
        match.case.success((m) => ({ status: 'success', value: m.context.data })),
        match.case.error((m) => ({ status: 'error', value: m.context.error })),
        match.exhaustive
      );

      expect(result.status).toBe('loading');
      expect(typeof result.value).toBe('number');
    });

    it('should throw error without exhaustiveness marker', () => {
      const machine: FetchMachine = new IdleMachine();

      expect(() => {
        (match.when(machine) as any).is(
          match.case.idle(() => 'idle')
          // Missing match.exhaustive
        );
      }).toThrow('must end with match.exhaustive');
    });

    it('should throw on unknown case in handler', () => {
      const machine: FetchMachine = new IdleMachine();

      expect(() => {
        (match.case as any).unknown(() => 'test');
      }).toThrow('Unknown matcher case');
    });

    it('should use first-match-wins semantics', () => {
      // If we had overlapping predicates, first would win
      const machine: FetchMachine = new IdleMachine();

      const result = match.when(machine).is<string>(
        match.case.idle(() => 'first'),
        match.case.loading(() => 'second'),
        match.case.success(() => 'third'),
        match.case.error(() => 'fourth'),
        match.exhaustive
      );

      expect(result).toBe('first');
    });
  });
});

// =============================================================================
// TESTS: API 3 - Simple Match
// =============================================================================

describe('createMatcher - API 3: Simple Match', () => {
  const match = createMatcher(
    classCase('idle', IdleMachine),
    classCase('loading', LoadingMachine),
    classCase('success', SuccessMachine),
    classCase('error', ErrorMachine)
  );

  describe('match(machine)', () => {
    it('should return case name for idle', () => {
      const machine: FetchMachine = new IdleMachine();
      expect(match(machine)).toBe('idle');
    });

    it('should return case name for loading', () => {
      const machine: FetchMachine = new LoadingMachine();
      expect(match(machine)).toBe('loading');
    });

    it('should return case name for success', () => {
      const machine: FetchMachine = new SuccessMachine('data');
      expect(match(machine)).toBe('success');
    });

    it('should return case name for error', () => {
      const machine: FetchMachine = new ErrorMachine(new Error('test'));
      expect(match(machine)).toBe('error');
    });

    it('should return null for non-matching machine', () => {
      class UnknownMachine extends MachineBase<{ status: 'unknown' }> {
        constructor() {
          super({ status: 'unknown' });
        }
      }

      const machine = new UnknownMachine();
      expect(match(machine as any)).toBe(null);
    });

    it('should use first-match-wins for overlapping predicates', () => {
      const machine: FetchMachine = new IdleMachine();
      expect(match(machine)).toBe('idle'); // First matching case
    });
  });
});

// =============================================================================
// TESTS: Helper Functions
// =============================================================================

describe('Helper Functions', () => {
  describe('classCase', () => {
    it('should create matcher case for class-based machines', () => {
      const [name, _, predicate] = classCase('idle', IdleMachine);

      expect(name).toBe('idle');
      expect(predicate(new IdleMachine())).toBe(true);
      expect(predicate(new LoadingMachine())).toBe(false);
    });

    it('should work with abstract classes', () => {
      abstract class AbstractMachine extends MachineBase<{ value: number }> { }

      class ConcreteMachine extends AbstractMachine {
        constructor() {
          super({ value: 42 });
        }
      }

      const [name, _, predicate] = classCase('concrete', ConcreteMachine);

      expect(name).toBe('concrete');
      expect(predicate(new ConcreteMachine())).toBe(true);
    });
  });

  describe('discriminantCase', () => {
    it('should create matcher case for discriminated unions', () => {
      type Context =
        | { status: 'idle' }
        | { status: 'loading' }
        | { status: 'success'; data: string };

      const match = createMatcher(
        discriminantCase<'idle', Machine<Context>, 'status', 'idle'>('idle', 'status', 'idle'),
        discriminantCase<'loading', Machine<Context>, 'status', 'loading'>('loading', 'status', 'loading'),
        discriminantCase<'success', Machine<Context>, 'status', 'success'>('success', 'status', 'success')
      );

      const idleMachine = createContext<Context>({ status: 'idle' });
      const loadingMachine = createContext<Context>({ status: 'loading' });
      const successMachine = createContext<Context>({ status: 'success', data: 'test' });

      expect(match.is.idle(idleMachine)).toBe(true);
      expect(match.is.loading(idleMachine)).toBe(false);

      expect(match(idleMachine)).toBe('idle');
      expect(match(loadingMachine)).toBe('loading');
      expect(match(successMachine)).toBe('success');
    });

    it('should narrow types correctly', () => {
      type Context =
        | { status: 'idle' }
        | { status: 'success'; data: string };

      const match = createMatcher(
        discriminantCase<'idle', Machine<Context>, 'status', 'idle'>('idle', 'status', 'idle'),
        discriminantCase<'success', Machine<Context>, 'status', 'success'>('success', 'status', 'success')
      );

      const successMachine = { context: { status: 'success' as const, data: 'result' } };

      if (match.is.success(successMachine)) {
        // Should be able to access data property
        expect(successMachine.context.data).toBe('result');
      } else {
        throw new Error('Should have matched success');
      }
    });
  });

  describe('forContext (improved DX)', () => {
    it('should provide better type inference with less boilerplate', () => {
      type FetchContext =
        | { status: 'idle' }
        | { status: 'loading'; startTime: number }
        | { status: 'success'; data: string };

      const builder = forContext<FetchContext>();

      const match = createMatcher(
        builder.case('idle', 'status', 'idle'),
        builder.case('loading', 'status', 'loading'),
        builder.case('success', 'status', 'success')
      );

      const idleMachine = createContext<FetchContext>({ status: 'idle' });
      const successMachine = createContext<FetchContext>({ status: 'success', data: 'result' });

      expect(match.is.idle(idleMachine)).toBe(true);
      expect(match(successMachine)).toBe('success');

      // Type narrowing works perfectly
      if (match.is.success(successMachine)) {
        expect(successMachine.context.data).toBe('result');
      }
    });

    it('should work seamlessly with createContext', () => {
      type AppContext =
        | { state: 'init' }
        | { state: 'ready'; config: object }
        | { state: 'error'; message: string };

      const builder = forContext<AppContext>();

      const match = createMatcher(
        builder.case('init', 'state', 'init'),
        builder.case('ready', 'state', 'ready'),
        builder.case('error', 'state', 'error')
      );

      const errorMachine = createContext<AppContext>({ state: 'error', message: 'Failed' });

      const result = match.when(errorMachine).is<string>(
        match.case.init(() => 'Initializing'),
        match.case.ready(() => 'Ready'),
        match.case.error(m => `Error: ${m.context.message}`),
        match.exhaustive
      );

      expect(result).toBe('Error: Failed');
    });
  });

  describe('customCase', () => {
    it('should create matcher case with custom predicate', () => {
      type CustomContext = { value: number; active: boolean };

      const match = createMatcher(
        customCase(
          'high',
          (m): m is Machine<CustomContext> => {
            return m.context.value > 50 && m.context.active;
          }
        ),
        customCase(
          'low',
          (m): m is Machine<CustomContext> => {
            return m.context.value <= 50;
          }
        ),
        customCase(
          'other',
          (m): m is Machine<CustomContext> => {
            return true; // Catch-all
          }
        )
      );

      const highMachine = { context: { value: 75, active: true } };
      const lowMachine = { context: { value: 25, active: false } };
      const inactiveMachine = { context: { value: 75, active: false } };

      expect(match(highMachine)).toBe('high');
      expect(match(lowMachine)).toBe('low');
      expect(match(inactiveMachine)).toBe('other'); // Doesn't match high or low, falls to catch-all
    });

    it('should support complex predicates', () => {
      class ComplexMachine extends MachineBase<{ items: string[]; count: number }> {
        constructor(items: string[], count: number) {
          super({ items, count });
        }
      }

      const match = createMatcher(
        customCase(
          'empty',
          (m): m is ComplexMachine => {
            return m instanceof ComplexMachine &&
              m.context.items.length === 0;
          }
        ),
        customCase(
          'full',
          (m): m is ComplexMachine => {
            return m instanceof ComplexMachine &&
              m.context.items.length >= m.context.count;
          }
        ),
        customCase(
          'partial',
          (m): m is ComplexMachine => {
            return m instanceof ComplexMachine;
          }
        )
      );

      const fullMachine = new ComplexMachine(['a', 'b', 'c'], 3);
      const emptyMachine = new ComplexMachine([], 0);
      const partialMachine = new ComplexMachine(['a'], 5);

      expect(match(fullMachine)).toBe('full');
      expect(match(emptyMachine)).toBe('empty'); // Checked first now
      expect(match(partialMachine)).toBe('partial');
    });
  });
});

// =============================================================================
// TESTS: Integration with Existing Utilities
// =============================================================================

describe('Integration Tests', () => {
  describe('with discriminated unions and hasState', () => {
    it('should work with hasState under the hood', () => {
      type FetchContext =
        | { status: 'idle' }
        | { status: 'loading'; startTime: number }
        | { status: 'success'; data: string; duration: number }
        | { status: 'error'; error: Error };

      const match = createMatcher(
        discriminantCase<'idle', Machine<FetchContext>, 'status', 'idle'>('idle', 'status', 'idle'),
        discriminantCase<'loading', Machine<FetchContext>, 'status', 'loading'>('loading', 'status', 'loading'),
        discriminantCase<'success', Machine<FetchContext>, 'status', 'success'>('success', 'status', 'success'),
        discriminantCase<'error', Machine<FetchContext>, 'status', 'error'>('error', 'status', 'error')
      );

      const machine = { context: { status: 'success' as const, data: 'result', duration: 100 } };

      const result = match.when(machine).is<string>(
        match.case.idle(() => 'idle'),
        match.case.loading(() => 'loading'),
        match.case.success(m => `Success: ${m.context.data} in ${m.context.duration}ms`),
        match.case.error(m => `Error: ${m.context.error.message}`),
        match.exhaustive
      );

      expect(result).toBe('Success: result in 100ms');
    });
  });

  describe('with class-based Type-State machines', () => {
    it('should work with full state machine lifecycle', () => {
      const match = createMatcher(
        classCase('idle', IdleMachine),
        classCase('loading', LoadingMachine),
        classCase('success', SuccessMachine),
        classCase('error', ErrorMachine)
      );

      let machine: FetchMachine = new IdleMachine();
      expect(match(machine)).toBe('idle');

      machine = machine.start();
      expect(match(machine)).toBe('loading');

      machine = machine.success('final data');
      expect(match(machine)).toBe('success');

      if (match.is.success(machine)) {
        expect(machine.context.data).toBe('final data');
      }

      machine = machine.reset();
      expect(match(machine)).toBe('idle');
    });

    it('should handle error flow', () => {
      const match = createMatcher(
        classCase('idle', IdleMachine),
        classCase('loading', LoadingMachine),
        classCase('success', SuccessMachine),
        classCase('error', ErrorMachine)
      );

      let machine: FetchMachine = new IdleMachine();
      machine = machine.start();
      machine = machine.error(new Error('Network error'));

      expect(match(machine)).toBe('error');

      if (match.is.error(machine)) {
        expect(machine.context.error.message).toBe('Network error');
        machine = machine.retry();
      }

      expect(match(machine)).toBe('loading');
    });
  });
});

// =============================================================================
// TESTS: Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  describe('duplicate case names', () => {
    it('should throw error on duplicate case names', () => {
      expect(() => {
        createMatcher(
          classCase('duplicate', IdleMachine),
          classCase('duplicate', LoadingMachine) // Same name
        );
      }).toThrow('Duplicate matcher case name: "duplicate"');
    });
  });

  describe('empty matcher', () => {
    it('should handle matcher with no cases', () => {
      const match = createMatcher();

      expect(match(new IdleMachine())).toBe(null);
    });
  });

  describe('runtime non-exhaustiveness', () => {
    it('should throw descriptive error when no handler matches at runtime', () => {
      // Create matcher with predicates that might not cover all runtime cases
      const match = createMatcher(
        customCase<'positive', Machine<{ value: number }>>(
          'positive',
          (m): m is Machine<{ value: number }> => m.context.value > 0
        ),
        customCase<'negative', Machine<{ value: number }>>(
          'negative',
          (m): m is Machine<{ value: number }> => m.context.value < 0
        )
      );

      const zeroMachine = { context: { value: 0 } };

      expect(() => {
        match.when(zeroMachine).is<string>(
          match.case.positive(() => 'positive'),
          match.case.negative(() => 'negative'),
          match.exhaustive
        );
      }).toThrow('Non-exhaustive pattern match at runtime');
    });
  });

  describe('overlapping predicates', () => {
    it('should use first-match-wins with overlapping predicates', () => {
      type RangeContext = { value: number };

      const match = createMatcher(
        customCase<'high', Machine<RangeContext>>(
          'high',
          (m): m is Machine<RangeContext> => m.context.value >= 50
        ),
        customCase<'medium', Machine<RangeContext>>(
          'medium',
          (m): m is Machine<RangeContext> => m.context.value >= 25
        ),
        customCase<'low', Machine<RangeContext>>(
          'low',
          (m): m is Machine<RangeContext> => m.context.value >= 0
        )
      );

      // Value 75 matches all three predicates
      const machine = { context: { value: 75 } };

      // Should match 'high' (first match)
      expect(match(machine)).toBe('high');

      const result = match.when(machine).is<string>(
        match.case.high(() => 'high'),
        match.case.medium(() => 'medium'),
        match.case.low(() => 'low'),
        match.exhaustive
      );

      expect(result).toBe('high');
    });
  });
});
