import { describe, it, expect } from 'vitest';
import { MachineBase, MachineUnion, MachineExclude } from '../src/index';

describe('Advanced Exclusion Scenarios', () => {
  class A extends MachineBase<{ a: number }> {
    incA() {
      return new A({ ...this.context, a: this.context.a + 1 });
    }
  }

  class B extends MachineBase<{ b: number }> {
    incB() {
      return new B({ ...this.context, b: this.context.b + 1 });
    }
    secret() {
      return new B({ ...this.context, b: -1 });
    }
  }

  // Combined Machine
  class AB extends MachineUnion(A, B) { }

  // Restricted Machine
  class Restricted extends MachineExclude(AB, B) { }

  it('should allow chaining of allowed methods', () => {
    const machine = new Restricted({ a: 0, b: 0 });

    // incA exists. Calling it should return Restricted machine.
    // If it returned A, we wouldn't see incA on the result ( wait, A has incA).
    // If it returned AB, we would see incB on the result.

    const next = machine.incA();
    expect(next.context.a).toBe(1);

    // Runtime check: incB should NOT exist on the result if wrapping worked
    expect((next as any).incB).toBeUndefined();
  });
});
