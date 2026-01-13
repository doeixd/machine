import { describe, it, expect, vi } from 'vitest';
import { createMachine, createAsyncMachine } from '../src/index';
import {
  isState,
  createEvent,
  createTransition,
  mergeContext,
  pipeTransitions,
  logState,
  sequence,
} from '../src/utils';
import { MachineBase } from '../src/index';

describe('isState', () => {
  class LoggedOut extends MachineBase<{ status: 'loggedOut' }> {
    constructor() {
      super({ status: 'loggedOut' });
    }

    login(username: string): LoggedIn {
      return new LoggedIn(username);
    }
  }

  class LoggedIn extends MachineBase<{ status: 'loggedIn'; username: string }> {
    constructor(username: string) {
      super({ status: 'loggedIn', username });
    }

    logout(): LoggedOut {
      return new LoggedOut();
    }
  }

  it('should return true for correct instance', () => {
    const machine = new LoggedIn('alice');
    expect(isState(machine, LoggedIn)).toBe(true);
  });

  it('should return false for incorrect instance', () => {
    const machine = new LoggedOut();
    expect(isState(machine, LoggedIn)).toBe(false);
  });

  it('should narrow types as a type guard', () => {
    const machine: LoggedIn | LoggedOut = new LoggedIn('bob');

    if (isState(machine, LoggedIn)) {
      // Type should be narrowed to LoggedIn
      expect(machine.context.username).toBe('bob');
    }
  });
});

describe('createEvent', () => {
  it('should create a type-safe event object', () => {
    type TestMachine = ReturnType<typeof createTestMachine>;

    function createTestMachine() {
      return createMachine(
        { count: 0 },
        {
          increment() {
            return createMachine({ count: this.context.count + 1 }, this);
          },
          add(n: number) {
            return createMachine({ count: this.context.count + n }, this);
          },
        }
      );
    }

    const incrementEvent = createEvent<TestMachine, 'increment'>('increment');
    expect(incrementEvent).toEqual({ type: 'increment', args: [] });

    const addEvent = createEvent<TestMachine, 'add'>('add', 5);
    expect(addEvent).toEqual({ type: 'add', args: [5] });
  });

  it('should create events with multiple arguments', () => {
    type TestMachine = ReturnType<typeof createTestMachine>;

    function createTestMachine() {
      return createMachine(
        { x: 0, y: 0 },
        {
          moveTo(x: number, y: number) {
            return createMachine({ x, y }, this);
          },
        }
      );
    }

    const event = createEvent<TestMachine, 'moveTo'>('moveTo', 10, 20);
    expect(event).toEqual({ type: 'moveTo', args: [10, 20] });
  });
});

describe('mergeContext', () => {
  it('should shallow merge partial context', () => {
    const machine = createMachine(
      { count: 0, name: 'test', active: true },
      {
        increment() {
          return createMachine(
            { count: this.context.count + 1, name: this.context.name, active: this.context.active },
            this
          );
        },
      }
    );

    const updated = mergeContext(machine, { count: 10, active: false });

    expect(updated.context.count).toBe(10);
    expect(updated.context.name).toBe('test');
    expect(updated.context.active).toBe(false);
  });

  it('should not modify original machine', () => {
    const machine = createMachine(
      { count: 0, name: 'test' },
      {
        increment() {
          return createMachine({ count: this.context.count + 1, name: this.context.name }, this);
        },
      }
    );

    const updated = mergeContext(machine, { count: 100 });

    expect(machine.context.count).toBe(0);
    expect(updated.context.count).toBe(100);
  });

  it('should preserve transitions', () => {
    const machine = createMachine(
      { count: 0, name: 'test' },
      {
        increment() {
          return createMachine({ count: this.context.count + 1, name: this.context.name }, this);
        },
      }
    );

    const updated = mergeContext(machine, { count: 50 });

    expect(typeof updated.increment).toBe('function');
  });
});

