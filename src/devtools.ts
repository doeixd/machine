/**
 * @file Browser DevTools integration for @doeixd/machine
 * @description Connects state machines to browser extension for visualization and debugging
 */

import { runMachine, Event, AsyncMachine } from './index';

/**
 * DevTools interface for browser extension communication
 */
interface MachineDevTools {
  init(context: any): void;
  send(message: { type: string; payload: any }): void;
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
 * Extended runner type with lastEvent tracking
 */
interface DevToolsRunner<M extends AsyncMachine<any>> extends ReturnType<typeof runMachine<any>> {
  lastEvent?: Event<M>;
}

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
    devTools.send({
      type: 'STATE_CHANGED',
      payload: {
        // We need the event that *caused* this change
        event: (runner as DevToolsRunner<M>).lastEvent,
        // We serialize the context, not the whole class instance
        context: nextState.context,
        // The name of the new state's class is our state identifier
        currentState: nextState.constructor.name,
      }
    });
  }) as DevToolsRunner<M>;

  // We wrap the dispatch function to capture the event
  const originalDispatch = runner.dispatch.bind(runner);
  runner.dispatch = ((event: any) => {
    (runner as DevToolsRunner<M>).lastEvent = event; // Capture the event
    return originalDispatch(event);
  }) as typeof runner.dispatch;

  devTools.init(initialMachine.context); // Send initial state
  return runner;
}