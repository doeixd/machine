import { describe, it, expect, vi } from 'vitest';
import { createMachine, guard, guardAsync, whenGuard, whenGuardAsync, type GuardOptions } from '../src/index';

describe('guardAsync', () => {
  it('should execute transition when condition passes', async () => {
    const machine = createMachine({ count: 5 }, {
      increment: function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    });

    const guardedIncrement = guardAsync(
      (ctx) => ctx.count < 10,
      function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    );

    const result = await guardedIncrement.call(machine);
    expect(result.context.count).toBe(6);
  });

  it('should throw error when condition fails and onFail=throw', async () => {
    const machine = createMachine({ count: 15 }, {
      increment: function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    });

    const guardedIncrement = guardAsync(
      (ctx) => ctx.count < 10,
      function() {
        return createMachine({ count: this.count + 1 }, this);
      },
      { onFail: 'throw' }
    );

    await expect(guardedIncrement.call(machine)).rejects.toThrow('Guard condition failed');
  });

  it('should use custom error message', async () => {
    const machine = createMachine({ count: 15 }, {
      increment: function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    });

    const guardedIncrement = guardAsync(
      (ctx) => ctx.count < 10,
      function() {
        return createMachine({ count: this.count + 1 }, this);
      },
      { onFail: 'throw', errorMessage: 'Count too high' }
    );

    await expect(guardedIncrement.call(machine)).rejects.toThrow('Count too high');
  });

  it('should return unchanged machine when condition fails and onFail=ignore', async () => {
    const machine = createMachine({ count: 15 }, {
      increment: function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    });

    const guardedIncrement = guardAsync(
      (ctx) => ctx.count < 10,
      function() {
        return createMachine({ count: this.count + 1 }, this);
      },
      { onFail: 'ignore' }
    );

    const result = await guardedIncrement.call(machine);
    expect(result).toBe(machine);
    expect(result.context.count).toBe(15);
  });

  it('should execute custom fallback function when condition fails', async () => {
    const machine = createMachine({ count: 15 }, {
      increment: function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    });

    const fallback = vi.fn(function() {
      return createMachine({ ...this.context, error: 'Too high' }, this);
    });

    const guardedIncrement = guardAsync(
      (ctx) => ctx.count < 10,
      function() {
        return createMachine({ count: this.count + 1 }, this);
      },
      { onFail: fallback }
    );

    const result = await guardedIncrement.call(machine);
    expect(fallback).toHaveBeenCalledWith();
    expect(result.context.count).toBe(15);
    expect(result.context.error).toBe('Too high');
  });

  it('should execute custom fallback machine when condition fails', async () => {
    const machine = createMachine({ count: 15 }, {
      increment: function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    });

    const errorMachine = createMachine({ count: 15, error: 'Too high' }, machine);

    const guardedIncrement = guardAsync(
      (ctx) => ctx.count < 10,
      function() {
        return createMachine({ count: this.count + 1 }, this);
      },
      { onFail: errorMachine }
    );

    const result = await guardedIncrement.call(machine);
    expect(result).toBe(errorMachine);
    expect(result.context.error).toBe('Too high');
  });

  it('should handle async conditions', async () => {
    const machine = createMachine({ count: 5 }, {
      increment: function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    });

    const asyncCondition = async (ctx: { count: number }) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return ctx.count < 10;
    };

    const guardedIncrement = guardAsync(
      asyncCondition,
      function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    );

    const result = await guardedIncrement.call(machine);
    expect(result.context.count).toBe(6);
  });

  it('should pass arguments to condition and transition', async () => {
    const machine = createMachine({ balance: 100 }, {
      withdraw: function(amount: number) {
        return createMachine({ balance: this.balance - amount }, this);
      }
    });

    const conditionSpy = vi.fn((ctx, amount) => ctx.balance >= amount);
    const transitionSpy = vi.fn(function(amount: number) {
      return createMachine({ balance: this.balance - amount }, this);
    });

    const guardedWithdraw = guardAsync(conditionSpy, transitionSpy);

    const result = await guardedWithdraw.call(machine, 50);

    expect(conditionSpy).toHaveBeenCalledWith(machine.context, 50);
    expect(transitionSpy).toHaveBeenCalledWith(50);
    expect(result.context.balance).toBe(50);
  });

  it('should have guard metadata properties', () => {
    const guardedFn = guardAsync(
      (ctx) => true,
      function() { return createMachine({ count: 1 }, {}); }
    );

    expect(guardedFn.__guard).toBe(true);
    expect(typeof guardedFn.condition).toBe('function');
    expect(typeof guardedFn.transition).toBe('function');
    expect(guardedFn.options).toEqual({ onFail: 'throw' });
  });
});

