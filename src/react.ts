/**
 * @file React integration for @doeixd/machine
 * @description Provides hooks for using state machines in React components
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { runMachine, AsyncMachine, Event } from './index';

/**
 * React hook for using an async state machine.
 * @template M - The async machine type
 * @param machineFactory - A function that creates the initial machine instance
 * @returns A tuple of [machine, dispatch] for state and event dispatching
 *
 * @example
 * const [machine, dispatch] = useMachine(() => createFetchingMachine());
 *
 * // Dispatch events
 * dispatch({ type: 'fetchUser', args: [123] });
 */
export function useMachine<M extends AsyncMachine<any>>(
  machineFactory: () => M
): [M, (event: Event<M>) => Promise<M>] {
  // Use useState to hold the machine instance, triggering re-renders on change
  const [machine, setMachine] = useState(machineFactory);

  // Use a ref to hold the runner instance so it's stable across renders
  const runnerRef = useRef<ReturnType<typeof runMachine<any>> | null>(null);

  // Initialize the runner only once
  useEffect(() => {
    runnerRef.current = runMachine(machine, (nextState) => {
      // The magic link: when the machine's state changes, update React's state.
      setMachine(nextState as M);
    });
  }, []); // Empty dependency array ensures this runs only on mount

  // Memoize the dispatch function so it has a stable identity
  const dispatch = useCallback((event: Event<M>) => {
    return runnerRef.current?.dispatch(event) || Promise.resolve(machine);
  }, [machine]);

  return [machine, dispatch];
}