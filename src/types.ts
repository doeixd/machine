/**
 * @fileoverview Utility types for the machine library.
 */

/**
 * Extracts state data from either a main-API or flat minimal machine.
 *
 * @typeParam M - Machine or flat snapshot to inspect.
 * @example
 * ```ts
 * type CounterData = Context<typeof counter>;
 * ```
 */
export type Context<M> = M extends { readonly context: infer C } ? C : M;

/**
 * Extracts transition members from either a main-API or flat minimal machine.
 *
 * For main machines this removes `context`; minimal snapshots are returned as-is
 * because their data and transitions intentionally share one flat shape.
 *
 * @typeParam M - Machine or flat snapshot to inspect.
 */
export type Transitions<M> = M extends { readonly context: any } ? Omit<M, 'context'> : M;

/**
 * Recursively marks object and array properties readonly while preserving
 * callable function types.
 *
 * @typeParam T - Value shape to make deeply readonly.
 */
export type DeepReadonly<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/**
 * Minimal structural contract for a tagged value.
 *
 * @typeParam T - Tag literal or tag-name union.
 */
export type Tagged<T extends string = string> = { readonly tag: T };

/**
 * Extracts the tag-name union from a tagged object or union.
 *
 * @typeParam T - Tagged shape to inspect.
 */
export type TagOf<T extends Tagged> = T['tag'];

/**
 * Converts a tag-to-payload map into a discriminated union.
 *
 * @typeParam M - Mapping whose keys become tags and values become payloads.
 * @example
 * ```ts
 * type PickMode = States<{
 *   idle: {},
 *   active: { isCloseMode: boolean; timeoutId: number }
 * }>;
 * ```
 */
export type States<M extends Record<string, object>> = {
  [K in keyof M]: { readonly tag: K } & M[K]
}[keyof M];

/**
 * Cleanup callback returned by lifecycle entry behavior.
 */
export type Cleanup = () => void;

/**
 * Extracts the machine returned by a factory function.
 *
 * @typeParam F - Factory function to inspect.
 * @example
 * ```ts
 * const factory = () => machine({ count: 0 }, { ... });
 * type MyMachine = InferMachine<typeof factory>;
 * ```
 */
export type InferMachine<F extends (...args: any[]) => any> = ReturnType<F>;

/**
 * Semantic alias for {@link InferMachine}.
 *
 * @typeParam F - Machine factory function to inspect.
 */
export type MachineOf<F extends (...args: any[]) => any> = InferMachine<F>;

/**
 * Factory for one member produced by inferred-mode {@link tag.enum}.
 *
 * The member's tag is fixed while its object payload is inferred per call.
 * Payloads cannot provide their own `tag` property.
 *
 * @typeParam K - Literal tag assigned by this factory.
 */
export interface TaggedEnumMember<K extends string> {
  (): { readonly tag: K };
  <P extends object>(payload: P & { readonly tag?: never }): { readonly tag: K } & P;
}

/**
 * Frozen tag-named collection produced by inferred-mode {@link tag.enum}.
 *
 * @typeParam Members - Tuple of tagged definitions naming available members.
 */
export type TaggedEnum<Members extends readonly Tagged[]> = {
  readonly [K in Members[number]['tag']]: TaggedEnumMember<K>;
};

type TaggedPayload<State extends Tagged, K extends TagOf<State>> =
  Omit<Extract<State, { tag: K }>, 'tag'>;

/**
 * Schema-constrained factory for one member of a tagged union.
 *
 * Empty payloads accept no argument; non-empty payloads require the exact
 * declared fields under normal TypeScript structural typing.
 *
 * @typeParam State - Complete tagged union defining payload schemas.
 * @typeParam K - Member tag selected from `State`.
 */
export type ConstrainedTaggedEnumMember<
  State extends Tagged,
  K extends TagOf<State>
> = keyof TaggedPayload<State, K> extends never
  ? () => Extract<State, { tag: K }>
  : (
      payload: TaggedPayload<State, K> & { readonly tag?: never }
    ) => Extract<State, { tag: K }>;

/**
 * A tag-named collection whose payloads are constrained by `State`.
 *
 * Only the definitions supplied to `tag.enum<State>()(...)` are exposed.
 *
 * @typeParam State - Tagged union defining every payload schema.
 * @typeParam Members - Runtime tag definitions exposed on the result.
 */
export type ConstrainedTaggedEnum<
  State extends Tagged,
  Members extends readonly Tagged<TagOf<State>>[]
> = {
  readonly [K in Members[number]['tag']]: ConstrainedTaggedEnumMember<State, K>;
};

