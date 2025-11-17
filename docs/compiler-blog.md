# The Compiler is Your State Machine: A Tale of Two Conversions

We've all been there. A bug report comes in: "The 'Submit' button doesn't work when I go back to the first step of the form." You dive into the code, sprinkle in some `console.log` statements, and eventually find the culprit: your code tried to send a `"SUBMIT"` event while the machine was in the `"entering_user_details"` state. An invalid state transition. A runtime bug that your tools couldn't catch.

For years, we've used powerful libraries like XState and Zag.js to model these flows. They are fantastic tools that bring order to chaos. But their core model—a configuration object with string-based states and events—has a fundamental limitation: the compiler is a passive observer. It can't truly understand the *rules* of your machine.

What if it could?

I recently converted a complex image cropper from a traditional, configuration-based library (Zag.js) to a new paradigm with a library called `@doeixd/machine`. The experience revealed a powerful new way to think: what if we could make invalid state transitions not just a runtime error, but a **compile-time error**?

## The Journey from Strings to Types

Let's start with a simple counter to see the core difference.

#### Before: The String-Based Machine

A traditional machine is a blueprint. You define states and events as strings and rely on a runtime interpreter.

```typescript
// Traditional approach
const counterMachine = createMachine({
  initialState: "active",
  context: { count: 0 },
  states: {
    active: {
      on: {
        INCREMENT: { actions: ["incrementCount"] },
        DECREMENT: { actions: ["decrementCount"] },
      },
    },
  },
});

// Usage:
// We send a message, hoping it's valid for the current state.
service.send({ type: "INCREMENT" });
```
This is clean and declarative. But if we accidentally send a `"DECREMENT"` event when the machine is in a hypothetical `"disabled"` state, the error happens at runtime.

#### After: The Type-State Machine

In the Type-State paradigm, states are not strings; they are **actual TypeScript types**.

```typescript
// Type-State approach with @doeixd/machine
import { MachineBase } from '@doeixd/machine';

class ActiveCounter extends MachineBase<{ count: number }> {
  // `increment` is a method, not a string. It returns the next state.
  increment(): ActiveCounter {
    return new ActiveCounter({ count: this.context.count + 1 });
  }

  decrement(): ActiveCounter {
    return new ActiveCounter({ count: this.context.count - 1 });
  }
}

// Usage:
// We call a method directly on the object.
const counter = new ActiveCounter({ count: 0 });
const nextCounter = counter.increment();
```
The shift is subtle but profound. We've moved from sending messages to a black box to calling methods on a typed object. The compiler is no longer a passive observer; it's an active participant.

Now, let's see how this plays out in the complex image cropper.

## Before & After: Three Concrete Improvements

### Improvement #1: From Runtime Guesswork to Compile-Time Guarantees

This is the most critical improvement.

#### Before: Chasing Runtime Errors

In the Zag.js cropper, all state transitions are dispatched as events. Let's look at the `dragging` state.

```typescript
// zag-js/states/dragging.ts
{
  on: {
    POINTER_MOVE: {
      actions: ["updateCrop"],
    },
    POINTER_UP: {
      target: "idle",
      actions: ["clearAllPointers"],
    },
  },
}
```
If I'm in the `"idle"` state and I accidentally write code that sends a `"POINTER_MOVE"` event, nothing will happen at compile time. My test might fail, or worse, a user will find a bug where dragging doesn't work from a certain state.

#### After: The Compiler as Your Co-pilot

In the `@doeixd/machine` version, states are classes. The `IdleMachine` simply does not have a `pointerMove` method.

```typescript
// @doeixd/machine version
let machine: IdleMachine | DraggingMachine;
machine = createIdleMachine();

// What happens when I try to make a mistake?
// My editor and compiler give me an immediate error:

// machine.pointerMove(...);
// ^^^^^^^^^^^^^^^
// 🔴 COMPILE ERROR: Property 'pointerMove' does not exist on type 'IdleMachine'.

// The only way forward is through a valid transition:
machine = machine.pointerDown({ x: 10, y: 10 });

// Now, `machine` is of type `DraggingMachine`, and `pointerMove` is available.
// The compiler guides you to the correct logic.
machine.pointerMove({ x: 11, y: 11 }); // ✅ This is now valid.
```
**The benefit is tangible:** An entire category of logic bugs is eliminated before the code is ever run. Your confidence in refactoring skyrockets.