describe('pipeTransitions', () => {
  it('should apply sync transitions sequentially', async () => {
    const transitions = {
      increment() {
        return createAsyncMachine({ count: this.context.count + 1 }, transitions);
      },
      double() {
        return createAsyncMachine({ count: this.context.count * 2 }, transitions);
      },
      add(n: number) {
        return createAsyncMachine({ count: this.context.count + n }, transitions);
      },
    };

    const machine = createAsyncMachine({ count: 0 }, transitions);

    const result = await pipeTransitions(
      machine,
      (m) => m.increment.call(m),
      (m) => m.increment.call(m),
      (m) => m.double.call(m),
      (m) => m.add.call(m, 10)
    );

    // (0 + 1 + 1) * 2 + 10 = 14
    expect(result.context.count).toBe(14);
  });

  it('should apply async transitions sequentially', async () => {
    const transitions = {
      async asyncIncrement() {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return createAsyncMachine({ count: this.context.count + 1 }, transitions);
      },
      async asyncDouble() {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return createAsyncMachine({ count: this.context.count * 2 }, transitions);
      },
    };

    const machine = createAsyncMachine({ count: 0 }, transitions);

    const result = await pipeTransitions(
      machine,
      (m) => m.asyncIncrement.call(m),
      (m) => m.asyncIncrement.call(m),
      (m) => m.asyncDouble.call(m)
    );

    // (0 + 1 + 1) * 2 = 4
    expect(result.context.count).toBe(4);
  });

  it('should handle mixed sync and async transitions', async () => {
    const transitions = {
      increment() {
        return createAsyncMachine({ count: this.context.count + 1 }, transitions);
      },
      async asyncDouble() {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return createAsyncMachine({ count: this.context.count * 2 }, transitions);
      },
    };

    const machine = createAsyncMachine({ count: 0 }, transitions);

    const result = await pipeTransitions(
      machine,
      (m) => m.increment.call(m),
      (m) => m.asyncDouble.call(m),
      (m) => m.increment.call(m)
    );

    // (0 + 1) * 2 + 1 = 3
    expect(result.context.count).toBe(3);
  });

  it('should not mutate original machine', async () => {
    const transitions = {
      increment() {
        return createAsyncMachine({ count: this.context.count + 1 }, transitions);
      },
    };

    const machine = createAsyncMachine({ count: 0 }, transitions);

    await pipeTransitions(
      machine,
      (m) => m.increment.call(m),
      (m) => m.increment.call(m)
    );

    expect(machine.context.count).toBe(0);
  });
});

describe('logState', () => {
  it('should log machine context and return machine', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const machine = createMachine(
      { count: 5, name: 'test' },
      {
        increment() {
          return createMachine({ count: this.context.count + 1, name: this.context.name }, this);
        },
      }
    );

    const result = logState(machine);

    expect(consoleSpy).toHaveBeenCalledWith({ count: 5, name: 'test' });
    expect(result).toBe(machine);

    consoleSpy.mockRestore();
  });

  it('should log with label', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const machine = createMachine({ count: 10 }, {});

    logState(machine, 'Current state:');

    expect(consoleSpy).toHaveBeenCalledWith('Current state:', { count: 10 });

    consoleSpy.mockRestore();
  });

  it('should work as a tap function in a chain', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const transitions = {
      increment() {
        return createAsyncMachine({ count: this.context.count + 1 }, transitions);
      },
    };

    const machine = createAsyncMachine({ count: 0 }, transitions);

    const result = await pipeTransitions(
      machine,
      (m) => m.increment.call(m),
      (m) => logState(m),
      (m) => m.increment.call(m)
    );

    expect(consoleSpy).toHaveBeenCalledWith({ count: 1 });
    expect(result.context.count).toBe(2);

    consoleSpy.mockRestore();
  });
});