/**
 * Creates a tagged object while preserving the tag's literal type.
 *
 * The object overload returns an existing tagged object unchanged. In the
 * name-and-payload overload, the supplied name wins over any runtime `tag`
 * property in the payload.
 *
 * @example
 * ```ts
 * const idle = tag('idle');
 * const loading = tag('loading', { url: '/api' });
 * ```
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
 * @typeParam C - Payload accepted by the factory.
 * @typeParam T - Optional additional return members.
 * @typeParam K - Literal tag bound by `name`.
 * @param name - Tag assigned to every result.
 * @returns A payload-to-tagged-value factory.
 * @example
 * ```ts
 * const idle = tag.factory<{ count: number }>('idle');
 * idle({ count: 0 });
 * ```
 */
function createTagFactory<C extends object, T extends object = {}, K extends string = string>(name: K): (props: C) => { readonly tag: K } & C & T;
/**
 * Creates a curried tag factory constrained to the members of a tagged union.
 *
 * @typeParam C - Complete tagged union used for tag and payload checking.
 * @typeParam T - Optional additional return members.
 * @returns A tag selector followed by its schema-checked payload factory.
 * @example
 * ```ts
 * const state = tag.factory<AppState>()('idle');
 * state({ count: 0 });
 * ```
 */
function createTagFactory<C extends Tagged, T extends object = {}>(): <K extends TagOf<C>>(name: K) => (props: Omit<Extract<C, { tag: K }>, 'tag'>) => Extract<C, { tag: K }> & T;
function createTagFactory(name?: string) {
  if (name !== undefined) {
    return (props: object) => createTag(name, props);
  }
  return (tagName: string) => (props: object) => createTag(tagName, props);
}

/**
 * Creates a schema-constrained tagged-enum builder.
 *
 * @typeParam State - Tagged union that defines each member's payload.
 * @returns A builder that accepts the enum's runtime tag definitions.
 *
 * @example
 * ```ts
 * type RequestState = States<{
 *   idle: {};
 *   loading: { url: string };
 * }>;
 *
 * const Request = tag.enum<RequestState>()(
 *   tag('idle'),
 *   tag('loading'),
 * );
 *
 * Request.idle();
 * Request.loading({ url: '/api' });
 * ```
 */
function createTaggedEnum<State extends Tagged>(): <
  const Members extends readonly Tagged<TagOf<State>>[]
>(...members: Members) => ConstrainedTaggedEnum<State, Members>;
/**
 * Creates a namespace of tag factories whose payloads are inferred per call.
 *
 * @typeParam Members - Tuple of tag definitions used as property names.
 * @param members - Unique tagged values naming the factories to create.
 * @returns A frozen object with one factory per declared tag.
 * @throws {Error} If the same tag is declared more than once.
 *
 * @example
 * ```ts
 * const Status = tag.enum(tag('idle'), tag('loading'));
 * const loading = Status.loading({ url: '/api' });
 * // { tag: 'loading', url: '/api' }
 * ```
 */
function createTaggedEnum<const Members extends readonly Tagged[]>(
  ...members: Members
): TaggedEnum<Members>;
function createTaggedEnum(...members: readonly Tagged[]): unknown {
  if (members.length === 0) {
    return ((...definitions: readonly Tagged[]) =>
      buildTaggedEnum(definitions));
  }

  return buildTaggedEnum(members);
}

function buildTaggedEnum(members: readonly Tagged[]): TaggedEnum<readonly Tagged[]> {
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

  return Object.freeze(result) as TaggedEnum<readonly Tagged[]>;
}

/**
 * Creates tagged values and exposes `tag.factory()` and `tag.enum()` helpers.
 *
 * @example
 * ```ts
 * const loading = tag('loading', { url: '/api' });
 * const Status = tag.enum(tag('idle'), tag('loading'));
 * ```
 */
export const tag = Object.assign(createTag, {
  factory: createTagFactory,
  enum: createTaggedEnum,
});

/**
 * Tests and narrows a tagged object or union to one tag.
 *
 * @typeParam M - Tagged value or union being narrowed.
 * @typeParam Tag - Allowed tag selected from `M`.
 * @param machine - Tagged value to inspect.
 * @param tagValue - Tag to compare against.
 * @returns Whether `machine.tag` equals `tagValue`.
 * @example
 * ```ts
 * if (isState(request, 'loading')) {
 *   request.url; // narrowed loading payload
 * }
 * ```
 */
export function isState<M extends Tagged, Tag extends TagOf<M>>(
  machine: M,
  tagValue: Tag
): machine is Extract<M, { tag: Tag }> {
  return (machine as Tagged).tag === tagValue;
}

/**
 * Recursively freezes an object graph and returns a deeply readonly type.
 *
 * Cycles are supported through identity tracking. Functions and primitive
 * values are left intact; every reachable object and array is frozen.
 *
 * @typeParam T - Root object type.
 * @param obj - Object graph to freeze in place.
 * @returns The same object reference with a deeply readonly type.
 * @example
 * ```ts
 * const config = freeze({ nested: { enabled: true } });
 * // config.nested.enabled = false; // TypeScript error
 * ```
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
