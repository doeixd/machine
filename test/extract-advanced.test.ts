/**
 * @file Tests for Advanced Statechart Extraction (Hierarchical & Parallel)
 * @description
 * Tests demonstrating the new hierarchical and parallel machine extraction capabilities.
 */

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
      const config: MachineConfig = {
        input: 'examples/trafficLightMachine.ts',
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
      const config: MachineConfig = {
        input: 'examples/trafficLightMachine.ts',
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
      const config: MachineConfig = {
        input: 'examples/authMachine.ts',
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
      const config: MachineConfig = {
        input: 'examples/authMachine.ts',
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
      const config: MachineConfig = {
        input: 'examples/authMachine.ts',
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
