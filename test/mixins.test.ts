import { describe, it, expect } from 'vitest';
import { MachineBase, MachineUnion, MachineExclude } from '../src/index';

describe('Machine Mixins', () => {
  // Define some base machines for testing
  class Counter extends MachineBase<{ count: number }> {
    increment() {
      return new Counter({ ...this.context, count: this.context.count + 1 });
    }
  }

  class Toggler extends MachineBase<{ active: boolean }> {
    toggle() {
      return new Toggler({ ...this.context, active: !this.context.active });
    }

    // A method that might conflict if not handled
    reset() {
      return new Toggler({ ...this.context, active: false });
    }
  }

  class Named extends MachineBase<{ name: string }> {
    setName(name: string) {
      return new Named({ ...this.context, name });
    }
  }

  describe('MachineUnion', () => {
    // Create a union of Counter and Toggler
    class Combined extends MachineUnion(Counter, Toggler, Named) { }

    it('should combine context types and values', () => {
      const initial = { count: 0, active: false, name: 'test' };
      const machine = new Combined(initial);

      expect(machine.context).toEqual(initial);
      expect(machine.context.count).toBe(0);
      expect(machine.context.active).toBe(false);
      expect(machine.context.name).toBe('test');
    });

    it('should inherit methods from all mixed classes', () => {
      const machine = new Combined({ count: 10, active: true, name: 'Alice' });

      // Test Counter method
      // Note: In a real implementation where methods return specialized instances (like `new Counter`),
      // the return type at runtime might be `Counter` not `Combined` unless the methods are polymorphic 
      // or overridden.
      // However, for the mixin to work "seamlessly", the methods should work on the `this` context.
      // Since `Counter.increment` returns `new Counter`, the result IS a Counter.
      // But we probably want the result to be treated as a valid state...

      const nextCount = machine.increment();
      expect(nextCount.context.count).toBe(11);
      // The context of the result should ideally prevent data loss, but standard inheritance 
      // of `new Counter` will drop 'active' and 'name' if strict. 
      // However, MachineBase just holds the context reference passed to it.
      // Let's see what happens at runtime. `new Counter({...})` will just wrap the object.
      // If `increment` spreads `this.context`, it spreads ALL props including name/active.
      expect((nextCount.context as any).active).toBe(true);
      expect((nextCount.context as any).name).toBe('Alice');
    });

    it('should allow usage of second mixin methods', () => {
      const machine = new Combined({ count: 0, active: false, name: 'Bob' });
      const toggled = machine.toggle();

      expect(toggled.context.active).toBe(true);
      expect((toggled.context as any).count).toBe(0);
    });
  });

  describe('MachineExclude', () => {
    // Start with a combined machine
    class Full extends MachineUnion(Counter, Toggler) { }

    // Create a version that excludes Toggler functionality
    class JustCounter extends MachineExclude(Full, Toggler) { }

    it('should have Counter methods', () => {
      const machine = new JustCounter({ count: 5, active: true }); // It still requires full context type
      expect(machine.increment).toBeDefined();

      const next = machine.increment();
      expect(next.context.count).toBe(6);
    });

    it('should NOT have Toggler methods at runtime', () => {
      const machine = new JustCounter({ count: 5, active: true });

      // TypeScript should error here if we tried to call it:
      // machine.toggle(); 

      // Runtime check
      expect((machine as any).toggle).toBeUndefined();
    });
  });
});
