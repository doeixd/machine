/**
 * @file Data Fetching State Machine Example
 * @description Demonstrates async operations, retry logic, and error recovery
 *
 * This example shows a typical data fetching pattern with:
 * - Loading states
 * - Success and error handling
 * - Retry with exponential backoff
 * - Cancellation support
 */

import { MachineBase } from '../src/index';
import { transitionTo, invoke, describe, action, guarded } from '../src/primitives';

// =============================================================================
// CONTEXT TYPES
// =============================================================================

interface IdleContext {
  status: 'idle';
  lastFetchTime?: number;
}

interface LoadingContext {
  status: 'loading';
  requestId: string;
  startTime: number;
}

interface SuccessContext<T = any> {
  status: 'success';
  data: T;
  fetchedAt: number;
  requestId: string;
}

interface ErrorContext {
  status: 'error';
  error: string;
  errorCode?: number;
  retryCount: number;
  maxRetries: number;
  lastRequestId: string;
}

interface RetryingContext {
  status: 'retrying';
  error: string;
  retryCount: number;
  maxRetries: number;
  retryDelay: number;
  nextRetryAt: number;
}

// =============================================================================
// STATE MACHINE CLASSES
// =============================================================================

/**
 * Initial idle state - no data fetch in progress
 */
export class IdleMachine extends MachineBase<IdleContext> {
  constructor(context: IdleContext = { status: 'idle' }) {
    super(context);
  }

  /**
   * Start fetching data
   */
  fetch = describe(
    'Initiate data fetching operation',
    action(
      { name: 'startFetch', description: 'Track fetch initiation in analytics' },
      transitionTo(LoadingMachine, () => {
        const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return new LoadingMachine({
          status: 'loading',
          requestId,
          startTime: Date.now(),
        });
      })
    )
  );
}

/**
 * Loading state - fetch in progress
 */
export class LoadingMachine extends MachineBase<LoadingContext> {
  constructor(context: LoadingContext) {
    super(context);
  }

  /**
   * Perform the actual fetch operation
   */
  executeFetch = describe(
    'Execute the HTTP request to fetch data',
    invoke(
      {
        src: 'fetchData',
        onDone: SuccessMachine,
        onError: ErrorMachine,
        description: 'Asynchronous data fetch from API endpoint',
      },
      async () => {
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Simulate successful response
        const mockData = {
          id: this.context.requestId,
          items: [
            { id: 1, name: 'Item 1' },
            { id: 2, name: 'Item 2' },
            { id: 3, name: 'Item 3' },
          ],
          timestamp: Date.now(),
        };

        return new SuccessMachine({
          status: 'success',
          data: mockData,
          fetchedAt: Date.now(),
          requestId: this.context.requestId,
        });
      }
    )
  );

  /**
   * Cancel the ongoing fetch operation
   */
  cancel = describe(
    'Cancel the data fetch and return to idle',
    action(
      { name: 'cancelFetch', description: 'Abort ongoing fetch request' },
      transitionTo(IdleMachine, () => {
        return new IdleMachine({
          status: 'idle',
          lastFetchTime: undefined,
        });
      })
    )
  );
}

/**
 * Success state - data fetched successfully
 */
export class SuccessMachine<T = any> extends MachineBase<SuccessContext<T>> {
  constructor(context: SuccessContext<T>) {
    super(context);
  }

  /**
   * Refetch the data (refresh)
   */
  refetch = describe(
    'Refresh the data by fetching again',
    action(
      { name: 'logRefetch', description: 'Track data refresh operations' },
      transitionTo(LoadingMachine, () => {
        const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return new LoadingMachine({
          status: 'loading',
          requestId,
          startTime: Date.now(),
        });
      })
    )
  );

  /**
   * Clear data and return to idle
   */
  reset = describe(
    'Clear the fetched data and return to idle state',
    transitionTo(IdleMachine, () => {
      return new IdleMachine({
        status: 'idle',
        lastFetchTime: this.context.fetchedAt,
      });
    })
  );

  /**
   * Update data locally (optimistic update)
   */
  updateData = describe(
    'Update the cached data optimistically',
    transitionTo(SuccessMachine, (newData: T) => {
      return new SuccessMachine({
        ...this.context,
        data: newData,
      });
    })
  );
}

/**
 * Error state - fetch failed
 */
export class ErrorMachine extends MachineBase<ErrorContext> {
  constructor(context: ErrorContext) {
    super(context);
  }

  /**
   * Retry the fetch if retries are available
   */
  retry = describe(
    'Retry the failed fetch operation',
    guarded(
      {
        name: 'canRetry',
        description: 'Check if retry count is below max retries',
      },
      transitionTo(RetryingMachine, () => {
        const retryCount = this.context.retryCount + 1;
        const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff, max 10s

        return new RetryingMachine({
          status: 'retrying',
          error: this.context.error,
          retryCount,
          maxRetries: this.context.maxRetries,
          retryDelay,
          nextRetryAt: Date.now() + retryDelay,
        });
      })
    )
  );

  /**
   * Give up and return to idle
   */
  dismiss = describe(
    'Dismiss the error and return to idle state',
    action(
      { name: 'logErrorDismissed', description: 'Track when users dismiss errors' },
      transitionTo(IdleMachine, () => {
        return new IdleMachine({ status: 'idle' });
      })
    )
  );

  /**
   * Manually refetch (bypass retry logic)
   */
  refetch = describe(
    'Manually trigger a new fetch, bypassing retry logic',
    transitionTo(LoadingMachine, () => {
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      return new LoadingMachine({
        status: 'loading',
        requestId,
        startTime: Date.now(),
      });
    })
  );
}

/**
 * Retrying state - waiting to retry after error
 */
export class RetryingMachine extends MachineBase<RetryingContext> {
  constructor(context: RetryingContext) {
    super(context);
  }

  /**
   * Execute the retry after delay
   */
  executeRetry = describe(
    'Execute the retry attempt after delay period',
    invoke(
      {
        src: 'retryFetch',
        onDone: SuccessMachine,
        onError: ErrorMachine,
        description: 'Retry the fetch operation with exponential backoff',
      },
      async () => {
        // Wait for retry delay
        const now = Date.now();
        const waitTime = Math.max(0, this.context.nextRetryAt - now);
        await new Promise((resolve) => setTimeout(resolve, waitTime));

        // Simulate retry attempt
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Simulate success on retry
        const mockData = {
          id: `retry-${this.context.retryCount}`,
          items: [{ id: 1, name: 'Retry Success' }],
          timestamp: Date.now(),
        };

        return new SuccessMachine({
          status: 'success',
          data: mockData,
          fetchedAt: Date.now(),
          requestId: `retry-${this.context.retryCount}`,
        });
      }
    )
  );

  /**
   * Cancel the retry
   */
  cancel = describe(
    'Cancel the pending retry and return to idle',
    transitionTo(IdleMachine, () => {
      return new IdleMachine({ status: 'idle' });
    })
  );
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new fetch machine in idle state
 */
export function createFetchMachine<T = any>(): IdleMachine {
  return new IdleMachine({ status: 'idle' });
}

/**
 * Create a fetch machine with custom retry configuration
 */
export function createFetchMachineWithRetries<T = any>(maxRetries: number = 3): IdleMachine {
  // Note: maxRetries would be stored in a config, this is simplified
  return new IdleMachine({ status: 'idle' });
}
