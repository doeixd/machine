/**
 * @file Core library exports without framework integrations
 * @description Minimal bundle for users who don't need React/Solid.js
 */

// =============================================================================
// SECTION: CORE TYPES & INTERFACES
// =============================================================================

export type {
  MaybePromise,
  Machine,
  AsyncMachine,
  AsyncTransitionArgs,
  TransitionOptions,
  BaseMachine,
  DeepReadonly,
  InferMachine,
  Event,
  MachineLike,
  MachineResult
} from './index';

// =============================================================================
// SECTION: TYPE UTILITIES & INTROSPECTION
// =============================================================================

export type {
  Context,
  Transitions,
  TransitionArgs,
  TransitionNames
} from './index';

// =============================================================================
// SECTION: MACHINE CREATION (FUNCTIONAL & OOP)
// =============================================================================

export {
  createMachine,
  createAsyncMachine,
  createMachineFactory,
  createMachineBuilder,
  MachineBase,
  next,
  matchMachine,
  hasState
} from './index';

// =============================================================================
// SECTION: ADVANCED CREATION & IMMUTABLE HELPERS
// =============================================================================

export {
  setContext,
  overrideTransitions,
  extendTransitions,
  combineFactories
} from './index';

// =============================================================================
// SECTION: RUNTIME & EVENT DISPATCHER
// =============================================================================

export {
  runMachine
} from './index';

// =============================================================================
// SECTION: GENERATOR-BASED COMPOSITION
// =============================================================================

export {
  run,
  step,
  yieldMachine,
  runSequence,
  createFlow,
  runWithDebug,
  runAsync,
  stepAsync
} from './generators';

// =============================================================================
// SECTION: TYPE-LEVEL METADATA PRIMITIVES
// =============================================================================

export {
  transitionTo,
  describe,
  guarded,
  guard,
  guardAsync,
  whenGuard,
  whenGuardAsync,
  invoke,
  action,
  metadata,
  META_KEY,
  type TransitionMeta,
  type GuardMeta,
  type InvokeMeta,
  type ActionMeta,
  type ClassConstructor,
  type WithMeta,
  type GuardOptions,
  type GuardFallback,
  type GuardedTransition
} from './primitives';

// =============================================================================
// SECTION: STATECHART EXTRACTION (Build-time only)
// =============================================================================

// Note: Extraction tools are available as dev dependencies for build-time use
// They are not included in the runtime bundle for size optimization
// Use: npx tsx scripts/extract-statechart.ts

export type {
  MachineConfig,
  ExtractionConfig
} from './extract';

// =============================================================================
// SECTION: MIDDLEWARE & INTERCEPTION
// =============================================================================

export * from './middleware/index';

// =============================================================================
// SECTION: UTILITIES & HELPERS
// =============================================================================

export {
  isState,
  createEvent,
  createTransition,
  mergeContext,
  pipeTransitions,
  logState,
  call,
  bindTransitions,
  BoundMachine
} from './utils';

// =============================================================================
// SECTION: FUNCTIONAL COMBINATORS
// =============================================================================

export {
  createTransitionFactory,
  createTransitionExtender,
  createFunctionalMachine,
  state
} from './functional-combinators';

// =============================================================================
// SECTION: MULTI-MACHINE COORDINATION
// =============================================================================

export * from './multi';

// =============================================================================
// SECTION: HIGHER-ORDER MACHINES
// =============================================================================

export * from './higher-order';