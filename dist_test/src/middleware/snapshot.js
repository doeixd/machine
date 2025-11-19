"use strict";
/**
 * @file Snapshot tracking middleware for context state
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.withSnapshot = withSnapshot;
const core_1 = require("./core");
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
function withSnapshot(machine, options = {}) {
    const { maxSize, serializer, captureSnapshot, onlyOnChange = false } = options;
    const snapshots = [];
    let snapshotId = 0;
    const instrumentedMachine = (0, core_1.createMiddleware)(machine, {
        after: ({ transitionName, prevContext, nextContext }) => {
            // Skip if only capturing on change and context didn't change
            if (onlyOnChange && JSON.stringify(prevContext) === JSON.stringify(nextContext)) {
                return;
            }
            const snapshot = {
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
                }
                catch (err) {
                    console.error('Failed to serialize snapshot:', err);
                }
            }
            // Capture custom snapshot data
            if (captureSnapshot) {
                try {
                    snapshot.diff = captureSnapshot(prevContext, nextContext);
                }
                catch (err) {
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
    const restoreSnapshot = (context) => {
        // Find the machine's transition functions (excluding context and snapshot properties)
        const transitions = Object.fromEntries(Object.entries(machine).filter(([key]) => key !== 'context' &&
            key !== 'snapshots' &&
            key !== 'clearSnapshots' &&
            key !== 'restoreSnapshot' &&
            typeof machine[key] === 'function'));
        return Object.assign({ context }, transitions);
    };
    // Attach snapshot properties to the machine
    return Object.assign(instrumentedMachine, {
        snapshots,
        clearSnapshots: () => { snapshots.length = 0; snapshotId = 0; },
        restoreSnapshot
    });
}
