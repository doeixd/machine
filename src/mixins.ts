import { MachineBase } from './index';

// =============================================================================
// HELPER TYPES
// =============================================================================

/**
 * Constructable class type used by the machine-mixin utilities.
 *
 * @typeParam T - Instance type produced by the constructor.
 */
export type Constructor<T = any> = new (...args: any[]) => T;

/**
 * Helper to convert a tuple of types into an intersection of those types.
 * e.g. [A, B] -> A & B
 * @typeParam U - Union to distribute and intersect.
 */
export type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;

/**
 * Extracts the instance type from a constructor.
 * @typeParam T - Constructor type to inspect.
 */
export type Instance<T> = T extends new (...args: any[]) => infer R ? R : never;

/**
 * Extracts the Context type from a MachineBase subclass.
 * @typeParam T - Machine instance type to inspect.
 */
export type ExtractContext<T> = T extends MachineBase<infer C> ? C : never;

/**
 * Combined context type for a union of machines.
 * @typeParam T - Tuple of machine constructors whose contexts are intersected.
 */
export type CombinedContext<T extends Constructor[]> = UnionToIntersection<ExtractContext<Instance<T[number]>>> & object;

/**
 * Combined instance type for a union of machines.
 * @typeParam T - Tuple of machine constructors whose instances are intersected.
 */
export type CombinedInstance<T extends Constructor[]> = UnionToIntersection<Instance<T[number]>>;

/**
 * The instance type of a MachineUnion, with methods remapped to return the union type.
 * @typeParam T - Tuple of machine constructors being combined.
 */
export type MachineUnionInstance<T extends Constructor[]> = {
  [K in keyof CombinedInstance<T>]: CombinedInstance<T>[K] extends (...args: infer Args) => any
  ? (...args: Args) => MachineUnionInstance<T>
  : CombinedInstance<T>[K]
} & CombinedInstance<T>;

/**
 * The constructor type for a MachineUnion.
 * @typeParam T - Tuple of machine constructors being combined.
 */
export type MachineUnionConstructor<T extends Constructor[]> = new (context: CombinedContext<T>) => MachineUnionInstance<T>;

// =============================================================================
// HELPERS
// =============================================================================

function getAllPropertyDescriptors(obj: any) {
  const descriptors: PropertyDescriptorMap = {};
  let current = obj;
  while (current && current !== Object.prototype) {
    const props = Object.getOwnPropertyDescriptors(current);
    for (const [key, desc] of Object.entries(props)) {
      if (key === 'constructor') continue;
      // Don't overwrite properties from child classes (which we visited first)
      if (!(key in descriptors)) {
        descriptors[key] = desc;
      }
    }
    current = Object.getPrototypeOf(current);
  }
  return descriptors;
}

// =============================================================================
// MACHINE UNION
// =============================================================================

/**
 * Creates a new class that combines the functionality of multiple Machine classes.
 *
 * This utility effectively implements multiple inheritance for State Machines.
 * It merges the prototypes of all provided classes into a single new class,
 * preserving the type safety of contexts and methods.
 *
 * Crucially, it **wraps** inherited methods to ensure they return instances
 * of the *Combined* machine, enabling fluent method chaining across different
 * mixed-in capabilities.
 *
 * @param machines - A list of Machine classes to combine.
 * @returns A new class constructor that inherits from all input classes.
 * @typeParam T - Constructor tuple used to infer combined context and methods.
 * @throws {TypeError} At construction if no usable base constructor is supplied.
 *
 * @example
 * ```typescript
 * class A extends MachineBase<{ a: number }> {
 *   incA() { return new A({ a: this.context.a + 1 }); }
 * }
 * class B extends MachineBase<{ b: number }> {
 *   incB() { return new B({ b: this.context.b + 1 }); }
 * }
 *
 * class AB extends MachineUnion(A, B) {}
 *
 * const machine = new AB({ a: 0, b: 0 });
 * machine.incA().incB(); // Type-safe chaining!
 * ```
 */
