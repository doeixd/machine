// ============================================================================
// DELEGATION: delegate()
// ============================================================================

/**
 * Extracts the names of all function properties (transitions) from a type.
 */
type TransitionNamesOf<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

/**
 * Extracts the argument types of a function.
 */
type ArgsOf<F> = F extends (...args: infer A) => any ? A : never;

/**
 * Creates delegated transitions that forward to a child and return the parent.
 * 
 * @typeParam Child - Child machine type
 * @typeParam Parent - Parent machine return type
 */
type DelegatedTransitions<
  Child extends object,
  Parent
> = {
    [K in TransitionNamesOf<Child>]: (
      ...args: ArgsOf<Child[K]>
    ) => Parent;
  };

/**
 * Renamed delegated transitions using a mapping object.
 * 
 * @typeParam Child - Child machine type
 * @typeParam Parent - Parent machine return type
 * @typeParam Mapping - Object mapping child transition names to parent names
 */
type RenamedDelegatedTransitions<
  Child extends object,
  Parent,
  Mapping extends Partial<Record<TransitionNamesOf<Child>, string>>
> = {
    [K in keyof Mapping as Mapping[K] extends string ? Mapping[K] : never]: K extends TransitionNamesOf<Child>
    ? (...args: ArgsOf<Child[K]>) => Parent
    : never;
  };

/**
 * Subset of delegated transitions.
 * 
 * @typeParam Child - Child machine type
 * @typeParam Parent - Parent machine return type
 * @typeParam Keys - Subset of child transition names to delegate
 */
type PickedDelegatedTransitions<
  Child extends object,
  Parent,
  Keys extends TransitionNamesOf<Child>
> = {
    [K in Keys]: (...args: ArgsOf<Child[K]>) => Parent;
  };

/**
 * Options for delegate function.
 */
type DelegateOptions<Child extends object> =
  | { pick: Array<TransitionNamesOf<Child>> }
  | { omit: Array<TransitionNamesOf<Child>> }
  | { rename: Partial<Record<TransitionNamesOf<Child>, string>> };

/**
 * Delegates child machine transitions to the parent level.
 * 
 * When a delegated transition is called on the parent, it:
 * 1. Calls the corresponding transition on the child
 * 2. Updates the parent's context with the new child state
 * 3. Returns a new parent machine
 * 
 * This enables "flat" composition where child transitions appear directly
 * on the parent, as opposed to `withChildren()` which namespaces them.
 * 
 * @typeParam Ctx - Parent context type
 * @typeParam Key - Key where child is stored in parent context
 * @typeParam R - Parent machine return type (e.g. Machine<Ctx, T>)
 * 
 * @param ctx - Current parent context (from transition factory)
 * @param key - Property key of the child machine in context
 * @param next - The `next` function from the parent's transition factory
 * @param options - Optional: pick, omit, or rename specific transitions
 * 
 * @returns Object of delegated transitions to spread into parent's transitions
 *
 * @example
 * ```ts
 * const parent = machine({ child: createCounter({ count: 0 }) }, (ctx, next) => ({
 *   ...delegate(ctx, 'child', next),
 * }));
 * const updated = parent.increment();
 * ```
 */
export function delegate<
  Ctx extends object,
  Key extends keyof Ctx,
  R,
  Child extends Ctx[Key] & object = Ctx[Key] & object
>(
  ctx: Ctx,
  key: Key,
  next: (c: Ctx) => R
): DelegatedTransitions<Child, R>;

/**
 * Delegates only the named child transitions.
 *
 * @typeParam Ctx - Parent context containing the child.
 * @typeParam Key - Parent context key containing the child machine.
 * @typeParam R - Parent snapshot returned by `next`.
 * @typeParam Child - Child machine type.
 * @typeParam Keys - Selected child transition names.
 * @param options.pick - Child transition names to expose unchanged.
 * @returns A transition object containing only `pick` members.
 */
export function delegate<
  Ctx extends object,
  Key extends keyof Ctx,
  R,
  Child extends Ctx[Key] & object,
  Keys extends TransitionNamesOf<Child>
>(
  ctx: Ctx,
  key: Key,
  next: (c: Ctx) => R,
  options: { pick: Keys[] }
): PickedDelegatedTransitions<Child, R, Keys>;

/**
 * Delegates every enumerable child transition except the named members.
 *
 * @typeParam Ctx - Parent context containing the child.
 * @typeParam Key - Parent context key containing the child machine.
 * @typeParam R - Parent snapshot returned by `next`.
 * @typeParam Child - Child machine type.
 * @typeParam Keys - Excluded child transition names.
 * @param options.omit - Child transition names to hide from the parent.
 * @returns Delegated transitions with omitted names removed from the type.
 */
export function delegate<
  Ctx extends object,
  Key extends keyof Ctx,
  R,
  Child extends Ctx[Key] & object,
  Keys extends TransitionNamesOf<Child>
>(
  ctx: Ctx,
  key: Key,
  next: (c: Ctx) => R,
  options: { omit: Keys[] }
): DelegatedTransitions<Omit<Child, Keys>, R>;

/**
 * Delegates and renames exactly the transitions present in the mapping.
 *
 * Unmapped child transitions are not included by this overload.
 *
 * @typeParam Ctx - Parent context containing the child.
 * @typeParam Key - Parent context key containing the child machine.
 * @typeParam R - Parent snapshot returned by `next`.
 * @typeParam Child - Child machine type.
 * @typeParam Mapping - Child-to-parent transition name mapping.
 * @param options.rename - Child-name to parent-name mapping.
 * @returns Delegated transitions keyed by the mapped parent names.
 */
export function delegate<
  Ctx extends object,
  Key extends keyof Ctx,
  R,
  Child extends Ctx[Key] & object,
  Mapping extends Partial<Record<TransitionNamesOf<Child>, string>>
