import { describe, it, expect } from 'vitest';
import { MachineBase, MachineUnion } from '../src/index';

describe('Advanced Mixin Scenarios', () => {
  class A extends MachineBase<{ a: number }> {
    incA() {
      return new A({ ...this.context, a: this.context.a + 1 });
    }
  }

  class B extends MachineBase<{ b: number }> {
    incB() {
      return new B({ ...this.context, b: this.context.b + 1 });
    }
  }

  // Combined Machine
  class AB extends MachineUnion(A, B) { }

  it('should support fluent chaining across mixed types', () => {
    const machine = new AB({ a: 0, b: 0 });

    // 1. machine.incA() returns A (at runtime)
    const step1 = machine.incA();

    // 2. step1 should be an AB instance to allow .incB()
    // If it's just A, this will be undefined at runtime and compile-time error
    expect((step1 as any).incB).toBeDefined();

    const step2 = (step1 as any).incB();
    expect(step2.context.a).toBe(1);
    expect(step2.context.b).toBe(1);
  });
});
