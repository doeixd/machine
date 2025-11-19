/**
 * @file Snapshot tracking middleware for context state
 */

import type { Context, BaseMachine } from '../index';
import { createMiddleware } from './core';
import type { Serializer } from './history';

// =============================================================================
// SECTION: SNAPSHOT TYPES
// =============================================================================

/**
 * A snapshot of machine context before and after a transition.
 */
export interface ContextSnapshot<C extends object> {
  /** Unique ID for this snapshot */
  id: string;
  /** Name of the transition that caused this snapshot */
  transitionName: string;
  /** Context before the transition */
  before: C;
  /** Context after the transition */
  after: C;
  /** Timestamp of the snapshot */
  timestamp: number;
  /** Optional serialized versions of contexts */
  serializedBefore?: string;
  serializedAfter?: string;
  /** Optional diff information */
  diff?: any;
}

// =============================================================================
// SECTION: SNAPSHOT MIDDLEWARE
// =============================================================================

/**
 * Creates a machine with snapshot tracking capabilities.
 * Records context state before and after each transition for debugging and inspection.
 *
 * @template M - The machine type
 * @param machine - The machine to track
 * @param options - Configuration options
 * @returns A new machine with snapshot tracking
 *
 * @example
 * ```typescript
 * const tracked = withSnapshot(counter, {
 *   maxSize: 50,
 *   serializer: {
 *     serialize: (ctx) => JSON.stringify(ctx),
 *     deserialize: (str) => JSON.parse(str)
 *   }
 * });
 *
 * tracked.increment();
 * console.log(tracked.snapshots); // [{ before: { count: 0 }, after: { count: 1 }, ... }]
 * ```
 */
export function withSnapshot<M extends BaseMachine<any>>(
  machine: M,
  options: {
    /** Maximum number of snapshots to keep (default: unlimited) */
    maxSize?: number;
    /** Optional serializer for context */
    serializer?: Serializer<Context<M>>;
    /** Custom function to capture additional snapshot data */
    captureSnapshot?: (before: Context<M>, after: Context<M>) => any;
    /** Only capture snapshots where context actually changed */
    onlyOnChange?: boolean;
  } = {}
): M & {
  snapshots: ContextSnapshot<Context<M>>[];
  clearSnapshots: () => void;
  restoreSnapshot: (snapshot: ContextSnapshot<Context<M>>['before']) => M;
} {
  const {
    maxSize,
    serializer,
    captureSnapshot,
    onlyOnChange = false
  } = options;

  const snapshots: ContextSnapshot<Context<M>>[] = [];
  let snapshotId = 0;

  const instrumentedMachine = createMiddleware(machine, {
    after: ({ transitionName, prevContext, nextContext }) => {
      // Skip if only capturing on change and context didn't change
      if (onlyOnChange && JSON.stringify(prevContext) === JSON.stringify(nextContext)) {
        return;
      }

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

      // Capture custom snapshot data
      if (captureSnapshot) {
        try {
          snapshot.diff = captureSnapshot(prevContext, nextContext);
        } catch (err) {
          console.error('Failed to capture snapshot:', err);
        }
      }

      snapshots.push(snapshot);

      // Enforce max size
      if (maxSize && snapshots.length > maxSize) {
        snapshots.shift();
      }
    }
  });

  // Helper to restore machine to a previous state
  const restoreSnapshot = (context: Context<M>): M => {
    // Find the machine's transition functions (excluding context and snapshot properties)
    const transitions = Object.fromEntries(
      Object.entries(machine).filter(([key]) =>
        key !== 'context' &&
        key !== 'snapshots' &&
        key !== 'clearSnapshots' &&
        key !== 'restoreSnapshot' &&
        typeof machine[key as keyof M] === 'function'
      )
    );

    return Object.assign({ context }, transitions) as M;
  };

  // Attach snapshot properties to the machine
  return Object.assign(instrumentedMachine, {
    snapshots,
    clearSnapshots: () => { snapshots.length = 0; snapshotId = 0; },
    restoreSnapshot
  });
}