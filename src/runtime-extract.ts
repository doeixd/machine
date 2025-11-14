/**
 * @file Runtime statechart extraction utilities
 * @description Extract statecharts from running machine instances using Symbol-based metadata
 */

import { RUNTIME_META, type RuntimeTransitionMeta } from './primitives';

/**
 * Extract metadata from a single function if it has runtime metadata attached
 *
 * @param fn - Function to extract from
 * @returns Metadata object or null if no metadata
 */
export function extractFunctionMetadata(fn: any): RuntimeTransitionMeta | null {
  if (typeof fn !== 'function') {
    return null;
  }

  const meta = fn[RUNTIME_META];
  return meta || null;
}

/**
 * Extract state node from a machine class instance
 *
 * @param stateInstance - Instance of a machine state class
 * @returns State node with transitions
 */
export function extractStateNode(stateInstance: any): any {
  const stateNode: any = { on: {} };
  const invoke: any[] = [];

  // Iterate over all properties
  for (const key in stateInstance) {
    const value = stateInstance[key];

    if (typeof value !== 'function') {
      continue;
    }

    const meta = extractFunctionMetadata(value);
    if (!meta) {
      continue;
    }

    // Separate invoke from transitions
    if (meta.invoke) {
      invoke.push({
        src: meta.invoke.src,
        onDone: { target: meta.invoke.onDone },
        onError: { target: meta.invoke.onError },
        description: meta.invoke.description
      });
    }

    // If has target, it's a transition
    if (meta.target) {
      const transition: any = { target: meta.target };

      if (meta.description) {
        transition.description = meta.description;
      }

      if (meta.guards && meta.guards.length > 0) {
        transition.cond = meta.guards.map(g => g.name).join(' && ');
      }

      if (meta.actions && meta.actions.length > 0) {
        transition.actions = meta.actions.map(a => a.name);
      }

      stateNode.on[key] = transition;
    }
  }

  if (invoke.length > 0) {
    stateNode.invoke = invoke;
  }

  return stateNode;
}

/**
 * Generate a complete statechart from multiple state class instances
 *
 * @param states - Object mapping state names to state instances
 * @param config - Chart configuration
 * @returns XState-compatible statechart JSON
 *
 * @example
 * const chart = generateStatechart({
 *   'LoggedOut': new LoggedOutMachine(),
 *   'LoggedIn': new LoggedInMachine()
 * }, {
 *   id: 'auth',
 *   initial: 'LoggedOut'
 * });
 */
export function generateStatechart(
  states: Record<string, any>,
  config: { id: string; initial: string; description?: string }
): any {
  const chart: any = {
    id: config.id,
    initial: config.initial,
    states: {}
  };

  if (config.description) {
    chart.description = config.description;
  }

  for (const [stateName, stateInstance] of Object.entries(states)) {
    chart.states[stateName] = extractStateNode(stateInstance);
  }

  return chart;
}

/**
 * Convenience function to extract statechart from a single machine instance
 * Useful for simple machines with a single context but multiple transitions
 *
 * @param machineInstance - Machine instance
 * @param config - Chart configuration
 * @returns XState-compatible statechart JSON
 */
export function extractFromInstance(
  machineInstance: any,
  config: { id: string; stateName?: string }
): any {
  const stateName = config.stateName || machineInstance.constructor.name || 'State';

  return {
    id: config.id,
    initial: stateName,
    states: {
      [stateName]: extractStateNode(machineInstance)
    }
  };
}
