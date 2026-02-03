/**
 * @fileoverview Utility types for the machine library.
 */

/**
 * Extracts the context type from a machine (works with regular and minimal machines).
 */
export type Context<M> = M extends { readonly context: infer C } ? C : M;

/**
 * Extracts the transitions type from a machine (works with regular and minimal machines).
 */
export type Transitions<M> = M extends { readonly context: any } & infer T ? T : M;

/**
 * A discriminated union type representing an event that can be dispatched to a machine.
 */
export type Tagged<T extends string = string> = { readonly tag: T };

/**
 * Extracts the tag literal type from a tagged object.
 */
export type TagOf<T extends Tagged> = T['tag'];

/**
 * Cleanup function returned from onEnter.
 */
export type Cleanup = () => void;

/**
 * Extracts the return type from a factory function.
 * @example
 * const factory = () => machine({ count: 0 }, { ... });
 * type MyMachine = InferMachine<typeof factory>;
 */
export type InferMachine<F extends (...args: any[]) => any> = ReturnType<F>;

/**
 * Alias for InferMachine, more descriptive for state machine contexts.
 */
export type MachineOf<F extends (...args: any[]) => any> = InferMachine<F>;

/**
 * Creates a tagged object or adds a tag to an existing object.
 */
export function tag<T extends string>(name: T): { tag: T };
export function tag<T extends string, O extends object>(name: T, props: O): { tag: T } & O;
export function tag<const T extends { tag: string }>(obj: T): T;
export function tag<T extends string, O extends object>(
  nameOrObj: T | { tag: string },
  props?: O
): { tag: T } | ({ tag: T } & O) | { tag: string } {
  if (typeof nameOrObj === 'object') {
    return nameOrObj;
  }
  if (props) {
    return { ...props, tag: nameOrObj };
  }
  return { tag: nameOrObj };
}

/**
 * Type guard to check if a machine or object is in a specific state.
 */
export function isState<M extends Tagged, Tag extends TagOf<M>>(
  machine: M,
  tagValue: Tag
): machine is Extract<M, { tag: Tag }> {
  return (machine as Tagged).tag === tagValue;
}

/**
 * Recursively freezes an object and its properties.
 */
export function freeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);
  if (typeof (Object as any).values === 'function') {
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') {
        freeze(value);
      }
    }
  }
  return obj;
}
