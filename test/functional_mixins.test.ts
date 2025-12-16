import { describe, it, expect } from 'vitest';
import { MachineBase } from '../src/index';
import { machineUnion, machineExclude } from '../src/mixins';

describe('Functional Mixin Helpers', () => {
  class Counter extends MachineBase<{ count: number }> {
    inc() {
      return new Counter({ count: this.context.count + 1 });
    }
  }

  class Toggler extends MachineBase<{ active: boolean }> {
    toggle() {
      return new Toggler({ active: !this.context.active });
    }
  }

  class Logger extends MachineBase<{ logs: string[] }> {
    log(msg: string) {
      return new Logger({ logs: [...this.context.logs, msg] });
    }
  }

  describe('machineUnion', () => {
    it('should combine multiple machine instances', () => {
      const c = new Counter({ count: 10 });
      const t = new Toggler({ active: true });
      const l = new Logger({ logs: [] });

      const app = machineUnion(c, t, l);

      expect(app.context).toEqual({ count: 10, active: true, logs: [] });
      expect(typeof app.inc).toBe('function');
      expect(typeof app.toggle).toBe('function');
      expect(typeof app.log).toBe('function');
    });

    it('should support fluent chaining on combined instance', () => {
      const c = new Counter({ count: 0 });
      const t = new Toggler({ active: false });

      const app = machineUnion(c, t);
      const next = app.inc().toggle().inc();

      expect(next.context).toEqual({ count: 2, active: true });
      expect(next.constructor.name).toBe('CombinedMachine');
    });
  });

  describe('machineExclude', () => {
    it('should exclude methods from a source instance', () => {
      const c = new Counter({ count: 0 });
      const t = new Toggler({ active: false });
      const app = machineUnion(c, t); // Has inc and toggle

      // Exclude toggler behavior
      const restricted = machineExclude(app, t);

      expect(restricted.context).toEqual({ count: 0, active: false });
      expect(typeof restricted.inc).toBe('function');
      expect((restricted as any).toggle).toBeUndefined();
    });

    it('should support variadic exclusion', () => {
      const c = new Counter({ count: 0 });
      const t = new Toggler({ active: false });
      const l = new Logger({ logs: [] });

      const app = machineUnion(c, t, l);

      // Exclude toggler and logger
      const simple = machineExclude(app, t, l);

      expect(simple.context).toEqual({ count: 0, active: false, logs: [] });
      expect(typeof simple.inc).toBe('function');
      expect((simple as any).toggle).toBeUndefined();
      expect((simple as any).log).toBeUndefined();
    });

    it('should return correct instance type and maintain context', () => {
      const c = new Counter({ count: 5 });
      const t = new Toggler({ active: true });
      const app = machineUnion(c, t);

      // Exclude Toggler
      const justCount = machineExclude(app, t);

      // Perform action on allowed method
      const next = justCount.inc();

      expect(next.context.count).toBe(6);
      expect(next.context.active).toBe(true); // Context preserved
      expect((next as any).toggle).toBeUndefined(); // Exclusion preserved
      expect(next instanceof MachineBase).toBe(true);
    });
  });
});