describe('guard', () => {
  it('should execute transition when condition passes', () => {
    const machine = createMachine({ count: 5 }, {
      increment: function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    });

    const guardedIncrement = guard(
      (ctx) => ctx.count < 10,
      function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    );

    const result = guardedIncrement.call(machine);
    expect(result.context.count).toBe(6);
  });

  it('should throw error when condition fails and onFail=throw', () => {
    const machine = createMachine({ count: 15 }, {
      increment: function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    });

    const guardedIncrement = guard(
      (ctx) => ctx.count < 10,
      function() {
        return createMachine({ count: this.count + 1 }, this);
      },
      { onFail: 'throw' }
    );

    expect(() => guardedIncrement.call(machine)).toThrow('Guard condition failed');
  });

  it('should use custom error message', () => {
    const machine = createMachine({ count: 15 }, {
      increment: function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    });

    const guardedIncrement = guard(
      (ctx) => ctx.count < 10,
      function() {
        return createMachine({ count: this.count + 1 }, this);
      },
      { onFail: 'throw', errorMessage: 'Count too high' }
    );

    expect(() => guardedIncrement.call(machine)).toThrow('Count too high');
  });

  it('should return unchanged machine when condition fails and onFail=ignore', () => {
    const machine = createMachine({ count: 15 }, {
      increment: function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    });

    const guardedIncrement = guard(
      (ctx) => ctx.count < 10,
      function() {
        return createMachine({ count: this.count + 1 }, this);
      },
      { onFail: 'ignore' }
    );

    const result = guardedIncrement.call(machine);
    expect(result).toBe(machine);
    expect(result.context.count).toBe(15);
  });

  it('should execute custom fallback function when condition fails', () => {
    const machine = createMachine({ count: 15 }, {
      increment: function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    });

    const fallback = vi.fn(function() {
      return createMachine({ ...this.context, error: 'Too high' }, this);
    });

    const guardedIncrement = guard(
      (ctx) => ctx.count < 10,
      function() {
        return createMachine({ count: this.count + 1 }, this);
      },
      { onFail: fallback }
    );

    const result = guardedIncrement.call(machine);
    expect(fallback).toHaveBeenCalledWith();
    expect(result.context.count).toBe(15);
    expect(result.context.error).toBe('Too high');
  });

  it('should execute custom fallback machine when condition fails', () => {
    const machine = createMachine({ count: 15 }, {
      increment: function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    });

    const errorMachine = createMachine({ count: 15, error: 'Too high' }, machine);

    const guardedIncrement = guard(
      (ctx) => ctx.count < 10,
      function() {
        return createMachine({ count: this.count + 1 }, this);
      },
      { onFail: errorMachine }
    );

    const result = guardedIncrement.call(machine);
    expect(result).toBe(errorMachine);
    expect(result.context.error).toBe('Too high');
  });

  it('should pass arguments to condition and transition', () => {
    const machine = createMachine({ balance: 100 }, {
      withdraw: function(amount: number) {
        return createMachine({ balance: this.balance - amount }, this);
      }
    });

    const conditionSpy = vi.fn((ctx, amount) => ctx.balance >= amount);
    const transitionSpy = vi.fn(function(amount: number) {
      return createMachine({ balance: this.balance - amount }, this);
    });

    const guardedWithdraw = guard(conditionSpy, transitionSpy);

    const result = guardedWithdraw.call(machine, 50);

    expect(conditionSpy).toHaveBeenCalledWith(machine.context, 50);
    expect(transitionSpy).toHaveBeenCalledWith(50);
    expect(result.context.balance).toBe(50);
  });

  it('should have guard metadata properties', () => {
    const guardedFn = guard(
      (ctx) => true,
      function() { return createMachine({ count: 1 }, {}); }
    );

    expect(guardedFn.__guard).toBe(true);
    expect(typeof guardedFn.condition).toBe('function');
    expect(typeof guardedFn.transition).toBe('function');
    expect(guardedFn.options).toEqual({ onFail: 'throw' });
  });

  it('should work synchronously without promises', () => {
    const machine = createMachine({ count: 5 }, {
      increment: function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    });

    const guardedIncrement = guard(
      (ctx) => ctx.count < 10,
      function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    );

    // Should return synchronously, not a Promise
    const result = guardedIncrement.call(machine);
    expect(result).toBeInstanceOf(Object);
    expect(result.context.count).toBe(6);
    expect(result).not.toBeInstanceOf(Promise);
  });

  it('should reject async conditions at compile time', () => {
    const machine = createMachine({ count: 5 }, {
      increment: function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    });

    // @ts-expect-error - guard() should not accept async conditions
    const guardedIncrement = guard(
      async (ctx) => ctx.count < 10, // This should cause a TypeScript error
      function() {
        return createMachine({ count: this.count + 1 }, this);
      }
    );

    // This test will fail to compile if the @ts-expect-error is not needed
    expect(true).toBe(true); // Dummy assertion
  });
});

