# Advanced Statechart Extraction: Hierarchical and Parallel Machines

This document describes the new hierarchical and parallel machine support in the statechart extractor.

## Overview

The statechart extractor now supports two advanced patterns for modeling complex state machines:

1. **Hierarchical (Nested) States** - Parent states containing child states
2. **Parallel (Orthogonal) States** - Independent regions evolving simultaneously

## Configuration Types

### New Configuration Interfaces

```typescript
// For parallel regions
export interface ParallelRegionConfig {
  name: string;          // Unique name for the region
  initialState: string;  // Initial state class name
  classes: string[];     // All state classes in this region
}

// For child states
export interface ChildStatesConfig {
  contextProperty: string;  // Property holding child (typically 'child')
  initialState: string;     // Initial child state class
  classes: string[];        // All child state classes
}

// Updated MachineConfig
export interface MachineConfig {
  input: string;
  id: string;
  description?: string;
  output?: string;

  // For simple FSM
  initialState?: string;
  classes?: string[];

  // For parallel machines
  parallel?: {
    regions: ParallelRegionConfig[];
  };

  // For hierarchical machines
  children?: ChildStatesConfig;
}
```

## Hierarchical Machines

Hierarchical machines model parent-child state relationships where a parent state contains multiple child states.

### Configuration

```typescript
const config: MachineConfig = {
  input: 'examples/dashboardMachine.ts',
  classes: ['DashboardMachine', 'ErrorState'],
  id: 'dashboard',
  initialState: 'DashboardMachine',
  description: 'Dashboard with nested view states',
  
  // Define child states for the initial state
  children: {
    contextProperty: 'child',        // Property name in parent context
    initialState: 'ViewingMachine',   // Initial child state
    classes: ['ViewingMachine', 'EditingMachine'], // All child states
  },
};
```

### Generated Output

```json
{
  "id": "dashboard",
  "initial": "DashboardMachine",
  "states": {
    "DashboardMachine": {
      "initial": "ViewingMachine",
      "states": {
        "ViewingMachine": {
          "on": { /* transitions */ }
        },
        "EditingMachine": {
          "on": { /* transitions */ }
        }
      },
      "on": { /* parent transitions */ }
    },
    "ErrorState": {
      "on": { /* transitions */ }
    }
  }
}
```

### Key Points

- Child states are only added to the **initial state** of the parent machine
- Each child state is fully analyzed, extracting its transitions and metadata
- Parent states can still have their own transitions
- Child state transitions are nested under the parent's `states` property

## Parallel Machines

Parallel machines model independent, orthogonal regions that can evolve simultaneously.

### Configuration

```typescript
const config: MachineConfig = {
  input: 'examples/editorMachine.ts',
  id: 'editor',
  description: 'Text editor with parallel formatting',
  
  // Define independent regions
  parallel: {
    regions: [
      {
        name: 'fontWeight',
        initialState: 'Normal',
        classes: ['Normal', 'Bold', 'Light'],
      },
      {
        name: 'textDecoration',
        initialState: 'None',
        classes: ['None', 'Underline', 'Strikethrough'],
      },
      {
        name: 'fontSize',
        initialState: 'Medium',
        classes: ['Small', 'Medium', 'Large'],
      },
    ],
  },
};
```

### Generated Output

```json
{
  "id": "editor",
  "type": "parallel",
  "states": {
    "fontWeight": {
      "initial": "Normal",
      "states": {
        "Normal": { "on": { "bold": { "target": "Bold" } } },
        "Bold": { "on": { "unBold": { "target": "Normal" } } },
        "Light": { "on": { /* ... */ } }
      }
    },
    "textDecoration": {
      "initial": "None",
      "states": {
        "None": { "on": { "underline": { "target": "Underline" } } },
        "Underline": { "on": { /* ... */ } },
        "Strikethrough": { "on": { /* ... */ } }
      }
    },
    "fontSize": {
      "initial": "Medium",
      "states": {
        "Small": { "on": { /* ... */ } },
        "Medium": { "on": { /* ... */ } },
        "Large": { "on": { /* ... */ } }
      }
    }
  }
}
```

### Key Points

- The root machine has `type: "parallel"` instead of `initial`
- Each region is a separate state machine with its own `initial` and `states`
- Regions evolve independently but are part of the same machine
- XState and Stately Viz natively support this format

## Configuration Examples

### In `.statechart.config.ts`

```typescript
import type { ExtractionConfig } from './src/extract';

const config: ExtractionConfig = {
  machines: [
    // Standard FSM
    {
      input: 'examples/authMachine.ts',
      classes: ['LoggedOut', 'LoggingIn', 'LoggedIn'],
      id: 'auth',
      initialState: 'LoggedOut',
    },

    // Hierarchical Machine
    {
      input: 'examples/dashboardMachine.ts',
      classes: ['Dashboard', 'Error'],
      id: 'dashboard',
      initialState: 'Dashboard',
      children: {
        contextProperty: 'child',
        initialState: 'Viewing',
        classes: ['Viewing', 'Editing'],
      },
    },

    // Parallel Machine
    {
      input: 'examples/editorMachine.ts',
      id: 'editor',
      parallel: {
        regions: [
          {
            name: 'formatting',
            initialState: 'Normal',
            classes: ['Normal', 'Bold', 'Italic'],
          },
          {
            name: 'selection',
            initialState: 'NoSelection',
            classes: ['NoSelection', 'TextSelected'],
          },
        ],
      },
    },
  ],
  validate: true,
  verbose: true,
};

export default config;
```