export function MachineUnion<T extends Constructor[]>(...machines: T): MachineUnionConstructor<T> {
  // calculate the combined context type (intersection of all contexts)
  type Context = CombinedContext<T>;

  // The base class to extend.
  const Base = machines[0] as unknown as Constructor<MachineBase<Context>>;

  class CombinedMachine extends Base {
    constructor(context: Context) {
      super(context);
    }
  }

  // Helper to wrap methods
  const wrapMethod = (fn: Function) => {
    return function (this: CombinedMachine, ...args: any[]) {
      // 1. Call the original method. It will return an instance of the *original* class (e.g. A)
      //    with the updated context FOR A.
      //    Inheritance means 'this' is the CombinedMachine, which matches A's expectations
      //    (covariance) for input, but the output is typed as A.
      const result = fn.apply(this, args);

      // 2. Check if the result is a Machine (has context)
      if (result && typeof result === 'object' && 'context' in result) {
        // 3. Create a NEW CombinedMachine instance.
        //    We merge the current context (to keep props from B)
        //    with the result context (updates from A).
        //    Using Object.assign or spread for performance/safety.
        const newContext = { ...this.context, ...result.context };
        return new CombinedMachine(newContext);
      }

      // If not a machine, returns raw result
      return result;
    };
  };

  // Mixin logic: Copy properties from all prototypes.
  // We process ALL machines (including the first one) to ensure wrapping logic is applied to all.
  for (const machine of machines) {
    const descriptors = getAllPropertyDescriptors(machine.prototype);

    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (key === 'constructor') continue;

      // Logic: If it's a function (method), wrap it to return CombinedMachine.
      if (typeof descriptor.value === 'function') {
        const originalFn = descriptor.value;
        const wrappedFn = wrapMethod(originalFn);

        Object.defineProperty(CombinedMachine.prototype, key, {
          ...descriptor,
          value: wrappedFn,
        });
      } else {
        // Copy getters/setters/values as is
        Object.defineProperty(CombinedMachine.prototype, key, descriptor);
      }
    }
  }

  return CombinedMachine as unknown as MachineUnionConstructor<T>;
}

// =============================================================================
// MACHINE EXCLUDE
// =============================================================================

/**
 * Creates a new class that extends a Source machine but excludes methods defined in one or more Excluded classes.
 *
 * This is useful for "subtracting" functionality from a combined machine or
 * creating a restricted view of a larger machine.
 *
 * @param Source - The class to extend and extract methods from.
 * @param Excluded - One or more classes defining methods to remove.
 * @returns A new class with the subset of methods.
 * @typeParam S - Source constructor type.
 * @typeParam E - Tuple of constructors whose methods are removed.
 *
 * @example
 * ```typescript
 * class Admin extends MachineUnion(Viewer, Editor, Moderator) {}
 * class Guest extends MachineExclude(Admin, Editor, Moderator) {}
 * ```
 */
export function MachineExclude<
  S extends Constructor,
  E extends Constructor[]
