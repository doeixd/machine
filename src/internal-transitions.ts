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
  const entries = Object.entries(source).filter(
    ([key, value]) => key !== "context" && typeof value === "function"
  );
  return Object.fromEntries(entries) as TransitionMap;
}
