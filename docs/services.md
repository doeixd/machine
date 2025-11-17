# Modeling Side Effects: Services, Actions, and `invoke`

In a pure state machine, transitions are simple functions that take a state and return a new state. But real-world applications need to interact with the outside world: fetching data, saving to a database, logging analytics, or setting timers. These interactions are called **side effects**.

`@doeixd/machine` provides a clear and robust system for modeling two primary types of side effects, all while maintaining full compatibility with our static and runtime statechart extraction tools:

1.  **Actions ("Fire-and-Forget"):** Short-lived, synchronous side effects that don't influence the state machine's flow.
2.  **Invoked Services:** Long-running, asynchronous operations that *do* influence the state machine's flow by transitioning to different states upon completion or failure.

This guide will cover how to use the `action` and `invoke` primitives to model these effects in a way that is both type-safe and visually documentable.

### Table of Contents
1.  [The Philosophy: Separating Logic from Effects](#the-philosophy-separating-logic-from-effects)
2.  [**Actions ("Fire-and-Forget")**](#actions-fire-and-forget)
    -   [What is an Action?](#what-is-an-action)
    -   [How to Implement with the `action` Primitive](#how-to-implement-with-the-action-primitive)
    -   [How it Appears in the Statechart](#how-it-appears-in-the-statechart)
3.  [**Invoked Services (Async Operations)**](#invoked-services-async-operations)
    -   [What is an Invoked Service?](#what-is-an-invoked-service)
    -   [The `invoke` Primitive: The Key to Services](#the-invoke-primitive-the-key-to-services)
    -   [Step-by-Step Implementation Guide](#step-by-step-implementation-guide)
    -   [How it Appears in the Statechart](#how-it-appears-in-the-statechart)
4.  [Cancellation and `AbortSignal`](#cancellation-and-abortsignal)
5.  [Comparison: Action vs. Invoked Service](#comparison-action-vs-invoked-service)
6.  [Summary: Best Practices](#summary-best-practices)

---

## The Philosophy: Separating Logic from Effects

A core principle of state machines is to keep the state transition logic pure. Side effects make code harder to test and reason about. The primitives in this library help you manage this by:

1.  **Executing** the side effect logic within your transition implementation.
2.  **Annotating** the transition with metadata about the effect for documentation and visualization.

The statechart extraction tools read these annotations, allowing you to create diagrams that clearly communicate what side effects occur during a transition or within a state, without the extractor needing to understand the implementation logic itself.

---

## Actions ("Fire-and-Forget")

### What is an Action?

An **Action** is a short-lived side effect that is "fired" during a state transition. It does not directly affect which state the machine transitions to.

**Use Actions for:**
-   Logging to the console or an analytics service (`analytics.track('event')`).
-   Updating a value in `localStorage`.
-   Triggering a notification.
-   Any operation where you don't need to wait for a result to decide the next state.

### How to Implement with the `action` Primitive

You use the `action` primitive from `@doeixd/machine/primitives` to wrap a transition. It takes two arguments:
1.  **Metadata Object:** An object with a `name` for the action (e.g., `{ name: 'logLoginAttempt' }`).
2.  **The Transition:** The transition function that the action is associated with.

```typescript
// examples/authMachine.ts
import { MachineBase } from '@doeixd/machine';
import { transitionTo, describe, action } from '@doeixd/machine/primitives';

export class LoggedOutMachine extends MachineBase<LoggedOutContext> {
  login = describe(
    'Start the login process',
    // The `action` primitive wraps the transition
    action(
      { name: 'logLoginAttempt', description: 'Log this attempt for analytics' },
      transitionTo(LoggingInMachine, (username, password) => {
        // The actual side effect logic lives here, alongside the state change.
        console.log(`Attempting login for user: ${username}`);
        analytics.track('login_attempt');
        
        return new LoggingInMachine({ username });
      })
    )
  );
}
```

### How it Appears in the Statechart

When you run `npm run extract`, the static analyzer finds the `action` annotation and adds it to the `actions` array for that transition in the generated JSON.

**Generated `statecharts/auth.json`:**
```json
{
  "states": {
    "LoggedOutMachine": {
      "on": {
        "login": {
          "target": "LoggingInMachine",
          "description": "Start the login process",
          "actions": [
            "logLoginAttempt" // <-- Here is our annotated action!
          ]
        }
      }
    }
  }
}
```
This allows tools like Stately Viz to show the action on the transition arrow, clearly documenting the side effect.

---

## Invoked Services (Async Operations)

### What is an Invoked Service?

An **Invoked Service** is a long-running process that is started when the machine enters a particular state. Unlike an action, a service is expected to produce a result (or an error), and the machine will **automatically transition** to a new state based on that outcome.

**Use Invoked Services for:**
-   Fetching data from an API.
-   Subscribing to a WebSocket.
-   Running a timer or an animation.
-   Any asynchronous operation whose result determines the next state of the machine.

### The `invoke` Primitive: The Key to Services

The `invoke` primitive from `@doeixd/machine/primitives` is how you define a service. It's used to define a property on a state machine class that represents the service to be run upon entering that state.

It takes two arguments:
1.  **Metadata Object:** A configuration object that describes the service's outcomes:
    *   `src`: A string name for the service (e.g., `"fetchData"`).
    *   `onDone`: The state `class` to transition to on successful completion.
    *   `onError`: The state `class` to transition to if the service throws an error.
2.  **Implementation Function:** An `async` function containing the service's logic. It must:
    *   Accept an options object with an `AbortSignal` for cancellation.
    *   On success, return a new instance of the `onDone` machine.
    *   On failure, `throw` an error to trigger the `onError` transition.

### Step-by-Step Implementation Guide

Let's look at the `fetchMachine.ts` example.

**Step 1: Define the States for the Lifecycle**
You need states for loading (where the service runs), success, and error.

```typescript
export class LoadingMachine extends MachineBase<{...}> { /* ... */ }
export class SuccessMachine extends MachineBase<{...}> { /* ... */ }
export class ErrorMachine extends MachineBase<{...}> { /* ... */ }
```

**Step 2: Implement the `invoke` Call in the `LoadingMachine`**
The `LoadingMachine` is where the work happens. We define a property on it using `invoke`.

```typescript
// examples/fetchMachine.ts

export class LoadingMachine extends MachineBase<LoadingContext> {
  // This property represents the service. It's not an event you call,
  // but rather an effect that happens when you are in this state.
  executeFetch = invoke(
    // 1. The Metadata Object
    {
      src: 'fetchDataFromApi',
      onDone: SuccessMachine, // <-- Go here on success
      onError: ErrorMachine,   // <-- Go here on failure
      description: 'Asynchronous data fetch from API endpoint',
    },
    // 2. The Implementation Function
    async ({ signal }: { signal: AbortSignal }) => {
      try {
        const response = await fetch('/api/data', { signal });
        if (!response.ok) {
          throw new Error(`API Error: ${response.statusText}`);
        }
        const data = await response.json();
        
        // On success, return a new instance of the `onDone` machine.
        return new SuccessMachine({ data });
      } catch (err) {
        // To trigger the `onError` transition, we must re-throw the error.
        // A runtime manager (like `runMachine`) will catch this and handle the transition.
        throw err;
      }
    }
  );
}
```

### How it Appears in the Statechart

The extraction tool sees the `invoke` annotation and generates a special `invoke` block for the `LoadingMachine` state.

**Generated `statecharts/fetch.json`:**
```json
{
  "states": {
    "LoadingMachine": {
      "invoke": [ // <-- The service is associated with the state itself
        {
          "src": "fetchDataFromApi",
          "onDone": {
            "target": "SuccessMachine" // Automatic transition on success
          },
          "onError": {
            "target": "ErrorMachine"   // Automatic transition on error
          },
          "description": "Asynchronous data fetch from API endpoint"
        }
      ]
    }
  }
}
```
In Stately Viz, this will render `LoadingMachine` as a state that automatically runs the `fetchDataFromApi` service and transitions to `SuccessMachine` or `ErrorMachine` based on its outcome.

---

## Cancellation and `AbortSignal`

A critical feature of `invoke` is its built-in support for cancellation. The implementation function always receives an `AbortSignal`.

If another transition is dispatched while your service is running, `@doeixd/machine`'s runtime (`runMachine`) will automatically call `abort()` on the signal. Your service implementation **must** respect this signal to prevent race conditions.

```typescript
async ({ signal }) => {
  // Pass the signal directly to APIs that support it, like fetch.
  const response = await fetch('/api/data', { signal });
  
  // Or, for custom logic, listen for the abort event.
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve('done'), 5000);
    
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}
```
*See: [Guide to Asynchronous Cancellation with AbortSignal](./abort.md)*

---

## Comparison: Action vs. Invoked Service

| Feature                 | `action`                                            | `invoke`                                                              |
| :---------------------- | :-------------------------------------------------- | :-------------------------------------------------------------------- |
| **Purpose**             | Short-lived, "fire-and-forget" side effects.        | Long-running, asynchronous operations with success/failure outcomes.  |
| **Effect on Flow**      | Does **not** determine the next state.              | **Determines** the next state via `onDone` and `onError`.             |
| **Typical Use Cases**   | Logging, analytics, updating `localStorage`.        | API calls, timers, WebSockets.                                        |
| **Statechart Location** | On a **transition** arrow.                          | Inside a **state** node.                                              |
| **Cancellation**        | Not applicable (synchronous).                       | Essential. Handled via `AbortSignal`.                                 |
| **When to Use**         | When you need to do something extra during a transition. | When you need to do something *in* a state to decide where to go next. |

---

## Summary: Best Practices

1.  **Use `action` for simple, synchronous side effects.** Think of them as notifications that don't affect the machine's decision-making process.

2.  **Use `invoke` for all asynchronous operations.** This is the correct and safe way to model data fetching, timers, and any process that has distinct success and failure outcomes.

3.  **Always respect the `AbortSignal` in your `invoke` implementations.** This is critical for preventing race conditions and building robust UIs.

4.  **Keep the `src` name descriptive.** This name is what appears in your statechart diagram, so `fetchUserData` is better than just `fetch`.

5.  **Keep the implementation logic separate from the metadata.** The `invoke` primitive encourages this by design. Your metadata object is a declarative specification, and your implementation function is the imperative logic.

By using `action` and `invoke` correctly, you can create state machines that are not only type-safe and logically sound but also produce rich, accurate, and easy-to-understand visual documentation for your entire team.