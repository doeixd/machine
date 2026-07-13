/**
 * @file Solid.js integration entry point
 */

// Solid's reactive helpers intentionally use the names createMachine and
// createAsyncMachine. Import core factories from the package root to avoid
// ambiguous exports from this framework-specific entry point.
export * from './solid';
