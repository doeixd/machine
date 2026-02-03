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
 * Utility to define a union of tagged states from a mapping type.
 * @example
 * type PickMode = States<{
 *   idle: {},
 *   active: { isCloseMode: boolean; timeoutId: number }
 * }>;
 */
export type States<M extends Record<string, object>> = {
  [K in keyof M]: { readonly tag: K } & M[K]
}[keyof M];

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
 * Namespace for tag factory utility.
 */
export namespace tag {
  /**
   * Creates a pre-bound tag factory for a specific state.
   * 
   * @typeParam C - Context (data) type
   * @typeParam T - Transitions type (optional, for machine return types)
   * @param name - The tag name for this state
   * @returns A function that takes context data and returns a tagged object
   * 
   * @typeParam C - Context (data) type
   * @typeParam T - Transitions type (optional)
   * @param name - The tag name
   * @example const idle = tag.factory<{ count: number }>('idle');
   */
  export function factory<C extends object, T extends object = {}, K extends string = string>(name: K): (props: C) => { readonly tag: K } & C & T;
  /**
   * Creates a curried tag factory, ideal for use with the States utility.
   * @example const state = tag.factory<AppState>()('idle')({ count: 0 });
   */
  export function factory<C extends object, T extends object = {}>(): <K extends string>(name: K) => (props: Omit<Extract<C, { tag: K }>, 'tag'>) => (Extract<C, { tag: K }> extends never ? { readonly tag: K } & C : Extract<C, { tag: K }>) & T;

  export function factory(name?: string) {
    if (name) {
      return (props: any) => tag(name, props);
    }
    return (name: string) => (props: any) => tag(name, props);
  }
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
