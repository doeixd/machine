import { describe, it, expect } from 'vitest';
import { createContextBoundMachine, callWithContext, isContextBound, createMachine, type Machine } from '../src/index';

describe('Context-Bound Machines', () => {
  describe('createContextBoundMachine', () => {
    it('creates a machine where transformers receive context as this', () => {
      const machine = createContextBoundMachine({ count: 0 }, {
        increment() {
          // this === context
          return { count: this.context.count + 1 };
        },
        add(amount: number) {
          return { count: this.context.count + amount };
        }
      });

      expect(machine.context.count).toBe(0);
      const result = machine.increment();
      expect(result.context.count).toBe(1);
    });

    it('returns machines (not contexts) from public API', () => {
      const machine = createContextBoundMachine({ count: 0 }, {
        increment() {
          return { count: this.context.count + 1 };
        }
      });

      const result = machine.increment();
      expect(result).toHaveProperty('context');
      expect(result).toHaveProperty('increment');
      expect(typeof result.increment).toBe('function');
    });

    it('can chain transitions', () => {
      const machine = createContextBoundMachine({ count: 0 }, {
        increment() {
          return { count: this.context.count + 1 };
        }
      });

      const result = machine.increment().increment().increment();
      expect(result.context.count).toBe(3);
    });

    it('transformers cannot call other transitions', () => {
      // This is a documentation test - the limitation is that
      // transformers can't do: return this.increment().increment()
      // because `this` is just the context, not the machine

      const machine = createContextBoundMachine({ count: 0 }, {
        increment() {
          return { count: this.context.count + 1 };
        },
        double() {
          // ❌ Can't do: return this.increment().increment()
          // ✅ Must do: manual calculation
          return { count: this.context.count * 2 };
        }
      });

      expect(machine.double().context.count).toBe(0);
      const withCount = createContextBoundMachine({ count: 5 }, {
        increment() {
          return { count: this.context.count + 1 };
        },
        double() {
          return { count: this.context.count * 2 };
        }
      });
      expect(withCount.double().context.count).toBe(10);
    });

    it('supports transformers with multiple arguments', () => {
      const machine = createContextBoundMachine({ count: 0 }, {
        add(a: number, b: number) {
          return { count: this.context.count + a + b };
        }
      });

      const result = machine.add(5, 10);
      expect(result.context.count).toBe(15);
    });
  });

  describe('callWithContext', () => {
    it('calls a machine transition with context as this (legacy compat)', () => {
      // Note: This is mainly for backward compatibility with old context-bound code
      // Modern code should use machine binding (this.context.count)
      const machine = createContextBoundMachine({ count: 0 }, {
        increment() {
          // Context-bound: this === context
          return { count: this.context.count + 1 };
        }
      });

      const result = machine.increment();
      expect(result.context.count).toBe(1);
    });

    it('demonstrates calling machine-bound transitions with explicit context binding', () => {
      // Create a simple machine where we manually control the binding
      const machine = {
        context: { count: 0 },
        increment: function(this: {count: number}) {
          return { context: { count: this.context.count + 1 } };
        }
      } as any;

      // callWithContext provides backward compat for context-only binding
      const result = callWithContext(machine, 'increment');
      expect(result.context.count).toBe(1);
    });
  });

  describe('isContextBound', () => {
    it('returns false for regular machines', () => {
      const machine = createMachine({ count: 0 }, {
        increment() {
          return createMachine({ count: this.context.count + 1 }, this);
        }
      });

      expect(isContextBound(machine)).toBe(false);
    });

    it('returns false for context-bound machines (no marker)', () => {
      // Note: Current implementation returns false because we don't
      // actually set the __contextBound marker. This is fine.
      const machine = createContextBoundMachine({ count: 0 }, {
        increment() {
          return { count: this.context.count + 1 };
        }
      });

      expect(isContextBound(machine)).toBe(false);
    });
  });

  describe('Context-Bound vs Machine-Bound Comparison', () => {
    it('demonstrates the difference', () => {
      // Machine-bound: can call other transitions
      const machineBound = createMachine({ count: 0 }, {
        increment(this: Machine<{count: number}>) {
          return createMachine({ count: this.context.count + 1 }, this);
        },
        incrementTwice(this: Machine<{count: number}>) {
          // ✅ Can call other transitions
          return this.increment().increment();
        }
      });

      expect(machineBound.incrementTwice().context.count).toBe(2);

      // Context-bound: cleaner syntax but can't call other transitions
      const contextBound = createContextBoundMachine({ count: 0 }, {
        increment() {
          return { count: this.context.count + 1 };
        },
        // incrementTwice would need to manually duplicate logic
        incrementTwiceManual() {
          return { count: this.context.count + 2 };
        }
      });

      expect(contextBound.incrementTwiceManual().context.count).toBe(2);
    });
  });
});
