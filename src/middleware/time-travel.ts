/**
 * @file Time travel middleware combining history, snapshots, and replay capabilities
 */

import type { Context, BaseMachine } from '../index';
import { createMiddleware } from './core';
import { type HistoryEntry, type Serializer } from './history';
import { type ContextSnapshot } from './snapshot';

// =============================================================================
// SECTION: TIME TRAVEL TYPES
// =============================================================================

/**
 * A machine enhanced with history tracking capabilities.
 */
export type WithHistory<M extends BaseMachine<any>> = M & {
  /** History of all transitions */
  history: HistoryEntry[];
  /** Clear all history */
  clearHistory: () => void;
};

/**
 * A machine enhanced with snapshot tracking capabilities.
 */
export type WithSnapshot<M extends BaseMachine<any>> = M & {
  /** Snapshots of context before/after each transition */
  snapshots: ContextSnapshot<Context<M>>[];
  /** Clear all snapshots */
  clearSnapshots: () => void;
  /** Restore machine to a previous context state */
  restoreSnapshot: (context: Context<M>) => M;
};

/**
 * A machine enhanced with time travel capabilities.
 */
export type WithTimeTravel<M extends BaseMachine<any>> = M & {
  /** History of all transitions */
  history: HistoryEntry[];
  /** Snapshots of context before/after each transition */
  snapshots: ContextSnapshot<Context<M>>[];
  /** Clear all history and snapshots */
  clearTimeTravel: () => void;
  /** Clear just the history */
  clearHistory: () => void;
  /** Clear just the snapshots */
  clearSnapshots: () => void;
  /** Restore machine to a previous context state */
  restoreSnapshot: (context: Context<M>) => M;
  /** Replay transitions from a specific point in history */
  replayFrom: (startIndex: number) => M;
};

// =============================================================================
// SECTION: TIME TRAVEL MIDDLEWARE
// =============================================================================

/**
 * Creates a machine with full time travel debugging capabilities.
 * Combines history tracking, snapshots, and replay functionality.
 *
 * @template M - The machine type
 * @param machine - The machine to enhance
 * @param options - Configuration options
 * @returns A machine with time travel capabilities
 *
 * @example
 * ```typescript
 * const debugMachine = withTimeTravel(counter);
 *
 * // Make some transitions
 * debugMachine.increment();
 * debugMachine.increment();
 * debugMachine.decrement();
 *
 * // Time travel to previous states
 * const previousState = debugMachine.replayFrom(0); // Replay from start
 * const undoLast = debugMachine.restoreSnapshot(debugMachine.snapshots[1].before);
 *
 * // Inspect history
 * console.log(debugMachine.history);
 * console.log(debugMachine.snapshots);
 * ```
 */
export function withTimeTravel<M extends BaseMachine<any>>(
  machine: M,
  options: {
    /** Maximum number of history entries/snapshots to keep */
    maxSize?: number;
    /** Optional serializer for persistence */
    serializer?: Serializer;
    /** Callback when history/snapshot events occur */
    onRecord?: (type: 'history' | 'snapshot', data: any) => void;
  } = {}
): WithTimeTravel<M> {
  const { maxSize, serializer, onRecord } = options;

  // Create separate history and snapshot tracking
  const history: HistoryEntry[] = [];
  const snapshots: ContextSnapshot<Context<M>>[] = [];
  let historyId = 0;
  let snapshotId = 0;

  // Create middleware that handles both history and snapshots
  const instrumentedMachine = createMiddleware(machine, {
    before: ({ transitionName, args }: { transitionName: string; args: any[] }) => {
      const entry: HistoryEntry = {
        id: `entry-${historyId++}`,
        transitionName,
        args: [...args],
        timestamp: Date.now()
      };

      if (serializer) {
        try {
          entry.serializedArgs = serializer.serialize(args);
        } catch (err) {
          console.error('Failed to serialize history args:', err);
        }
      }

      history.push(entry);

      // Enforce max size
      if (maxSize && history.length > maxSize) {
        history.shift();
      }

      onRecord?.('history', entry);
    },
    after: ({ transitionName, prevContext, nextContext }: { transitionName: string; prevContext: Context<M>; nextContext: Context<M> }) => {
      const snapshot: ContextSnapshot<Context<M>> = {
        id: `snapshot-${snapshotId++}`,
        transitionName,
        before: { ...prevContext },
        after: { ...nextContext },
        timestamp: Date.now()
      };

      // Serialize contexts if serializer provided
      if (serializer) {
        try {
          snapshot.serializedBefore = serializer.serialize(prevContext);
          snapshot.serializedAfter = serializer.serialize(nextContext);
        } catch (err) {
          console.error('Failed to serialize snapshot:', err);
        }
      }

      snapshots.push(snapshot);

      // Enforce max size
      if (maxSize && snapshots.length > maxSize) {
        snapshots.shift();
      }

      onRecord?.('snapshot', snapshot);
    }
  });

  // Helper to restore machine to a previous state
  const restoreSnapshot = (context: Context<M>): M => {
    // Find the machine's transition functions (excluding context and snapshot properties)
    const transitions = Object.fromEntries(
      Object.entries(machine).filter(([key]) =>
        key !== 'context' &&
        key !== 'history' &&
        key !== 'snapshots' &&
        key !== 'clearHistory' &&
        key !== 'clearSnapshots' &&
        key !== 'restoreSnapshot' &&
        key !== 'clearTimeTravel' &&
        key !== 'replayFrom' &&
        typeof machine[key as keyof M] === 'function'
      )
    );

    return Object.assign({ context }, transitions) as M;
  };

  // Create replay functionality
  const replayFrom = (startIndex: number): M => {
    if (startIndex < 0 || startIndex >= history.length) {
      throw new Error(`Invalid replay start index: ${startIndex}`);
    }

    // Start from the context at the specified history index
    let currentContext = snapshots[startIndex]?.before;
    if (!currentContext) {
      throw new Error(`No snapshot available for index ${startIndex}`);
    }

    // Get all transitions from start index to end
    const transitionsToReplay = history.slice(startIndex);

    // Create a fresh machine instance
    const freshMachine = Object.assign(
      { context: currentContext },
      Object.fromEntries(
        Object.entries(machine).filter(([key]) =>
          key !== 'context' &&
          typeof machine[key as keyof M] === 'function'
        )
      )
    ) as M;

    // Replay each transition
    let replayedMachine = freshMachine;
    for (const entry of transitionsToReplay) {
      const transitionFn = replayedMachine[entry.transitionName as keyof M] as Function;
      if (transitionFn) {
        replayedMachine = transitionFn.apply(replayedMachine, entry.args);
      }
    }

    return replayedMachine;
  };

  // Return machine with all time travel capabilities
  return Object.assign(instrumentedMachine, {
    history,
    snapshots,
    clearHistory: () => { history.length = 0; historyId = 0; },
    clearSnapshots: () => { snapshots.length = 0; snapshotId = 0; },
    clearTimeTravel: () => {
      history.length = 0;
      snapshots.length = 0;
      historyId = 0;
      snapshotId = 0;
    },
    restoreSnapshot,
    replayFrom
  }) as WithTimeTravel<M>;
}
