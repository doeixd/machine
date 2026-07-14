/**
 * @file History tracking middleware
 */

import type { BaseMachine } from '../index';
import { createMiddleware } from './core';

// =============================================================================
// SECTION: HISTORY TYPES
// =============================================================================

/**
 * A single history entry recording a transition.
 */
export interface HistoryEntry {
  /** Unique ID for this history entry */
  id: string;
  /** Name of the transition that was called */
  transitionName: string;
  /** Arguments passed to the transition */
  args: any[];
  /** Timestamp when the transition occurred */
  timestamp: number;
  /** Optional serialized version of args for persistence */
  serializedArgs?: string;
}

/**
 * Bidirectional serialization used when history or snapshots must be persisted.
 *
 * @typeParam T - Value converted to and from its string representation.
 */
export interface Serializer<T = any> {
  serialize: (value: T) => string;
  deserialize: (str: string) => T;
}

type HistoryResult<R> = R extends Promise<infer V>
  ? V extends BaseMachine<any> ? Promise<HistoryTrackedMachine<V>> : R
  : R extends BaseMachine<any> ? HistoryTrackedMachine<R> : R;

type HistoryMachine<M extends BaseMachine<any>> = {
  [K in keyof M]: M[K] extends (...args: infer A) => infer R
    ? (...args: A) => HistoryResult<R>
    : M[K];
};

/**
 * A machine whose machine-returning transitions preserve history instrumentation.
 *
 * `history` belongs to the current wrapper instance. `clearHistory()` mutates
 * that diagnostic buffer; it does not change the immutable machine context.
 *
 * @typeParam M - Original machine type.
 */
export type HistoryTrackedMachine<M extends BaseMachine<any>> = HistoryMachine<M> & {
  history: HistoryEntry[];
  clearHistory: () => void;
};

// =============================================================================
// SECTION: HISTORY MIDDLEWARE
// =============================================================================

/**
 * Creates a machine with history tracking capabilities.
 * Records all transitions that occur, allowing you to see the sequence of state changes.
 *
 * @template M - The machine type
 * @param machine - The machine to track
 * @param options - Configuration options
 * @returns A new machine with history tracking
 *
 * @example
 * ```typescript
 * const tracked = withHistory(counter, { maxSize: 50 });
 * tracked.increment();
 * console.log(tracked.history); // [{ id: "entry-1", transitionName: "increment", ... }]
 * ```
 */
export function withHistory<M extends BaseMachine<any>>(
  machine: M,
  options: {
    /** Maximum number of history entries to keep (default: unlimited) */
    maxSize?: number;
    /** Optional serializer for transition arguments */
    serializer?: Serializer<any[]>;
    /** Callback when a transition occurs */
    onEntry?: (entry: HistoryEntry) => void;
  } = {}
): HistoryTrackedMachine<M> {
  const { maxSize, serializer, onEntry } = options;
  const history: HistoryEntry[] = [];
  let entryId = 0;

  const instrumentedMachine = createMiddleware(machine, {
    before: ({ transitionName, args }) => {
      const entry: HistoryEntry = {
        id: `entry-${entryId++}`,
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

      onEntry?.(entry);
    }
  });

  // Attach history properties to the machine
  return Object.assign(instrumentedMachine, {
    history,
    clearHistory: () => { history.length = 0; entryId = 0; }
  }) as HistoryTrackedMachine<M>;
}