describe('whenGuardAsync', () => {
  it('should create guarded transition with .do()', async () => {
    const machine = createMachine({ isAdmin: true }, {
      deleteUser: function() {
        return createMachine({ ...this.context, deleted: true }, this);
      }
    });

    const guardedDelete = whenGuardAsync((ctx) => ctx.isAdmin)
      .do(function() {
        return createMachine({ ...this.context, deleted: true }, this);
      });

    const result = await guardedDelete.call(machine);
    expect(result.context.deleted).toBe(true);
  });

  it('should create guarded transition with .do().else()', async () => {
    const machine = createMachine({ isAdmin: false }, {
      deleteUser: function() {
        return createMachine({ ...this.context, deleted: true }, this);
      }
    });

    const guardedDelete = whenGuardAsync((ctx) => ctx.isAdmin)
      .do(function() {
        return createMachine({ ...this.context, deleted: true }, this);
      })
      .else(function() {
        return createMachine({ ...this.context, error: 'Unauthorized' }, this);
      });

    const result = await guardedDelete.call(machine);
    expect(result.context.error).toBe('Unauthorized');
    expect(result.context.deleted).toBeUndefined();
  });

  it('should handle async conditions in fluent API', async () => {
    const machine = createMachine({ isAdmin: true }, {
      deleteUser: function() {
        return createMachine({ ...this.context, deleted: true }, this);
      }
    });

    const asyncCheck = async (ctx: { isAdmin: boolean }) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return ctx.isAdmin;
    };

    const guardedDelete = whenGuardAsync(asyncCheck)
      .do(function() {
        return createMachine({ ...this.context, deleted: true }, this);
      });

    const result = await guardedDelete.call(machine);
    expect(result.context.deleted).toBe(true);
  });
});

describe('whenGuard', () => {
  it('should create guarded transition with .do()', () => {
    const machine = createMachine({ isAdmin: true }, {
      deleteUser: function() {
        return createMachine({ ...this.context, deleted: true }, this);
      }
    });

    const guardedDelete = whenGuard((ctx) => ctx.isAdmin)
      .do(function() {
        return createMachine({ ...this.context, deleted: true }, this);
      });

    const result = guardedDelete.call(machine);
    expect(result.context.deleted).toBe(true);
  });

  it('should create guarded transition with .do().else()', () => {
    const machine = createMachine({ isAdmin: false }, {
      deleteUser: function() {
        return createMachine({ ...this.context, deleted: true }, this);
      }
    });

    const guardedDelete = whenGuard((ctx) => ctx.isAdmin)
      .do(function() {
        return createMachine({ ...this.context, deleted: true }, this);
      })
      .else(function() {
        return createMachine({ ...this.context, error: 'Unauthorized' }, this);
      });

    const result = guardedDelete.call(machine);
    expect(result.context.error).toBe('Unauthorized');
    expect(result.context.deleted).toBeUndefined();
  });
});

describe('guard integration with createMachine', () => {
  it('should work as machine transitions', async () => {
    // Create a guarded withdraw function
    const guardedWithdraw = guardAsync(
      (ctx, amount) => ctx.isActive && ctx.balance >= amount,
      function(amount: number) {
        return createMachine({
          ...this.context,
          balance: this.balance - amount
        }, {
          withdraw: guardedWithdraw,
          deposit: function(amount: number) {
            return createMachine({
              ...this.context,
              balance: this.balance + amount
            }, {
              withdraw: guardedWithdraw,
              deposit: this.deposit
            });
          }
        });
      },
      { onFail: function() { return createMachine(this.context, { withdraw: guardedWithdraw, deposit: () => {} }); } }
    );

    const machine = createMachine({ balance: 100, isActive: true }, {
      withdraw: guardedWithdraw,
      deposit: function(amount: number) {
        return createMachine({
          ...this.context,
          balance: this.balance + amount
        }, {
          withdraw: guardedWithdraw,
          deposit: this.deposit
        });
      }
    });

    // Valid withdrawal
    const afterWithdraw = await machine.withdraw.call(machine, 50);
    expect(afterWithdraw.context.balance).toBe(50);

    // Invalid withdrawal (insufficient funds)
    const afterInvalid = await machine.withdraw.call(afterWithdraw, 100);
    expect(afterInvalid.context.balance).toBe(50); // Should return machine with same balance

    // Normal deposit still works
    const afterDeposit = machine.deposit.call(afterInvalid.context, 25);
    expect(afterDeposit.context.balance).toBe(75);
  });

  it('should preserve type safety', async () => {
    const guardedIncrement = guard(
      (ctx) => ctx.count < 5,
      function() {
        return createMachine({ count: this.count + 1 }, {
          increment: guardedIncrement
        });
      }
    );

    const machine = createMachine({ count: 0 }, {
      increment: guardedIncrement
    });

    const result = await machine.increment.call(machine.context);
    expect(result.context.count).toBe(1);

    // TypeScript should know result is still the same machine type
    expect(typeof result.increment).toBe('function');
  });
});