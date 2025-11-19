"use strict";
/**
 * @file History tracking middleware
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.withHistory = withHistory;
const core_1 = require("./core");
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
function withHistory(machine, options = {}) {
    const { maxSize, serializer, onEntry } = options;
    const history = [];
    let entryId = 0;
    const instrumentedMachine = (0, core_1.createMiddleware)(machine, {
        before: ({ transitionName, args }) => {
            const entry = {
                id: `entry-${entryId++}`,
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
            onEntry === null || onEntry === void 0 ? void 0 : onEntry(entry);
        }
    });
    // Attach history properties to the machine
    return Object.assign(instrumentedMachine, {
        history,
        clearHistory: () => { history.length = 0; entryId = 0; }
    });
}
