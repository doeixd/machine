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
 * Serializer interface for converting context/args to/from strings.
 */
export interface Serializer<T = any> {
  serialize: (value: T) => string;
  deserialize: (str: string) => T;
}

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
): M & { history: HistoryEntry[]; clearHistory: () => void } {
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
  });
}