>(Source: S, ...Excluded: E) {
  // The resulting type: Instance of Source Omit keys of Instance of Excluded[number]
  // But we still need checking for Context compatibility
  type SourceInstance = Instance<S>;
  type ExcludedUnion = Instance<E[number]>;
  // We must EXCLUDE 'context' from the keys to omit, otherwise we remove the context property!
  type ResultInstance = Omit<SourceInstance, Exclude<keyof ExcludedUnion, 'context'>>;
  type ResultContext = ExtractContext<SourceInstance>;

  class ExcludedMachine extends MachineBase<ResultContext> {
    constructor(context: ResultContext) {
      super(context);
    }
  }

  // 1. Copy everything from Source (flattened)
  const sourceDescriptors = getAllPropertyDescriptors(Source.prototype);
  for (const [key, descriptor] of Object.entries(sourceDescriptors)) {
    if (key === 'constructor') continue;
    // We bind/wrap methods if source was NOT already wrapped (e.g. if Source is plain A).
    // If Source is already a MachineUnion, its methods are already wrapped to return Source.

    if (typeof descriptor.value === 'function') {
      const originalFn = descriptor.value;

      // We wrap to ensure return type is ExcludedMachine (security/safety)
      // Otherwise calling an allowed method might return the Source type,
      // which would expose Excluded methods ("leaking" capabilities).
      const wrappedFn = function (this: ExcludedMachine, ...args: any[]) {
        const result = originalFn.apply(this, args);

        // Re-wrap to ExcludedMachine to maintain restriction chain
        if (result && typeof result === 'object' && 'context' in result) {
          return new ExcludedMachine({ ...this.context, ...result.context });
        }
        return result;
      }
      Object.defineProperty(ExcludedMachine.prototype, key, { ...descriptor, value: wrappedFn });
    } else {
      Object.defineProperty(ExcludedMachine.prototype, key, descriptor);
    }
  }

  // 2. Remove things from ALL Excluded classes
  for (const Excl of Excluded) {
    const excludedDescriptors = getAllPropertyDescriptors(Excl.prototype);
    for (const key of Object.keys(excludedDescriptors)) {
      if (Object.prototype.hasOwnProperty.call(ExcludedMachine.prototype, key)) {
        // Technically strict delete, though wrapping above already protects return types.
        // This cleaning is for runtime safety (property won't exist).
        delete (ExcludedMachine.prototype as any)[key];
      }
    }
  }

  return ExcludedMachine as unknown as new (context: ResultContext) => ResultInstance;
}

// =============================================================================
// FUNCTIONAL HELPERS
// =============================================================================

/**
 * Functional helper to combine multiple Machine instances into a single union instance.
 *
 * Automatically merges the contexts of all provided instances and creates a new
 * `MachineUnion` class on the fly.
 *
 * @param instances - Variadic list of machine instances to combine.
 * @returns A new instance of the combined machine.
 * @typeParam T - Machine-instance tuple to combine.
 *
 * @example
 * ```typescript
 * const counter = new Counter({ count: 0 });
 * const toggler = new Toggler({ active: true });
 *
 * const app = machineUnion(counter, toggler);
 * app.increment().toggle(); // Works! logic merged.
 * ```
 */
export function machineUnion<T extends MachineBase<any>[]>(
  ...instances: T
): Instance<MachineUnionConstructor<{ [K in keyof T]: T[K] extends MachineBase<any> ? Constructor<T[K]> : never }>> {
  const constructors = instances.map(i => i.constructor as Constructor);
  const contexts = instances.map(i => i.context);
  const mergedContext = Object.assign({}, ...contexts); // Shallow merge

  const CombinedClass = MachineUnion(...constructors);
  return new CombinedClass(mergedContext) as any;
}

/**
 * Functional helper to create a restricted machine instance by excluding behaviors
 * defined in other machine instances.
 *
 * @param source - The source machine instance.
 * @param excluded - Variadic list of machine instances whose methods should be excluded from source.
 * @returns A new instance restricted to the source's capabilities minus excluded ones.
 * @typeParam S - Source machine instance type.
 * @typeParam E - Tuple of machine instances defining excluded methods.
 *
 * @example
 * ```typescript
 * const fullApp = new AppMachine({ count: 0, active: true });
 * const guestApp = machineExclude(fullApp, new Toggler({ active: false }));
 * // guestApp.toggle(); // Error!
 * ```
 */
export function machineExclude<S extends MachineBase<any>, E extends MachineBase<any>[]>(
  source: S,
  ...excluded: E
) {
  const sourceCtor = source.constructor as Constructor<S>;
  const excludedCtors = excluded.map(e => e.constructor as Constructor<E[number]>);

  const ExcludedClass = MachineExclude(sourceCtor, ...excludedCtors);

  // Create instance with source's context (exclusions check prototype, not context)
  return new ExcludedClass(source.context);
}