>(
  ctx: Ctx,
  key: Key,
  next: (c: Ctx) => R,
  options: { rename: Mapping }
): RenamedDelegatedTransitions<Child, R, Mapping>;

/** @internal Runtime implementation shared by the public delegation overloads. */
export function delegate<
  Ctx extends object,
  Key extends keyof Ctx,
  R
>(
  ctx: Ctx,
  key: Key,
  next: (c: Ctx) => R,
  options?: DelegateOptions<Ctx[Key] & object>
): Record<string, (...args: unknown[]) => R> {
  const child = ctx[key] as Record<string, unknown>;
  const delegated: Record<string, (...args: unknown[]) => R> = {};

  // Get all function property names from child
  const allTransitions = Object.keys(child).filter(
    (k) => typeof child[k] === 'function'
  );

  // Determine which transitions to include and how to name them
  let transitionMap: Record<string, string>; // childName -> parentName

  if (!options) {
    // Delegate all with same names
    transitionMap = Object.fromEntries(allTransitions.map((t) => [t, t]));
  } else if ('pick' in options) {
    // Only picked transitions
    transitionMap = Object.fromEntries(
      (options.pick as string[]).filter((t) => allTransitions.includes(t)).map((t) => [t, t])
    );
  } else if ('omit' in options) {
    // All except omitted
    const omitSet = new Set(options.omit as string[]);
    transitionMap = Object.fromEntries(
      allTransitions.filter((t) => !omitSet.has(t)).map((t) => [t, t])
    );
  } else if ('rename' in options) {
    // Only renamed transitions with new names
    transitionMap = Object.fromEntries(
      Object.entries(options.rename as Record<string, string>).filter(
        ([childName]) => allTransitions.includes(childName)
      )
    );
  } else {
    transitionMap = {};
  }

  // Create delegated transitions
  for (const [childName, parentName] of Object.entries(transitionMap)) {
    const childTransition = child[childName] as (...args: unknown[]) => unknown;

    delegated[parentName] = (...args: unknown[]) => {
      const nextChild = childTransition.apply(child, args);
      return next({ ...ctx, [key]: nextChild } as Ctx);
    };
  }

  return delegated;
}

/**
 * Type helper to get transition names from a machine or object.
 * Useful for type-safe pick/omit/rename options.
 *
 * @typeParam M - Child machine or transition-bearing object to inspect.
 */
export type TransitionsOf<M> = TransitionNamesOf<M>;

// ============================================================================
// DELEGATION UTILITIES
// ============================================================================

/**
 * Creates a delegate helper bound to a specific context and next function.
 * Useful when delegating multiple children to avoid repetition.
 *
 * @typeParam Ctx - Parent context containing child snapshots.
 * @typeParam R - Parent result returned by `next`.
 * @param ctx - Current parent context.
 * @param next - Parent reconstruction callback.
 * @returns A child-keyed delegate function with the same options as {@link delegate}.
 * @example
 * ```ts
 * const d = createDelegate(ctx, next);
 * return {
 *   ...d('auth'),
 *   ...d('counter', { rename: { increment: 'incrementCounter' } }),
 * };
 * ```
 */
export function createDelegate<Ctx extends object, R>(
  ctx: Ctx,
  next: (c: Ctx) => R
) {
  return <Key extends keyof Ctx>(
    key: Key,
    options?: DelegateOptions<Ctx[Key] & object>
  ) => delegate(ctx, key, next, options as any);
}

/**
 * Delegates all transitions from multiple children, optionally with a prefix.
 *
 * Without prefixes, later children overwrite earlier transitions with the same
 * name. Pass `true` when child APIs can overlap.
 *
 * @typeParam Ctx - Parent context containing the selected children.
 * @typeParam Keys - Child keys to traverse.
 * @typeParam R - Parent result returned by `next`.
 * @param ctx - Current parent context.
 * @param keys - Child keys whose enumerable function properties are delegated.
 * @param next - Parent reconstruction callback.
 * @param prefix - Whether to expose names as `child_transition`.
 * @returns A runtime transition record; individual names are not statically enumerated.
 * @example
 * ```ts
 * const transitions = delegateAll(ctx, ['counter', 'timer'], next, true);
 * // transitions.counter_increment(), transitions.timer_reset(), ...
 * ```
 */
export function delegateAll<
  Ctx extends object,
  Keys extends keyof Ctx,
  R
>(
  ctx: Ctx,
  keys: Keys[],
  next: (c: Ctx) => R,
  prefix: boolean = false
): Record<string, (...args: unknown[]) => R> {
  const result: Record<string, (...args: unknown[]) => R> = {};

  for (const key of keys) {
    const child = ctx[key] as Record<string, unknown>;
    const transitions = Object.keys(child).filter(
      (k) => typeof child[k] === 'function'
    );

    for (const transitionName of transitions) {
      const parentName = prefix ? `${String(key)}_${transitionName}` : transitionName;
      const childTransition = child[transitionName] as (...args: unknown[]) => unknown;

      result[parentName] = (...args: unknown[]) => {
        const nextChild = childTransition.apply(child, args);
        return next({ ...ctx, [key]: nextChild } as Ctx);
      };
    }
  }

  return result;
}

/**
 * Type-safe helper to create a rename mapping for delegate.
 *
 * @typeParam M - Child machine whose transition names are allowed as keys.
 * @returns An identity function that preserves literal destination names.
 * @example
 * ```ts
 * const names = renameMap<typeof child>()({ submit: 'submitForm' });
 * ```
 */
export function renameMap<M extends object>() {
  return <T extends Partial<Record<TransitionNamesOf<M>, string>>>(mapping: T): T => mapping;
}