### Improvement #2: From Mixed Concerns to Strict Purity

State machines are at their best when the logic is pure. The "before" and "after" show a dramatic improvement in this separation.

#### Before: Logic and Side Effects Intertwined

In the Zag.js configuration, pure state logic (`actions`) and impure side effects (`effects`) live together in the same machine definition.

```typescript
// zag-js machine definition
{
  // ...
  states: {
    dragging: {
      // This key defines the side effect of listening to the DOM
      effects: ["trackPointerMove"], 
      on: {
        POINTER_MOVE: {
          // This key defines the pure logic of calculating the next crop
          actions: ["updateCrop"], 
        },
      },
    },
  },
  
  implementations: {
    // The side effect implementation (impure DOM code)
    effects: {
      trackPointerMove({ send }) {
        addDomEvent(document, "pointermove", (event) => {
          send({ type: "POINTER_MOVE", point: getEventPoint(event) });
        });
      },
    },
    // The state logic implementation (pure calculation)
    actions: {
      updateCrop({ context }, event) {
        const nextCrop = computeMoveCrop(context.crop, event.point);
        context.set("crop", nextCrop);
      }
    }
  }
}
```
This works, but it's hard to test the pure `updateCrop` logic without mocking the DOM and the `send` function.

#### After: A Clean Separation of Worlds

The `@doeixd/machine` conversion enforces a strict separation.

**1. The Machine (Pure Logic):** The `DraggingMachine` class contains *only* the pure calculation. It knows nothing about the DOM.

```typescript
// @doeixd/machine - The pure machine class
class DraggingMachine extends MachineBase<CropperContext> {
  pointerMove(point: Point): DraggingMachine {
    const nextCrop = computeMoveCrop(this.context.cropStart, point);
    return setContext(this, { crop: nextCrop });
  }
  // ...
}
```
This class can now be imported into a Node.js test file and tested in complete isolation.

**2. The Runner (Impure Side Effects):** A separate `runImageCropper` function handles all the DOM interactions. It listens for state changes and adds/removes event listeners accordingly.

```typescript
// @doeixd/machine - The runner (side effects)
function runImageCropper(machine, scope) {
  const runner = runMachine(machine, (newState) => {
    // When the state changes to DraggingMachine, add DOM listeners.
    if (isState(newState, DraggingMachine)) {
      addDomEvent(scope.getDoc(), "pointermove", (event) => {
        // When a DOM event happens, dispatch a pure event to the machine.
        runner.dispatch({ type: "pointerMove", args: [getEventPoint(event)] });
      });
    }
  });
}
```
**The benefit is massive:** Your core business logic is now a pure, portable, and easily testable artifact. The messy, environment-specific details are handled separately.

### Improvement #3: From Interpreter Overhead to Zero-Cost Abstraction

Finally, let's talk about performance, especially for a high-frequency operation like dragging an image cropper.

#### Before: Runtime Interpretation

Every time you `send` an event to the Zag.js machine, its runtime interpreter has to:
1.  Look up the current state string (`"dragging"`).
2.  Find the corresponding event string (`"POINTER_MOVE"`) in the configuration.
3.  Check any `guard` conditions.
4.  Look up and execute the action string (`"updateCrop"`).

This is incredibly fast, but it's not free. It's a layer of abstraction that runs on every interaction.

#### After: Direct, Zero-Cost Method Calls

In the `@doeixd/machine` version, especially with the **mutable pattern**, a transition is just a direct JavaScript method call.

```typescript
// Using the mutable pattern for max performance
const machine = createMutableCropperMachine(...);

// On pointer move, this is all that happens:
machine.pointerMove({ x: 10, y: 11 });
```
There is no interpreter. There is no lookup. It's a direct function invocation that mutates some properties on an object. For an event that can fire hundreds of times per second, this **zero-cost abstraction** is a significant performance win. It's as fast as writing the logic by hand, but with all the safety and structure of a formal state machine.

## A New Kind of Confidence

The journey from a declarative, string-based machine to a Type-State machine is a trade-off. You accept more upfront boilerplate (defining classes and factories) in exchange for a profound level of safety and a development experience that feels less like sending messages into the void and more like being guided by a knowledgeable co-pilot.

By making the compiler an active participant in your state logic, you don't just find bugs faster—you make them impossible to write in the first place.