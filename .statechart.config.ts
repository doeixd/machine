/**
 * @file Statechart Extraction Configuration
 * @description
 * Configuration file for the statechart extraction tool.
 * Defines which machines to extract and how to process them.
 *
 * Usage:
 *   npx tsx scripts/extract-statechart.ts --config .statechart.config.ts
 *
 * Or simply:
 *   npm run extract
 */

import type { ExtractionConfig } from './src/extract';

const config: ExtractionConfig = {
  // Array of machines to extract
  machines: [
    // Authentication Machine
    {
      input: 'examples/authMachine.ts',
      classes: [
        'LoggedOutMachine',
        'LoggingInMachine',
        'LoggedInMachine',
        'SessionExpiredMachine',
        'ErrorMachine',
      ],
      output: 'statecharts/auth.json',
      id: 'auth',
      initialState: 'LoggedOutMachine',
      description: 'User authentication state machine with login, session management, and error handling',
    },

    // Data Fetching Machine
    {
      input: 'examples/fetchMachine.ts',
      classes: [
        'IdleMachine',
        'LoadingMachine',
        'SuccessMachine',
        'ErrorMachine',
        'RetryingMachine',
      ],
      output: 'statecharts/fetch.json',
      id: 'fetch',
      initialState: 'IdleMachine',
      description: 'Generic data fetching machine with retry logic and error recovery',
    },

    // Multi-step Form Machine
    {
      input: 'examples/formMachine.ts',
      classes: [
        'PersonalInfoMachine',
        'AddressMachine',
        'PreferencesMachine',
        'CompleteMachine',
        'ValidationErrorMachine',
      ],
      output: 'statecharts/form.json',
      id: 'form',
      initialState: 'PersonalInfoMachine',
      description: 'Multi-step form wizard with validation and backward navigation',
    },

    // Traffic Light Machine
    {
      input: 'examples/trafficLightMachine.ts',
      classes: [
        'RedLightMachine',
        'YellowLightMachine',
        'GreenLightMachine',
      ],
      output: 'statecharts/trafficLight.json',
      id: 'trafficLight',
      initialState: 'RedLightMachine',
      description: 'Simple traffic light state machine with cyclic transitions',
    },
  ],

  // Global options
  validate: true,        // Validate output against XState JSON schema
  format: 'json',        // Output format: 'json' | 'mermaid' | 'both'
  verbose: true,         // Enable verbose logging
  watch: false,          // Watch mode disabled by default (enable with --watch)
};

export default config;
