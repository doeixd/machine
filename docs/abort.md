# Guide to Asynchronous Cancellation with AbortSignal

In modern applications, managing asynchronous operations is a primary source of bugs. A common and subtle issue is the **race condition**: an async operation completes and tries to update the application's state *after* the user has already moved on, leading to stale data and an inconsistent UI.

`@doeixd/machine` provides a robust, built-in solution to this problem by embracing the web platform's standard for cancellation: the `AbortController` and `AbortSignal`.

This guide will explain why cancellation is critical and how to use it to write safer, more reliable asynchronous state machines.

### Table of Contents
1.  [The Problem: The In-Flight Request from a State You've Already Left](#the-problem-the-in-flight-request-from-a-state-youve-already-left)
2.  [The Solution: Automatic Cancellation with `AbortSignal`](#the-solution-automatic-cancellation-with-abortsignal)
3.  [How to Use It: Passing the `signal` to Your Async Code](#how-to-use-it-passing-the-signal-to-your-async-code)
    -   [Example with `fetch`](#example-with-fetch)
    -   [Example with `invoke`](#example-with-invoke)
    -   [Handling Cancellation in Custom Promises](#handling-cancellation-in-custom-promises)
4.  [How `runMachine` Orchestrates Cancellation](#how-runmachine-orchestrates-cancellation)
5.  [Cleaning Up on Unmount with `runner.stop()`](#cleaning-up-on-unmount-with-runnerstop)
6.  [Summary: Why This Matters](#summary-why-this-matters)

<br />

## The Problem: The In-Flight Request from a State You've Already Left

Imagine a simple data-fetching machine.

```typescript
class LoadingMachine extends MachineBase<...> {
  fetchData = async () => {
    // This fetch might take 300ms.
    const data = await api.fetchUserData(); 
    return new SuccessMachine({ data });
  };
}
```

Now, consider this common user interaction sequence:

1.  **0ms:** A user searches for "apples". Your app dispatches a `fetch` event. The machine transitions to `LoadingMachine`, and the `fetchUserData` call for "apples" is initiated.
2.  **50ms:** The user quickly refines their search to "oranges". Your app dispatches another `fetch` event.
3.  **300ms:** The first request for "apples" finally completes. It resolves and returns a `SuccessMachine` with "apples" data.
4.  **350ms:** The second request for "oranges" completes and returns a `SuccessMachine` with "oranges" data.

Without proper cancellation, your UI might briefly flash "apples" before showing "oranges," or worse, get stuck showing the stale "apples" data. The state of your application is now out of sync with the user's intent.

<br />

## The Solution: Automatic Cancellation with `AbortSignal`

`@doeixd/machine` solves this problem automatically through its `runMachine` interpreter.

**Here's the core principle:**
When you dispatch a new event that starts an async transition, `runMachine` will **automatically send a cancellation signal** to any previously running async transition.

This ensures that only the *latest* asynchronous operation is allowed to update the state. Stale, in-flight promises are safely ignored, eliminating the race condition.

<br />

## How to Use It: Passing the `signal` to Your Async Code

To enable this powerful feature, you only need to do one thing: **accept the `signal` in your async transitions and pass it to your async APIs.**

The `runMachine` interpreter will automatically pass an options object containing an `AbortSignal` as the **last argument** to all of your asynchronous transition functions.

### Example with `fetch`

The browser's `fetch` API has built-in support for `AbortSignal`.

```typescript
import { MachineBase, runMachine, Event } from '@doeixd/machine';

class LoadingMachine extends MachineBase<{ query: string }> {
  // 1. Accept the `{ signal }` options object as the last argument.
  async fetchData({ signal }: { signal: AbortSignal }) {
    try {
      // 2. Pass the signal directly to your fetch call.
      const response = await fetch(`/api/search?q=${this.context.query}`, { signal });
      const data = await response.json();
      
      // If the request was aborted, fetch throws an error, so this line is never reached.
      return new SuccessMachine({ data });
    } catch (err) {
      if (err.name === 'AbortError') {
        // The request was cancelled. Stay in the current state or move to a specific 'cancelled' state.
        console.log('Fetch was cancelled!');
        return this; // Stay in Loading
      }
      // Handle other network errors.
      return new ErrorMachine({ error: err.message });
    }
  }
}
```

Now, if a user triggers another `fetchData` transition while one is already running, `runMachine` will call `abort()` on the previous signal. This causes the in-flight `fetch` to immediately reject with an `AbortError`, which you can catch and handle gracefully.

### Example with `invoke`

The `invoke` primitive also supports passing the signal to its implementation.

```typescript
import { invoke } from '@doeixd/machine/primitives';

class LoadingMachine extends MachineBase<any> {
  load = invoke(
    { src: 'fetchData', onDone: SuccessMachine, onError: ErrorMachine },
    
    // The implementation function for invoke also receives the signal.
    async ({ signal }: { signal: AbortSignal }) => {
      const response = await fetch('/api/data', { signal });
      const data = await response.json();
      return new SuccessMachine({ data }); // This will only be reached if not aborted.
    }
  );
}
```

### Handling Cancellation in Custom Promises

If you're not using `fetch`, you can still support cancellation by listening for the `signal`'s `'abort'` event.

```typescript
class ProcessingMachine extends MachineBase<any> {
  async longProcess({ signal }: { signal: AbortSignal }) {
    return new Promise((resolve, reject) => {
      // If the signal is already aborted, don't even start.
      if (signal.aborted) {
        return reject(new DOMException('Aborted', 'AbortError'));
      }
      
      const timer = setTimeout(() => {
        console.log('Process complete!');
        resolve(new CompleteMachine());
      }, 5000); // A long 5-second process

      // Listen for the abort event to clean up.
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        console.log('Process was cancelled!');
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  }
}
```

<br />

## How `runMachine` Orchestrates Cancellation

You don't need to create or manage the `AbortController` yourself. The `runMachine` interpreter handles the entire lifecycle for you:

1.  **Dispatch:** When you `dispatch` an event that triggers an async transition, `runMachine` **first aborts any previously running transition**.
2.  **Create:** It then creates a new `AbortController` for the new transition.
3.  **Pass Signal:** It passes the `controller.signal` to your transition function.
4.  **Await:** It awaits your transition's promise.
5.  **Check for Race:** Before updating the state, it checks if the signal was aborted *while it was awaiting*. If so, it discards the result.
6.  **Update State:** If the operation completed and was not aborted, it safely updates the machine to the new state.

This robust, built-in orchestration ensures your state machine remains correct and consistent, no matter how quickly users interact with your application.

<br />

## Cleaning Up on Unmount with `runner.stop()`

The runner returned by `runMachine` also exposes a `stop()` method. This is crucial for resource cleanup in component-based frameworks like React or Solid.

When a component is about to be unmounted, you should call `runner.stop()` to ensure any in-flight async operations are cancelled.

```typescript
// React example
useEffect(() => {
  const runner = runMachine(createMyAsyncMachine());
  
  // When the component unmounts, this cleanup function will be called.
  return () => {
    runner.stop(); // This will abort any pending async transition.
  };
}, []);
```

<br />

## Summary: Why This Matters

-   **Correctness:** It eliminates a whole class of subtle and hard-to-debug asynchronous race conditions.
-   **Robustness:** Your application will behave predictably, even under rapid user input.
-   **Resource Management:** It prevents orphaned network requests and other async tasks from running in the background after they are no longer needed.
-   **Modern Best Practices:** It uses the standard web platform API for cancellation, ensuring interoperability and future-proofing your code.

By integrating `AbortSignal`, `@doeixd/machine` provides a complete solution for managing not just the state, but the entire lifecycle of asynchronous operations, making it a powerful and reliable choice for building complex, modern applications.