/**
 * @file Browser DevTools integration for @doeixd/machine
 * @description Connects state machines to browser extension for visualization and debugging
 */

import { runMachine, type AsyncEvent, type AsyncMachine } from './index';

/**
 * DevTools interface for browser extension communication
 */
export interface MachineDevTools {
  init(context: unknown): void;
  send(message: { type: string; payload: unknown }): void;
}

/**
 * Augment Window interface to include DevTools extension
 */
declare global {
  interface Window {
    __MACHINE_DEVTOOLS__?: MachineDevTools;
  }
}

/**
 * Async runner that records the latest dispatched event for DevTools messages.
 *
 * @typeParam M - Async machine controlled by the runner.
 */
export type DevToolsRunner<M extends AsyncMachine<any>> = ReturnType<typeof runMachine<M>> & {
  lastEvent?: AsyncEvent<M>;
};

/**
 * Connects a state machine to the browser DevTools extension
 * @template M - The async machine type
 * @param initialMachine - The initial machine instance
 * @returns A runner with DevTools integration
 *
 * @example
 * const runner = connectToDevTools(createAuthMachine());
 * runner.dispatch({ type: 'login', args: ['user'] });
 */
export function connectToDevTools<M extends AsyncMachine<any>>(
  initialMachine: M
): DevToolsRunner<M> {
  // Connect to the browser extension via window object or other means
  const devTools = typeof window !== 'undefined' ? window.__MACHINE_DEVTOOLS__ : undefined;
  if (!devTools) return runMachine(initialMachine) as DevToolsRunner<M>; // No DevTools, run normally

  // The key is the onChange handler
  const runner = runMachine(initialMachine, (nextState) => {
    // This is where we send data to the extension
    try {
      devTools.send({
        type: 'STATE_CHANGED',
        payload: {
          event: runner.lastEvent,
          context: nextState.context,
          currentState: stateName(nextState),
        }
      });
    } catch (error) {
      console.warn('[Machine DevTools] Failed to send state update:', error);
    }
  }) as DevToolsRunner<M>;

  // We wrap the dispatch function to capture the event
  const originalDispatch = runner.dispatch.bind(runner);
  runner.dispatch = ((event: AsyncEvent<M>) => {
    runner.lastEvent = event;
    return originalDispatch(event);
  }) as typeof runner.dispatch;

  try {
    devTools.init(initialMachine.context);
  } catch (error) {
    console.warn('[Machine DevTools] Failed to initialize:', error);
  }
  return runner;
}

function stateName(machine: AsyncMachine<any>): string {
  const context = machine.context as Record<string, unknown>;
  for (const key of ['status', 'state', 'tag'] as const) {
    if (typeof context[key] === 'string') return context[key];
  }
  return machine.constructor.name || 'Machine';
}