describe('sequence', () => {
  class NameForm extends MachineBase<{ name: string; valid: boolean }> {
    submit(name: string) {
      return new NameForm({ name, valid: name.length > 0 });
    }
  }

  class EmailForm extends MachineBase<{ email: string; valid: boolean }> {
    submit(email: string) {
      return new EmailForm({ email, valid: email.includes('@') });
    }
  }

  class PasswordForm extends MachineBase<{ password: string; valid: boolean }> {
    submit(password: string) {
      return new PasswordForm({ password, valid: password.length >= 8 });
    }
  }

  it('should start with the first machine in sequence', () => {
    const wizard = sequence(
      [new NameForm({ name: '', valid: false }),
       new EmailForm({ email: '', valid: false }),
       new PasswordForm({ password: '', valid: false })],
      (machine) => machine.context.valid
    );

    expect(wizard.context.name).toBe('');
    expect(wizard.context.valid).toBe(false);
  });

  it('should advance to next machine when isFinal returns true', () => {
    const wizard = sequence(
      [new NameForm({ name: '', valid: false }),
       new EmailForm({ email: '', valid: false }),
       new PasswordForm({ password: '', valid: false })],
      (machine) => machine.context.valid
    );

    // First machine - NameForm
    expect(wizard.context.name).toBe('');
    expect(wizard.context.valid).toBe(false);

    // Submit invalid name - should stay on NameForm
    const afterInvalid = wizard.submit('');
    expect(afterInvalid.context.name).toBe('');
    expect(afterInvalid.context.valid).toBe(false);

    // Submit valid name - should advance to EmailForm
    const afterValid = wizard.submit('John Doe');
    expect(afterValid.context.name).toBeUndefined(); // Should be EmailForm context (no name property)
    expect(afterValid.context.email).toBe(''); // EmailForm starts with empty email
    expect(afterValid.context.valid).toBe(false);
  });

  it('should maintain sequence progression', () => {
    const wizard = sequence(
      [new NameForm({ name: '', valid: false }),
       new EmailForm({ email: '', valid: false }),
       new PasswordForm({ password: '', valid: false })],
      (machine) => machine.context.valid
    );

    // Start with NameForm
    expect(wizard.context.name).toBeDefined();

    // Advance to EmailForm
    const emailForm = wizard.submit('John Doe');
    expect(emailForm.context.name).toBeUndefined(); // No longer on NameForm
    expect(emailForm.context.email).toBe(''); // EmailForm context

    // Advance to PasswordForm
    const passwordForm = emailForm.submit('john@example.com');
    expect(passwordForm.context.email).toBeUndefined(); // No longer on EmailForm
    expect(passwordForm.context.password).toBe(''); // PasswordForm context

    // Stay on PasswordForm until valid
    const stillPassword = passwordForm.submit('123');
    expect(stillPassword.context.password).toBeDefined();
    expect(stillPassword.context.valid).toBe(false);

    // Complete sequence
    const final = passwordForm.submit('password123');
    expect(final.context.password).toBe('password123');
    expect(final.context.valid).toBe(true);
  });

  it('should handle async transitions', async () => {
    class AsyncForm extends MachineBase<{ value: string; valid: boolean }> {
      async submit(value: string) {
        await new Promise(resolve => setTimeout(resolve, 10));
        return new AsyncForm({ value, valid: value.length > 0 });
      }
    }

    const wizard = sequence(
      [new AsyncForm({ value: '', valid: false }),
       new AsyncForm({ value: '', valid: false })],
      (machine) => machine.context.valid
    );

    // First form - submit should advance to second form
    const result = await wizard.submit('test');
    expect(result.context.value).toBe(''); // Second form starts empty
    expect(result.context.valid).toBe(false); // Second form not yet valid
  });

  it('should work with different final predicates', () => {
    class Step extends MachineBase<{ step: number; complete: boolean }> {
      next() {
        return new Step({ step: this.context.step + 1, complete: this.context.step + 1 >= 3 });
      }
    }

    const wizard = sequence(
      [new Step({ step: 1, complete: false }),
       new Step({ step: 2, complete: false }),
       new Step({ step: 3, complete: true })],
      (machine) => machine.context.complete
    );

    expect(wizard.context.step).toBe(1);

    const step2 = wizard.next();
    expect(step2.context.step).toBe(2);

    const step3 = step2.next();
    expect(step3.context.step).toBe(3);
    expect(step3.context.complete).toBe(true);
  });

  it('should throw error for empty sequence', () => {
    expect(() => {
      sequence([], () => true);
    }).toThrow('Sequence must contain at least one machine');
  });
});

describe('createTransition', () => {
  it('should create a transition function that transforms context', () => {
    const transitions = {
      increment: createTransition(
        () => transitions,
        (ctx: { count: number }) => ({ count: ctx.count + 1 })
      ),
    };

    const machine = createMachine({ count: 0 }, transitions);
    const nextMachine = machine.increment();

    expect(nextMachine.context.count).toBe(1);
    expect(nextMachine).not.toBe(machine); // Should be a new instance
  });

  it('should work with arguments', () => {
    const transitions = {
      add: createTransition(
        () => transitions,
        (ctx: { count: number }, n: number) => ({ count: ctx.count + n })
      ),
    };

    const machine = createMachine({ count: 5 }, transitions);
    const nextMachine = machine.add(3);

    expect(nextMachine.context.count).toBe(8);
  });

  it('should preserve transitions in the new machine', () => {
    const transitions = {
      increment: createTransition(
        () => transitions,
        (ctx: { count: number }) => ({ count: ctx.count + 1 })
      ),
      add: createTransition(
        () => transitions,
        (ctx: { count: number }, n: number) => ({ count: ctx.count + n })
      ),
    };

    const machine = createMachine({ count: 0 }, transitions);
    const incremented = machine.increment();
    const added = incremented.add(5);

    expect(added.context.count).toBe(6);
    expect(typeof added.increment).toBe('function');
    expect(typeof added.add).toBe('function');
  });

  it('should work with complex self-referencing transitions', () => {
    // Create transitions that reference themselves
    const transitions = {
      increment: createTransition(
        () => transitions,
        (ctx: { count: number }) => ({ count: ctx.count + 1 })
      ),
      add: createTransition(
        () => transitions,
        (ctx: { count: number }, n: number) => ({ count: ctx.count + n })
      ),
      reset: createTransition(
        () => transitions,
        (ctx: { count: number }) => ({ count: 0 })
      ),
    };

    const machine = createMachine({ count: 0 }, transitions);
    const result = machine.increment().add(10).reset();

    expect(result.context.count).toBe(0);
  });
});
