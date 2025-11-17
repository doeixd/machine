/**
 * @file Tests for Advanced Statechart Extraction (Hierarchical & Parallel)
 * @description
 * Tests demonstrating the new hierarchical and parallel machine extraction capabilities.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Project } from 'ts-morph';
import { extractMachine, type MachineConfig } from '../src/extract';

describe('Advanced Statechart Extraction', () => {
  let project: Project;

  beforeEach(() => {
    project = new Project();
    project.addSourceFilesAtPaths("src/**/*.ts");
    project.addSourceFilesAtPaths("examples/**/*.ts");
  });

  describe('Parallel Machines', () => {
    it('should extract parallel regions with correct structure', () => {
      // Create test source file with parallel state classes
      const testSource = project.createSourceFile('test-parallel.ts', `
        import { MachineBase } from './src/index';
        import { transitionTo } from './src/primitives';

        class StateA extends MachineBase<{ value: string }> {
          next = transitionTo(StateB, () => new StateB({ value: 'b' }));
        }

        class StateB extends MachineBase<{ value: string }> {
          next = transitionTo(StateA, () => new StateA({ value: 'a' }));
        }

        class StateC extends MachineBase<{ count: number }> {
          next = transitionTo(StateD, () => new StateD({ count: 1 }));
        }

        class StateD extends MachineBase<{ count: number }> {
          next = transitionTo(StateC, () => new StateC({ count: 0 }));
        }
      `);

      const config: MachineConfig = {
        input: 'test-parallel.ts',
        id: 'parallelExample',
        description: 'Example parallel machine',
        parallel: {
          regions: [
            {
              name: 'region1',
              initialState: 'StateA',
              classes: ['StateA', 'StateB'],
            },
            {
              name: 'region2',
              initialState: 'StateC',
              classes: ['StateC', 'StateD'],
            },
          ],
        },
      };

      const result = extractMachine(config, project);

      expect(result).toBeDefined();
      expect(result.type).toBe('parallel');
      expect(result.id).toBe('parallelExample');
      expect(result.description).toBe('Example parallel machine');
      expect(result.states).toBeDefined();
      expect(result.states['region1']).toBeDefined();
      expect(result.states['region1'].initial).toBe('StateA');
      expect(result.states['region2']).toBeDefined();
      expect(result.states['region2'].initial).toBe('StateC');
    });

    it('should have region states nested under initial property', () => {
      // Create test source file with font style classes
      const testSource = project.createSourceFile('test-font-style.ts', `
        import { MachineBase } from './src/index';
        import { transitionTo } from './src/primitives';

        class Normal extends MachineBase<{ style: string }> {
          italic = transitionTo(Italic, () => new Italic({ style: 'italic' }));
          bold = transitionTo(Bold, () => new Bold({ style: 'bold' }));
        }

        class Italic extends MachineBase<{ style: string }> {
          normal = transitionTo(Normal, () => new Normal({ style: 'normal' }));
          bold = transitionTo(Bold, () => new Bold({ style: 'bold' }));
        }

        class Bold extends MachineBase<{ style: string }> {
          normal = transitionTo(Normal, () => new Normal({ style: 'normal' }));
          italic = transitionTo(Italic, () => new Italic({ style: 'italic' }));
        }
      `);

      const config: MachineConfig = {
        input: 'test-font-style.ts',
        id: 'parallelStates',
        parallel: {
          regions: [
            {
              name: 'fontStyle',
              initialState: 'Normal',
              classes: ['Normal', 'Italic', 'Bold'],
            },
          ],
        },
      };

      const result = extractMachine(config, project);
      const region = result.states['fontStyle'];

      expect(region.states).toBeDefined();
      expect(region.states['Normal']).toBeDefined();
      expect(region.states['Italic']).toBeDefined();
      expect(region.states['Bold']).toBeDefined();
    });
  });

  describe('Hierarchical Machines', () => {
    it('should extract hierarchical machines with nested states', () => {
      // Create test source file with hierarchical state classes
      const testSource = project.createSourceFile('test-hierarchical.ts', `
        import { MachineBase } from './src/index';
        import { transitionTo } from './src/primitives';

        class LoggedOutMachine extends MachineBase<{ status: string }> {
          login = transitionTo(LoggedInMachine, () => new LoggedInMachine({ status: 'loggedIn' }));
        }

        class LoggedInMachine extends MachineBase<{ status: string }> {
          logout = transitionTo(LoggedOutMachine, () => new LoggedOutMachine({ status: 'loggedOut' }));
        }

        class ChildState1 extends MachineBase<{ value: number }> {
          next = transitionTo(ChildState2, () => new ChildState2({ value: 2 }));
        }

        class ChildState2 extends MachineBase<{ value: number }> {
          next = transitionTo(ChildState1, () => new ChildState1({ value: 1 }));
        }
      `);

      const config: MachineConfig = {
        input: 'test-hierarchical.ts',
        classes: ['LoggedOutMachine', 'LoggedInMachine'],
        output: undefined,
        id: 'hierarchicalAuth',
        initialState: 'LoggedOutMachine',
        description: 'Auth with nested states',
        children: {
          contextProperty: 'child',
          initialState: 'ChildState1',
          classes: ['ChildState1', 'ChildState2'],
        },
      };

      const result = extractMachine(config, project);

      expect(result).toBeDefined();
      expect(result.id).toBe('hierarchicalAuth');
      expect(result.states['LoggedOutMachine']).toBeDefined();
      expect(result.states['LoggedOutMachine'].initial).toBe('ChildState1');
      expect(result.states['LoggedOutMachine'].states).toBeDefined();
      expect(result.states['LoggedOutMachine'].states['ChildState1']).toBeDefined();
      expect(result.states['LoggedOutMachine'].states['ChildState2']).toBeDefined();
    });

    it('should not add children to non-initial states', () => {
      // Create test source file with hierarchical state classes
      const testSource = project.createSourceFile('test-mixed-hierarchy.ts', `
        import { MachineBase } from './src/index';
        import { transitionTo } from './src/primitives';

        class LoggedOutMachine extends MachineBase<{ status: string }> {
          login = transitionTo(LoggedInMachine, () => new LoggedInMachine({ status: 'loggedIn' }));
        }

        class LoggedInMachine extends MachineBase<{ status: string }> {
          logout = transitionTo(LoggedOutMachine, () => new LoggedOutMachine({ status: 'loggedOut' }));
        }

        class Child1 extends MachineBase<{ value: number }> {
          next = transitionTo(Child2, () => new Child2({ value: 2 }));
        }

        class Child2 extends MachineBase<{ value: number }> {
          next = transitionTo(Child1, () => new Child1({ value: 1 }));
        }
      `);

      const config: MachineConfig = {
        input: 'test-mixed-hierarchy.ts',
        classes: ['LoggedOutMachine', 'LoggedInMachine'],
        id: 'mixedHierarchy',
        initialState: 'LoggedOutMachine',
        children: {
          contextProperty: 'child',
          initialState: 'Child1',
          classes: ['Child1', 'Child2'],
        },
      };

      const result = extractMachine(config, project);

      // Only the initial state should have nested states
      expect(result.states['LoggedOutMachine'].states).toBeDefined();
      // LoggedInMachine should NOT have nested states
      expect(result.states['LoggedInMachine'].states).toBeUndefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should throw error when neither parallel nor FSM config is provided', () => {
      const config: MachineConfig = {
        input: 'examples/trafficLightMachine.ts',
        id: 'invalid',
        // Missing both `parallel` and `initialState`/`classes`
      };

      expect(() => extractMachine(config, project)).toThrow(
        /must have either 'parallel' or 'initialState'\/'classes'/
      );
    });

    it('should work with parallel config without initialState/classes', () => {
      const config: MachineConfig = {
        input: 'examples/trafficLightMachine.ts',
        id: 'parallelOnly',
        // No initialState, classes, or description - only parallel
        parallel: {
          regions: [
            {
              name: 'r1',
              initialState: 'S1',
              classes: ['S1'],
            },
          ],
        },
      };

      const result = extractMachine(config, project);
      expect(result.id).toBe('parallelOnly');
      expect(result.type).toBe('parallel');
      expect(result.states['r1']).toBeDefined();
    });
  });

  describe('Metadata Extraction in Hierarchical Contexts', () => {
    it('should extract transition metadata from child states', () => {
      // Create test source file with hierarchical state classes with metadata
      const testSource = project.createSourceFile('test-child-meta.ts', `
        import { MachineBase } from './src/index';
        import { transitionTo, describe } from './src/primitives';

        class LoggedInMachine extends MachineBase<{ status: string }> {
          logout = transitionTo(LoggedOutMachine, () => new LoggedOutMachine({ status: 'loggedOut' }));
        }

        class LoggedOutMachine extends MachineBase<{ status: string }> {
          login = transitionTo(LoggedInMachine, () => new LoggedInMachine({ status: 'loggedIn' }));
        }

        class ViewMode extends MachineBase<{ mode: string }> {
          edit = describe('Switch to edit mode', transitionTo(EditMode, () => new EditMode({ mode: 'edit' })));
        }

        class EditMode extends MachineBase<{ mode: string }> {
          view = describe('Switch to view mode', transitionTo(ViewMode, () => new ViewMode({ mode: 'view' })));
        }
      `);

      const config: MachineConfig = {
        input: 'test-child-meta.ts',
        classes: ['LoggedInMachine'],
        id: 'withChildMeta',
        initialState: 'LoggedInMachine',
        children: {
          contextProperty: 'child',
          initialState: 'ViewMode',
          classes: ['ViewMode', 'EditMode'],
        },
      };

      const result = extractMachine(config, project);
      const parentState = result.states['LoggedInMachine'];

      // Verify parent state structure
      expect(parentState.states).toBeDefined();
      expect(parentState.initial).toBe('ViewMode');
      expect(parentState.states['ViewMode']).toBeDefined();
      expect(parentState.states['EditMode']).toBeDefined();

      // Each child state should have its own `on` transitions
      expect(parentState.states['ViewMode'].on).toBeDefined();
      expect(parentState.states['EditMode'].on).toBeDefined();
    });
  });
});
