/**
 * @file Traffic Light State Machine Example
 * @description Simple FSM demonstrating basic sequential transitions
 *
 * This is the simplest possible state machine example:
 * - Three states (Red, Yellow, Green)
 * - Single transition per state
 * - Cyclic flow
 * - Timer-based transitions
 */

import { MachineBase } from '../src/index';
import { transitionTo, describe, action } from '../src/primitives';

// =============================================================================
// CONTEXT TYPES
// =============================================================================

interface RedContext {
  light: 'red';
  duration: number; // milliseconds
  enteredAt: number;
}

interface YellowContext {
  light: 'yellow';
  duration: number;
  enteredAt: number;
}

interface GreenContext {
  light: 'green';
  duration: number;
  enteredAt: number;
}

// =============================================================================
// STATE MACHINE CLASSES
// =============================================================================

/**
 * Red light - stop
 */
export class RedLightMachine extends MachineBase<RedContext> {
  constructor(context: RedContext = { light: 'red', duration: 5000, enteredAt: Date.now() }) {
    super(context);
  }

  /**
   * Transition to green after timer expires
   */
  next = describe(
    'Change to green light after red duration expires',
    action(
      { name: 'logLightChange', description: 'Log traffic light state change' },
      transitionTo(GreenLightMachine, () => {
        return new GreenLightMachine({
          light: 'green',
          duration: 5000, // 5 seconds
          enteredAt: Date.now(),
        });
      })
    )
  );

  /**
   * Emergency override - immediately go to green
   */
  emergency = describe(
    'Emergency vehicle override - immediately go to green',
    action(
      { name: 'logEmergencyOverride', description: 'Track emergency overrides for analysis' },
      transitionTo(GreenLightMachine, () => {
        return new GreenLightMachine({
          light: 'green',
          duration: 10000, // Extended duration for emergency
          enteredAt: Date.now(),
        });
      })
    )
  );
}

/**
 * Yellow light - caution
 */
export class YellowLightMachine extends MachineBase<YellowContext> {
  constructor(context: YellowContext = { light: 'yellow', duration: 2000, enteredAt: Date.now() }) {
    super(context);
  }

  /**
   * Transition to red after timer expires
   */
  next = describe(
    'Change to red light after yellow duration expires',
    action(
      { name: 'logLightChange', description: 'Log traffic light state change' },
      transitionTo(RedLightMachine, () => {
        return new RedLightMachine({
          light: 'red',
          duration: 5000, // 5 seconds
          enteredAt: Date.now(),
        });
      })
    )
  );
}

/**
 * Green light - go
 */
export class GreenLightMachine extends MachineBase<GreenContext> {
  constructor(context: GreenContext = { light: 'green', duration: 5000, enteredAt: Date.now() }) {
    super(context);
  }

  /**
   * Transition to yellow after timer expires
   */
  next = describe(
    'Change to yellow light after green duration expires',
    action(
      { name: 'logLightChange', description: 'Log traffic light state change' },
      transitionTo(YellowLightMachine, () => {
        return new YellowLightMachine({
          light: 'yellow',
          duration: 2000, // 2 seconds
          enteredAt: Date.now(),
        });
      })
    )
  );

  /**
   * Pedestrian button pressed - cut green short
   */
  pedestrianRequest = describe(
    'Pedestrian crossing button pressed - advance to yellow',
    action(
      { name: 'logPedestrianRequest', description: 'Track pedestrian crossing requests' },
      transitionTo(YellowLightMachine, () => {
        return new YellowLightMachine({
          light: 'yellow',
          duration: 2000,
          enteredAt: Date.now(),
        });
      })
    )
  );
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new traffic light machine starting at red
 */
export function createTrafficLightMachine(): RedLightMachine {
  return new RedLightMachine({
    light: 'red',
    duration: 5000,
    enteredAt: Date.now(),
  });
}

/**
 * Create a traffic light with custom durations
 */
export function createCustomTrafficLight(
  redDuration: number,
  yellowDuration: number,
  greenDuration: number
): RedLightMachine {
  return new RedLightMachine({
    light: 'red',
    duration: redDuration,
    enteredAt: Date.now(),
  });
}
