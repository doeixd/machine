
// A unique symbol to hold our metadata in the type system.
export const META_KEY = Symbol("MachineMeta");

// The shape of our type-level metadata.
export interface TransitionMeta {
  target?: string;
  guards?: { name: string; description?: string }[];
  invoke?: { src: string; onDone: string; onError: string };
}

// A branded type. It's a function F with hidden metadata M.
export type WithMeta<
  F extends (...args: any[]) => any,
  M extends TransitionMeta
> = F & { [META_KEY]: M };

// --- Primitives ---

/**
 * Defines a simple transition to a target state.
 */
export function transitionTo<T extends string, F extends (...args: any[]) => any>(
  target: T,
  implementation: F
): WithMeta<F, { target: T }> {
  // At runtime, this is an identity function. Its only job is to add a type.
  return implementation as any;
}

/**
 * Adds a guard condition to a transition.
 */
export function guarded<F extends (...args: any[]) => any, M extends TransitionMeta>(
  guard: { name: string; description?: string },
  transition: WithMeta<F, M>
): WithMeta<F, M & { guards: [typeof guard] }> {
  // Again, an identity function at runtime.
  // The actual guard logic still lives inside the implementation.
  return transition as any;
}

/**
 * Defines an invoked service.
 */
export function invoke<D extends string, E extends string, F extends (...args: any[]) => any>(
  service: { src: string; onDone: D; onError: E },
  implementation: F
): WithMeta<F, { invoke: typeof service }> {
  return implementation as any;
}


export function analyzeMachine(machineClass: new (...args: any[]) => any): object {
  const chart: any = {
    id: machineClass.name,
    initial: undefined,
    states: {},
  };

  const stateName = machineClass.name;
  chart.states[stateName] = { on: {} };

  for (const key of Object.getOwnPropertyNames(machineClass.prototype)) {
    if (key === "constructor") continue;

    const member = machineClass.prototype[key] as any;
    if (typeof member === "function" && member.meta) {
      const meta: TransitionMeta = member.meta;
      const onEntry: any = {};

      if (meta.target) {
        onEntry.target = meta.target;
      }
      if (meta.description) {
        onEntry.description = meta.description;
      }
      if (meta.guards) {
        // Stately/XState syntax for guards is 'cond'
        onEntry.cond = meta.guards.map(g => g.name).join(' && ');
      }
      
      // Handle invoked services separately, as they are a state property
      if (meta.invoke) {
        if (!chart.states[stateName].invoke) {
          chart.states[stateName].invoke = [];
        }
        chart.states[stateName].invoke.push({
          src: meta.invoke.src,
          onDone: { target: meta.invoke.onDone },
          onError: { target: meta.invoke.onError },
        });
      }

      // Only add to 'on' if it's a direct transition event
      if (meta.target) {
          chart.states[stateName].on[key] = onEntry;
      }
    }
  }

  return chart;
}


export interface GuardMeta {
  /** The name of the guard function (for visualization). */
  name: string;
  /** A description of the condition. */
  description?: string;
}

export interface InvokeMeta {
  /** A descriptive name for the invoked service. */
  src: string;
  /** The target state on successful completion. */
  onDone: string;
  /** The target state on error. */
  onError: string;
  /** A description of the service. */
  description?: string;
}

/**
 * Metadata to describe a transition for static analysis.
 */
export interface TransitionMeta {
  /** The name of the state this transition targets (for simple transitions). */
  target?: string;
  /** A description of what this transition does. */
  description?: string;
  /** An array of guards that must pass for this transition to occur. */
  guards?: GuardMeta[];
  /** A description of a service this transition invokes. */
  invoke?: InvokeMeta;
}


/**
 * A transition function that has been annotated with metadata.
 */
type AnnotatedFunction = ((...args: any[]) => any) & { meta: TransitionMeta };

/**
 * Wraps a transition function with metadata for static analysis.
 * This function is the key to making a code-defined machine formalizable.
 * It attaches the metadata to the function object itself without changing its behavior.
 *
 * @param fn The transition function implementation.
 * @param meta An object describing the transition (e.g., its target state).
 * @returns The original function, now with metadata attached.
 */
export function defineTransition<F extends (...args: any[]) => any>(
  fn: F,
  meta: TransitionMeta
): F {
  // Attach the metadata to a 'meta' property on the function object.
  Object.assign(fn, { meta });
  return fn;
}