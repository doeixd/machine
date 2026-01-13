import { describe, it, expect } from 'vitest';
import { createMachine } from '../src/index';
import { createTransitionFactory, createTransitionExtender, createFunctionalMachine, state } from '../src/functional-combinators';

describe('createTransitionFactory', () => {
  it('should create a factory that generates type-safe transitions', () => {
    const counterTransitions = {
      increment() {
        return createMachine({ count: this.context.count + 1 }, counterTransitions);
      },
      decrement() {
        return createMachine({ count: this.context.count - 1 }, counterTransitions);
      },
    };

    const createCounterTransition = createTransitionFactory<{ count: number }>();

    const incrementBy = createCounterTransition(
      (ctx, amount: number) => ({ count: ctx.count + amount })
    );

    const counter = createMachine({ count: 0 }, counterTransitions);
    const result = incrementBy.call(counter, 5);

    expect(result.context.count).toBe(5);
    expect(result.increment).toBeDefined();
    expect(result.decrement).toBeDefined();
  });

  it('should work with multiple arguments', () => {
    const calculatorTransitions = {
      add() {
        return createMachine({ result: this.context.result + 1 }, calculatorTransitions);
      },
    };

    const createCalculatorTransition = createTransitionFactory<{ result: number }>();

    const multiply = createCalculatorTransition(
      (ctx, a: number, b: number) => ({ result: a * b })
    );

    const calculator = createMachine({ result: 0 }, calculatorTransitions);
    const result = multiply.call(calculator, 6, 7);

    expect(result.context.result).toBe(42);
  });

  it('should create pure functions that can be reused', () => {
    const todoTransitions = {
      addTodo() {
        return createMachine({ todos: [...this.context.todos, 'new'] }, todoTransitions);
      },
    };

    const createTodoTransition = createTransitionFactory<{ todos: any[] }>();

    const addTodoWithText = createTodoTransition(
      (ctx, text: string) => ({
        todos: [...ctx.todos, text]
      })
    );

    const todoMachine = createMachine({ todos: [] }, todoTransitions);

    const withFirst = addTodoWithText.call(todoMachine, 'First todo');
    const withSecond = addTodoWithText.call(withFirst, 'Second todo');

    expect(withSecond.context.todos).toEqual(['First todo', 'Second todo']);
  });

  it('should work with complex context transformations', () => {
    const userTransitions = {
      updateProfile() {
        return createMachine({ profile: { ...this.context.profile } }, userTransitions);
      },
    };

    const createUserTransition = createTransitionFactory<{ profile: { name: { firstName: string; lastName: string }; email: string } }>();

    const updateName = createUserTransition(
      (ctx, firstName: string, lastName: string) => ({
        profile: {
          ...ctx.profile,
          name: { firstName, lastName },
          updatedAt: new Date().toISOString()
        }
      })
    );

    const user = createMachine(
      { profile: { name: { firstName: '', lastName: '' }, email: 'test@example.com' } },
      userTransitions
    );

    const updated = updateName.call(user, 'John', 'Doe');

    expect(updated.context.profile.name.firstName).toBe('John');
    expect(updated.context.profile.name.lastName).toBe('Doe');
    expect(updated.context.profile.email).toBe('test@example.com');
    expect(updated.context.profile.updatedAt).toBeDefined();
  });
});