## Usage

### Command Line

```bash
# Extract with default config
npm run extract

# Extract specific config file
npx tsx scripts/extract-statechart.ts --config .statechart.config.ts

# Watch mode
npm run extract -- --watch

# Verbose output
npm run extract -- --verbose
```

### Programmatic

```typescript
import { extractMachine, type MachineConfig } from './src/extract';
import { Project } from 'ts-morph';

const project = new Project();
project.addSourceFilesAtPaths("examples/**/*.ts");

const config: MachineConfig = {
  input: 'examples/editorMachine.ts',
  id: 'editor',
  parallel: {
    regions: [
      {
        name: 'fontWeight',
        initialState: 'Normal',
        classes: ['Normal', 'Bold'],
      },
    ],
  },
};

const statechart = extractMachine(config, project, true);
console.log(JSON.stringify(statechart, null, 2));
```

## Visualization

Both hierarchical and parallel machines are compatible with:

- **Stately Viz** - Visual statechart editor and inspector
- **XState Tools** - Visualization and debugging tools
- **UML State Machine Tools** - For formal specifications

## Implementation Details

### Hierarchical Extraction

1. The extractor identifies the initial state class
2. For each child state class in `children.classes`:
   - Analyzes the class AST to extract transitions
   - Builds a complete state node with metadata
   - Nests it under the parent's `states` property
3. Parent and child transitions are extracted independently

### Parallel Extraction

1. The extractor creates a root state with `type: "parallel"`
2. For each region in `parallel.regions`:
   - Creates a region state object with `initial` and `states`
   - Analyzes all classes in the region
   - Extracts transitions and metadata for each state
   - Nests each state under the region

### AST-Based Analysis

Both approaches use the same AST-based metadata extraction as simple FSMs:

- `transitionTo()` - Extracts target states
- `describe()` - Extracts descriptions
- `guarded()` - Extracts guard conditions
- `action()` - Extracts actions
- `invoke()` - Extracts async services

## Backward Compatibility

- Existing simple FSM configurations continue to work unchanged
- The `initialState` and `classes` properties are optional
- Either `parallel` or FSM config must be provided
- All existing features (descriptions, guards, actions, etc.) work in nested/parallel contexts

## Error Handling

```typescript
// ❌ Invalid: Neither parallel nor FSM config
{
  input: 'examples/machine.ts',
  id: 'invalid',
  // Error: must have either 'parallel' or 'initialState'/'classes'
}

// ✅ Valid: FSM config
{
  input: 'examples/machine.ts',
  id: 'valid1',
  classes: ['State1', 'State2'],
  initialState: 'State1',
}

// ✅ Valid: Parallel config
{
  input: 'examples/machine.ts',
  id: 'valid2',
  parallel: {
    regions: [
      { name: 'r1', initialState: 'S1', classes: ['S1'] }
    ]
  }
}
```

## Best Practices

### Use Hierarchical When

- States naturally group into parent-child relationships
- A child's context depends on the parent
- You want to model a "stack" of active states
- Transitions can cross parent boundaries

### Use Parallel When

- Regions are truly independent
- Each region has its own lifecycle
- Regions don't directly communicate
- You need true orthogonal state management

### Configuration Design

1. **Name regions clearly** - Use descriptive names for parallel regions
2. **Document context relationships** - Add `description` field to clarify parent-child semantics
3. **Keep hierarchies shallow** - Deeply nested states become hard to visualize
4. **Validate completeness** - Ensure `classes` array contains all reachable states

## Troubleshooting

### "Class not found" warning

```
⚠️ Warning: Class 'ChildState' not found for region 'fontStyle'.
```

**Solution**: Ensure the class name matches exactly and is in the source file.

### Missing transitions in nested states

**Cause**: The extractor only analyzes classes listed in `classes` array.

**Solution**: Add all state classes to the `classes` array, even if they seem unnecessary.

### Parallel region not appearing in output

**Cause**: Missing or incomplete region configuration.

**Solution**: Verify each region has `name`, `initialState`, and `classes` properties.

## API Reference

### extractMachine()

```typescript
export function extractMachine(
  config: MachineConfig,
  project: Project,
  verbose?: boolean
): any
```

Extracts a single machine configuration. Handles both hierarchical and parallel patterns automatically based on config.

### MachineConfig

See "Configuration Types" section for complete interface documentation.

### Related Functions

- `extractMachines()` - Extract multiple machines from `ExtractionConfig`
- `analyzeStateNode()` - Analyze a single state node (used internally)
- `extractMetaFromMember()` - Extract metadata from class members

## See Also

- [Statechart Extraction Architecture](./EXTRACTION_ARCHITECTURE.md)
- [Type-State Programming Guide](../README.md)
- [Configuration Reference](./CONFIGURATION.md)
