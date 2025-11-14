/**
 * @file Multi-Step Form State Machine Example
 * @description Demonstrates sequential flow, validation, and state accumulation
 *
 * This example shows a wizard-style form with:
 * - Multiple steps with validation
 * - Forward and backward navigation
 * - Data accumulation across steps
 * - Validation errors
 * - Final submission
 */

import { MachineBase } from '../src/index';
import { transitionTo, guarded, describe, action } from '../src/primitives';

// =============================================================================
// CONTEXT TYPES
// =============================================================================

interface Step1Context {
  step: 'personal';
  name: string;
  email: string;
}

interface Step2Context {
  step: 'address';
  name: string;
  email: string;
  street: string;
  city: string;
  zipCode: string;
}

interface Step3Context {
  step: 'preferences';
  name: string;
  email: string;
  street: string;
  city: string;
  zipCode: string;
  newsletter: boolean;
  notifications: boolean;
}

interface CompleteContext {
  step: 'complete';
  name: string;
  email: string;
  street: string;
  city: string;
  zipCode: string;
  newsletter: boolean;
  notifications: boolean;
  submittedAt: number;
  confirmationId: string;
}

interface ValidationErrorContext {
  step: 'validationError';
  errors: string[];
  currentStep: 'personal' | 'address' | 'preferences';
  partialData: Partial<Step3Context>;
}

// =============================================================================
// STATE MACHINE CLASSES
// =============================================================================

/**
 * Step 1: Personal Information
 */
export class PersonalInfoMachine extends MachineBase<Step1Context> {
  constructor(context: Step1Context = { step: 'personal', name: '', email: '' }) {
    super(context);
  }

  /**
   * Proceed to address step
   */
  next = describe(
    'Proceed to address information step',
    guarded(
      {
        name: 'validatePersonalInfo',
        description: 'Name and email must be valid',
      },
      transitionTo(AddressMachine, (name: string, email: string) => {
        return new AddressMachine({
          step: 'address',
          name,
          email,
          street: '',
          city: '',
          zipCode: '',
        });
      })
    )
  );

  /**
   * Validation failed
   */
  validationFailed = describe(
    'Handle validation errors in personal info',
    transitionTo(ValidationErrorMachine, (errors: string[]) => {
      return new ValidationErrorMachine({
        step: 'validationError',
        errors,
        currentStep: 'personal',
        partialData: { step: 'personal', ...this.context },
      });
    })
  );
}

/**
 * Step 2: Address Information
 */
export class AddressMachine extends MachineBase<Step2Context> {
  constructor(context: Step2Context) {
    super(context);
  }

  /**
   * Proceed to preferences step
   */
  next = describe(
    'Proceed to preferences step',
    guarded(
      {
        name: 'validateAddress',
        description: 'Address fields must be filled',
      },
      transitionTo(PreferencesMachine, (street: string, city: string, zipCode: string) => {
        return new PreferencesMachine({
          step: 'preferences',
          ...this.context,
          street,
          city,
          zipCode,
          newsletter: false,
          notifications: true,
        });
      })
    )
  );

  /**
   * Go back to personal info
   */
  back = describe(
    'Return to personal information step',
    transitionTo(PersonalInfoMachine, () => {
      return new PersonalInfoMachine({
        step: 'personal',
        name: this.context.name,
        email: this.context.email,
      });
    })
  );

  /**
   * Validation failed
   */
  validationFailed = describe(
    'Handle validation errors in address',
    transitionTo(ValidationErrorMachine, (errors: string[]) => {
      return new ValidationErrorMachine({
        step: 'validationError',
        errors,
        currentStep: 'address',
        partialData: { ...this.context },
      });
    })
  );
}

/**
 * Step 3: Preferences
 */
export class PreferencesMachine extends MachineBase<Step3Context> {
  constructor(context: Step3Context) {
    super(context);
  }

  /**
   * Submit the form
   */
  submit = describe(
    'Submit the complete form',
    action(
      { name: 'submitForm', description: 'Send form data to server' },
      transitionTo(CompleteMachine, (newsletter: boolean, notifications: boolean) => {
        const confirmationId = `CONF-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        return new CompleteMachine({
          step: 'complete',
          ...this.context,
          newsletter,
          notifications,
          submittedAt: Date.now(),
          confirmationId,
        });
      })
    )
  );

  /**
   * Go back to address
   */
  back = describe(
    'Return to address step',
    transitionTo(AddressMachine, () => {
      return new AddressMachine({
        step: 'address',
        name: this.context.name,
        email: this.context.email,
        street: this.context.street,
        city: this.context.city,
        zipCode: this.context.zipCode,
      });
    })
  );
}

/**
 * Complete state - form successfully submitted
 */
export class CompleteMachine extends MachineBase<CompleteContext> {
  constructor(context: CompleteContext) {
    super(context);
  }

  /**
   * Start over with a new form
   */
  startOver = describe(
    'Reset and start a new form',
    transitionTo(PersonalInfoMachine, () => {
      return new PersonalInfoMachine({
        step: 'personal',
        name: '',
        email: '',
      });
    })
  );

  /**
   * Download confirmation
   */
  downloadConfirmation = describe(
    'Download form confirmation PDF',
    action(
      { name: 'downloadPDF', description: 'Generate and download confirmation PDF' },
      transitionTo(CompleteMachine, () => {
        // Return same state, action is fire-and-forget
        return new CompleteMachine(this.context);
      })
    )
  );
}

/**
 * Validation Error state
 */
export class ValidationErrorMachine extends MachineBase<ValidationErrorContext> {
  constructor(context: ValidationErrorContext) {
    super(context);
  }

  /**
   * Return to the step that had validation errors
   */
  retry = describe(
    'Return to the form step to fix validation errors',
    transitionTo(PersonalInfoMachine, () => {
      // Simplified: always returns to PersonalInfo
      // In real app, would route based on currentStep
      const partial = this.context.partialData;

      switch (this.context.currentStep) {
        case 'personal':
          return new PersonalInfoMachine({
            step: 'personal',
            name: (partial as any).name || '',
            email: (partial as any).email || '',
          }) as any;
        case 'address':
          return new AddressMachine(partial as any) as any;
        case 'preferences':
          return new PreferencesMachine(partial as any) as any;
        default:
          return new PersonalInfoMachine();
      }
    })
  );

  /**
   * Cancel and start over
   */
  cancel = describe(
    'Cancel form and start over',
    transitionTo(PersonalInfoMachine, () => {
      return new PersonalInfoMachine({
        step: 'personal',
        name: '',
        email: '',
      });
    })
  );
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new form machine starting at personal info step
 */
export function createFormMachine(): PersonalInfoMachine {
  return new PersonalInfoMachine({
    step: 'personal',
    name: '',
    email: '',
  });
}
