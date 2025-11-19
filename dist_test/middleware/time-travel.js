"use strict";
/**
 * @file Time travel middleware combining history, snapshots, and replay capabilities
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.withTimeTravel = withTimeTravel;
const core_1 = require("./core");
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
function withTimeTravel(machine, options = {}) {
    const { maxSize, serializer, onRecord } = options;
    // Create separate history and snapshot tracking
    const history = [];
    const snapshots = [];
    let historyId = 0;
    let snapshotId = 0;
    // Create middleware that handles both history and snapshots
    const instrumentedMachine = (0, core_1.createMiddleware)(machine, {
        before: ({ transitionName, args }) => {
            const entry = {
                id: `entry-${historyId++}`,
                transitionName,
                args: [...args],
                timestamp: Date.now()
            };
            if (serializer) {
                try {
                    entry.serializedArgs = serializer.serialize(args);
                }
                catch (err) {
                    console.error('Failed to serialize history args:', err);
                }
            }
            history.push(entry);
            // Enforce max size
            if (maxSize && history.length > maxSize) {
                history.shift();
            }
            onRecord === null || onRecord === void 0 ? void 0 : onRecord('history', entry);
        },
        after: ({ transitionName, prevContext, nextContext }) => {
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
            snapshots.push(snapshot);
            // Enforce max size
            if (maxSize && snapshots.length > maxSize) {
                snapshots.shift();
            }
            onRecord === null || onRecord === void 0 ? void 0 : onRecord('snapshot', snapshot);
        }
    });
    // Helper to restore machine to a previous state
    const restoreSnapshot = (context) => {
        // Find the machine's transition functions (excluding context and snapshot properties)
        const transitions = Object.fromEntries(Object.entries(machine).filter(([key]) => key !== 'context' &&
            key !== 'history' &&
            key !== 'snapshots' &&
            key !== 'clearHistory' &&
            key !== 'clearSnapshots' &&
            key !== 'restoreSnapshot' &&
            key !== 'clearTimeTravel' &&
            key !== 'replayFrom' &&
            typeof machine[key] === 'function'));
        return Object.assign({ context }, transitions);
    };
    // Create replay functionality
    const replayFrom = (startIndex) => {
        var _a;
        if (startIndex < 0 || startIndex >= history.length) {
            throw new Error(`Invalid replay start index: ${startIndex}`);
        }
        // Start from the context at the specified history index
        let currentContext = (_a = snapshots[startIndex]) === null || _a === void 0 ? void 0 : _a.before;
        if (!currentContext) {
            throw new Error(`No snapshot available for index ${startIndex}`);
        }
        // Get all transitions from start index to end
        const transitionsToReplay = history.slice(startIndex);
        // Create a fresh machine instance
        const freshMachine = Object.assign({ context: currentContext }, Object.fromEntries(Object.entries(machine).filter(([key]) => key !== 'context' &&
            typeof machine[key] === 'function')));
        // Replay each transition
        let replayedMachine = freshMachine;
        for (const entry of transitionsToReplay) {
            const transitionFn = replayedMachine[entry.transitionName];
            if (transitionFn) {
                replayedMachine = transitionFn.apply(replayedMachine.context, entry.args);
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
    });
}
