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
export type Transitions<M> = M extends { readonly context: any } ? Omit<M, 'context'> : M;

/** Recursively marks object properties readonly. */
export type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

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

/** A factory for one member produced by {@link tag.enum}. */
export interface TaggedEnumMember<K extends string> {
  (): { readonly tag: K };
  <P extends object>(payload: P & { readonly tag?: never }): { readonly tag: K } & P;
}

/** A tag-named collection of tagged-object factories. */
export type TaggedEnum<Members extends readonly Tagged[]> = {
  readonly [K in Members[number]['tag']]: TaggedEnumMember<K>;
};

/**
 * Creates a tagged object or adds a tag to an existing object.
 */
function createTag<T extends string>(name: T): { tag: T };
function createTag<T extends string, O extends object>(name: T, props: O): { tag: T } & O;
function createTag<const T extends { tag: string }>(obj: T): T;
function createTag<T extends string, O extends object>(
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
 * Creates a pre-bound tag factory for a specific state.
 *
 * @example const idle = tag.factory<{ count: number }>('idle');
 */
function createTagFactory<C extends object, T extends object = {}, K extends string = string>(name: K): (props: C) => { readonly tag: K } & C & T;
/**
 * Creates a curried tag factory constrained to the members of a tagged union.
 * @example const state = tag.factory<AppState>()('idle')({ count: 0 });
 */
function createTagFactory<C extends Tagged, T extends object = {}>(): <K extends TagOf<C>>(name: K) => (props: Omit<Extract<C, { tag: K }>, 'tag'>) => Extract<C, { tag: K }> & T;
function createTagFactory(name?: string) {
  if (name !== undefined) {
    return (props: object) => createTag(name, props);
  }
  return (tagName: string) => (props: object) => createTag(tagName, props);
}

/**
 * Creates a namespace of factories from tag definitions.
 *
 * Payload types are inferred independently at each factory call. Use `States`
 * with `union` when every member needs a fixed payload contract.
 */
function createTaggedEnum<const Members extends readonly Tagged[]>(
  ...members: Members
): TaggedEnum<Members> {
  const result = Object.create(null) as Record<string, TaggedEnumMember<string>>;

  for (const member of members) {
    if (Object.prototype.hasOwnProperty.call(result, member.tag)) {
      throw new Error(`Cannot create tagged enum: duplicate tag '${member.tag}'.`);
    }

    Object.defineProperty(result, member.tag, {
      enumerable: true,
      value: (payload?: object) => payload === undefined
        ? createTag(member.tag)
        : createTag(member.tag, payload),
    });
  }

  return Object.freeze(result) as TaggedEnum<Members>;
}

/**
 * Creates tagged values and exposes reusable factory helpers.
 */
export const tag = Object.assign(createTag, {
  factory: createTagFactory,
  enum: createTaggedEnum,
});

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
export function freeze<T extends object>(obj: T): DeepReadonly<T> {
  deepFreeze(obj, new WeakSet<object>());
  return obj as DeepReadonly<T>;
}

function deepFreeze(value: object, seen: WeakSet<object>): void {
  if (seen.has(value)) return;
  seen.add(value);

  for (const nested of Object.values(value)) {
    if (nested !== null && typeof nested === 'object') {
      deepFreeze(nested, seen);
    }
  }
  Object.freeze(value);
}
