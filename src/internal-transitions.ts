const TRANSITIONS_SYMBOL = Symbol.for("__machine_transitions__");

export type TransitionMap = Record<string, (...args: any[]) => any>;

export function attachTransitions<T extends object>(
  machine: T,
  transitions: TransitionMap
): T {
  Object.defineProperty(machine, TRANSITIONS_SYMBOL, {
    value: transitions,
    enumerable: false,
    configurable: false,
  });
  return machine;
}

export function getStoredTransitions(machine: any): TransitionMap | undefined {
  if (!machine || typeof machine !== "object") {
    return undefined;
  }
  return machine[TRANSITIONS_SYMBOL];
}

export function snapshotOwnTransitions(source: any): TransitionMap {
  if (!source || typeof source !== "object") {
    return {};
  }

  const transitions: TransitionMap = {};
  let current: object | null = source;

  while (current && current !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (key === "constructor" || key === "context" || key in transitions) continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (typeof descriptor?.value === "function") {
        transitions[key] = descriptor.value;
      }
    }
    current = Object.getPrototypeOf(current);
  }

  return transitions;
}
