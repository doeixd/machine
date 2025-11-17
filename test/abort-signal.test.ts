/**
 * @file Tests for AbortSignal support in async machines
 */

import { describe, it, expect } from 'vitest';
import { createAsyncMachine, runMachine } from '../src';

describe('AbortSignal Support', () => {
  describe('runMachine with AbortController', () => {
    it('should cancel pending async operations when new event is dispatched', async () => {
      // Create a machine with a slow async operation
      const slowMachine = createAsyncMachine({ count: 0 }, {
        slowIncrement: async function({ signal }) {
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              resolve(createAsyncMachine({ count: this.count + 1 }, this));
            }, 100);

            signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('Operation cancelled'));
            });
          });
        }
      });

      const runner = runMachine(slowMachine);

      // Start the slow operation
      const firstPromise = runner.dispatch({ type: 'slowIncrement', args: [] });

      // Immediately dispatch another event (should cancel the first)
      const secondPromise = runner.dispatch({ type: 'slowIncrement', args: [] });

      // The first promise should be rejected due to cancellation
      await expect(firstPromise).rejects.toThrow('Operation cancelled');

      // The second operation should complete successfully
      await secondPromise;
      expect(runner.state.count).toBe(1);
    });

    it('should provide stop() method to cancel pending operations', async () => {
      const slowMachine = createAsyncMachine({ status: 'idle' }, {
        startLongTask: async function({ signal }) {
          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              resolve(createAsyncMachine({ status: 'completed' }, this));
            }, 100);

            signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('Task stopped'));
            });
          });
        }
      });

      const runner = runMachine(slowMachine);

      // Start the long task
      const taskPromise = runner.dispatch({ type: 'startLongTask', args: [] });

      // Stop the runner before the task completes
      runner.stop();

      // The task should be cancelled
      await expect(taskPromise).rejects.toThrow('Task stopped');
    });

    it('should handle rapid successive dispatches correctly', async () => {
      const machine = createAsyncMachine({ count: 0 }, {
        increment: async function({ signal }) {
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve(createAsyncMachine({ count: this.count + 1 }, this));
            }, 10);
          });
        }
      });

      const runner = runMachine(machine);

      // Dispatch multiple events rapidly
      const promises = [
        runner.dispatch({ type: 'increment', args: [] }),
        runner.dispatch({ type: 'increment', args: [] }),
        runner.dispatch({ type: 'increment', args: [] }),
      ];

      // All promises should resolve
      await Promise.all(promises);

      // Only the last operation should have updated the state
      expect(runner.state.count).toBe(1);
    });
  });
});