describe('createTransitionExtender', () => {
  it('should create an extender that can add transitions to a machine', () => {
    const basicCounter = createMachine({ count: 0 }, {
      increment() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const extendCounter = createTransitionExtender(basicCounter);

    const extended = extendCounter.addTransition('decrement',
      (ctx) => ({ count: ctx.count - 1 })
    );

    expect(extended.machine.increment).toBeDefined();
    expect(extended.machine.decrement).toBeDefined();
    expect(extended.machine.context.count).toBe(0);
  });

  it('should allow chaining multiple transitions', () => {
    const basicMachine = createMachine({ value: 0 }, {});

    const extender = createTransitionExtender(basicMachine);

    const extended = extender
      .addTransition('increment', (ctx) => ({ value: ctx.value + 1 }))
      .addTransition('decrement', (ctx) => ({ value: ctx.value - 1 }))
      .addTransition('reset', (ctx) => ({ value: 0 }));

    expect(extended.machine.increment).toBeDefined();
    expect(extended.machine.decrement).toBeDefined();
    expect(extended.machine.reset).toBeDefined();
  });

  it('should create functional transitions that work correctly', () => {
    const basicCounter = createMachine({ count: 0 }, {
      increment() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const extendCounter = createTransitionExtender(basicCounter);

    const extended = extendCounter.addTransition('add',
      (ctx, amount: number) => ({ count: ctx.count + amount })
    );

    const result = extended.machine.increment().add(5);

    expect(result.context.count).toBe(6);
  });

  it('should not modify the original machine', () => {
    const original = createMachine({ count: 0 }, {
      increment() {
        return createMachine({ count: this.context.count + 1 }, this);
      }
    });

    const extendCounter = createTransitionExtender(original);

    const extended = extendCounter.addTransition('decrement',
      (ctx) => ({ count: ctx.count - 1 })
    );

    expect(original.decrement).toBeUndefined();
    expect(extended.machine.decrement).toBeDefined();
    expect(original.context.count).toBe(0);
    expect(extended.machine.context.count).toBe(0);
  });

  it('should work with complex context and arguments', () => {
    const userMachine = createMachine(
      { profile: { name: '', email: '' } },
      {}
    );

    const extendUser = createTransitionExtender(userMachine);

    const extended = extendUser.addTransition('setProfile',
      (ctx, name: string, email: string) => ({
        profile: { name, email }
      })
    );

    const result = extended.machine.setProfile('John Doe', 'john@example.com');

    expect(result.context.profile.name).toBe('John Doe');
    expect(result.context.profile.email).toBe('john@example.com');
  });

  it('should support validation in transition functions', () => {
    const formMachine = createMachine(
      { value: '', isValid: false },
      {}
    );

    const extendForm = createTransitionExtender(formMachine);

    const extended = extendForm.addTransition('setValue',
      (ctx, newValue: string) => {
        if (newValue.length < 3) {
          throw new Error('Value must be at least 3 characters');
        }
        return {
          value: newValue,
          isValid: newValue.length >= 3
        };
      }
    );

    expect(() => {
      extended.machine.setValue('ab');
    }).toThrow('Value must be at least 3 characters');

    const validResult = extended.machine.setValue('valid value');
    expect(validResult.context.value).toBe('valid value');
    expect(validResult.context.isValid).toBe(true);
  });

  it('should chain multiple extenders correctly', () => {
    const baseMachine = createMachine({ count: 0 }, {});

    const step1 = createTransitionExtender(baseMachine)
      .addTransition('increment', (ctx) => ({ count: ctx.count + 1 }));

    const step2 = step1
      .addTransition('decrement', (ctx) => ({ count: ctx.count - 1 }));

    const step3 = step2
      .addTransition('double', (ctx) => ({ count: ctx.count * 2 }));

    // Test that all transitions are available
    const result = step3.machine.increment().double().decrement();

    expect(result.context.count).toBe(1); // (0 + 1) * 2 - 1 = 1
  });
});

describe('createFunctionalMachine', () => {
  it('should create a curried function that accepts transformers', () => {
    const createCounter = createFunctionalMachine({ count: 0 });

    const counter = createCounter({
      increment: (ctx) => ({ count: ctx.count + 1 }),
      decrement: (ctx) => ({ count: ctx.count - 1 }),
      add: (ctx, amount: number) => ({ count: ctx.count + amount }),
      reset: (ctx) => ({ count: 0 })
    });

    expect(counter.context.count).toBe(0);
    expect(typeof counter.increment).toBe('function');
    expect(typeof counter.decrement).toBe('function');
    expect(typeof counter.add).toBe('function');
    expect(typeof counter.reset).toBe('function');
  });

  it('should execute transitions correctly', () => {
    const createCounter = createFunctionalMachine({ count: 5 });

    const counter = createCounter({
      increment: (ctx) => ({ count: ctx.count + 1 }),
      add: (ctx, amount: number) => ({ count: ctx.count + amount })
    });

    const incremented = counter.increment();
    expect(incremented.context.count).toBe(6);

    const added = incremented.add(10);
    expect(added.context.count).toBe(16);
  });

  it('should maintain immutability', () => {
    const createCounter = createFunctionalMachine({ count: 0 });

    const counter = createCounter({
      increment: (ctx) => ({ count: ctx.count + 1 })
    });

    const incremented = counter.increment();
    expect(counter.context.count).toBe(0);
    expect(incremented.context.count).toBe(1);
    expect(counter).not.toBe(incremented);
  });

  it('should work with complex context', () => {
    const createTodoMachine = createFunctionalMachine({
      todos: [] as { id: number; text: string; done: boolean }[]
    });

    const todoMachine = createTodoMachine({
      addTodo: (ctx, text: string) => ({
        todos: [...ctx.todos, { id: Date.now(), text, done: false }]
      }),
      toggleTodo: (ctx, id: number) => ({
        todos: ctx.todos.map(todo =>
          todo.id === id ? { ...todo, done: !todo.done } : todo
        )
      }),
      clearCompleted: (ctx) => ({
        todos: ctx.todos.filter(todo => !todo.done)
      })
    });

    const withTodo = todoMachine.addTodo('Buy milk');
    expect(withTodo.context.todos).toHaveLength(1);
    expect(withTodo.context.todos[0].text).toBe('Buy milk');

    const todoId = withTodo.context.todos[0].id;
    const toggled = withTodo.toggleTodo(todoId);
    expect(toggled.context.todos[0].done).toBe(true);

    const cleared = toggled.clearCompleted();
    expect(cleared.context.todos).toHaveLength(0);
  });

  it('should preserve all transitions in new states', () => {
    const createCounter = createFunctionalMachine({ count: 0 });

    const counter = createCounter({
      increment: (ctx) => ({ count: ctx.count + 1 }),
      decrement: (ctx) => ({ count: ctx.count - 1 })
    });

    const incremented = counter.increment();
    expect(typeof incremented.increment).toBe('function');
    expect(typeof incremented.decrement).toBe('function');

    const decremented = incremented.decrement();
    expect(typeof decremented.increment).toBe('function');
    expect(typeof decremented.decrement).toBe('function');
  });

  it('should handle empty transformers object', () => {
    const createMachine = createFunctionalMachine({ value: 'test' });

    const machine = createMachine({});

    expect(machine.context.value).toBe('test');
    // Machine only has context property and transitions, not direct context properties
    expect(Object.keys(machine)).toEqual(['context']);
  });

  it('should work with different argument patterns', () => {
    const createCalculator = createFunctionalMachine({ result: 0 });

    const calculator = createCalculator({
      add: (ctx, a: number, b: number) => ({ result: a + b }),
      multiply: (ctx, factor: number) => ({ result: ctx.result * factor }),
      set: (ctx, value: number) => ({ result: value })
    });

    const added = calculator.add(5, 3);
    expect(added.context.result).toBe(8);

    const multiplied = added.multiply(2);
    expect(multiplied.context.result).toBe(16);

    const set = multiplied.set(100);
    expect(set.context.result).toBe(100);
  });

  it('should allow reusing the same initial context with different transitions', () => {
    const createWithInitialState = createFunctionalMachine({ count: 10 });

    const counter = createWithInitialState({
      increment: (ctx) => ({ count: ctx.count + 1 }),
      double: (ctx) => ({ count: ctx.count * 2 })
    });

    const multiplier = createWithInitialState({
      multiply: (ctx, factor: number) => ({ count: ctx.count * factor }),
      square: (ctx) => ({ count: ctx.count * ctx.count })
    });

    expect(counter.context.count).toBe(10);
    expect(multiplier.context.count).toBe(10);

    const doubled = counter.double();
    expect(doubled.context.count).toBe(20);

    const squared = multiplier.square();
    expect(squared.context.count).toBe(100);
  });
});

describe('state()', () => {
  it('should work as createMachine when called with 2 arguments (traditional pattern)', () => {
    const machine = state({ count: 0 }, {
      increment() {
        return createMachine({ count: this.context.count + 1 }, this);
      },
      decrement() {
        return createMachine({ count: this.context.count - 1 }, this);
      }
    });

    expect(machine.context.count).toBe(0);
    expect(typeof machine.increment).toBe('function');
    expect(typeof machine.decrement).toBe('function');

    const incremented = machine.increment();
    expect(incremented.context.count).toBe(1);

    const decremented = incremented.decrement();
    expect(decremented.context.count).toBe(0);
  });

  it('should work as createFunctionalMachine when called with 1 argument (functional pattern)', () => {
    const createCounter = state({ count: 0 });

    // Should return a function that takes transformers
    expect(typeof createCounter).toBe('function');

    const counter = createCounter({
      increment: (ctx) => ({ count: ctx.count + 1 }),
      add: (ctx, amount: number) => ({ count: ctx.count + amount }),
      reset: (ctx) => ({ count: 0 })
    });

    expect(counter.context.count).toBe(0);
    expect(typeof counter.increment).toBe('function');
    expect(typeof counter.add).toBe('function');
    expect(typeof counter.reset).toBe('function');

    const result = counter.increment().add(5).reset();
    expect(result.context.count).toBe(0);
  });

  it('should maintain type safety in both patterns', () => {
    // Traditional pattern
    const traditional = state({ value: 'hello' }, {
      uppercase() {
        return createMachine({ value: this.context.value.toUpperCase() }, this);
      }
    });

    // TypeScript should know about the uppercase method
    const upper = traditional.uppercase();
    expect(upper.context.value).toBe('HELLO');

    // Functional pattern
    const createStringMachine = state({ text: 'world' });
    const functional = createStringMachine({
      reverse: (ctx) => ({ text: ctx.text.split('').reverse().join('') }),
      append: (ctx, suffix: string) => ({ text: ctx.text + suffix })
    });

    // TypeScript should know about reverse and append methods
    const reversed = functional.reverse();
    expect(reversed.context.text).toBe('dlrow');

    const appended = functional.append('!');
    expect(appended.context.text).toBe('world!');
  });

  it('should handle edge cases correctly', () => {
    // Empty transitions object (should still work as traditional pattern)
    const emptyTransitions = state({ count: 0 }, {});
    expect(emptyTransitions.context.count).toBe(0);

    // Complex context types
    const complexContext = {
      user: { name: 'Alice', age: 30 },
      settings: { theme: 'dark' as const },
      data: [1, 2, 3]
    };

    const complexMachine = state(complexContext, {
      updateName(newName: string) {
        return createMachine({
          ...this.context,
          user: { ...this.context.user, name: newName }
        }, this);
      }
    });

    const updated = complexMachine.updateName('Bob');
    expect(updated.context.user.name).toBe('Bob');
    expect(updated.context.settings.theme).toBe('dark');
    expect(updated.context.data).toEqual([1, 2, 3]);
  });

  it('should work with async machines in traditional pattern', () => {
    // Note: This tests that the function correctly delegates to createMachine
    // which handles both sync and async patterns
    const asyncMachine = state({ loading: false }, {
      async fetchData() {
        // Simulate async operation
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(createMachine({ loading: false }, this));
          }, 1);
        });
      }
    });

    expect(asyncMachine.context.loading).toBe(false);
    expect(typeof asyncMachine.fetchData).toBe('function');
  });
});