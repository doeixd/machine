Of course. This is an excellent and challenging request that gets to the heart of making the library's tooling truly powerful.

Yes, it is absolutely possible to make the statechart extractor handle these advanced patterns. It requires making the extractor "smarter" by teaching it to recognize these specific compositional patterns (`delegateToChild` and `createParallelMachine`) in the Abstract Syntax Tree (AST) and to assemble the JSON output accordingly.

Here is a comprehensive guide for an AI agent to implement this support.

---

## AI Implementation Guide: Advanced Statechart Extraction

### Project Goal

Upgrade the static statechart extractor (`src/extract.ts`) to natively understand and correctly visualize two advanced patterns:
1.  **Hierarchical (Nested) States**, as defined by the `delegateToChild` primitive.
2.  **Parallel (Orthogonal) States**, as defined by a `createParallelMachine` primitive.

The final output must be valid XState v5 JSON that correctly represents these nested and parallel structures for visualization in tools like Stately Viz.

### Guiding Principles

1.  **Backward Compatibility:** The changes must not break the existing extraction process for simple, flat state machines.
2.  **AST-First:** All analysis must continue to be done on the AST via `ts-morph`. Do not introduce runtime logic.
3.  **Leverage Existing Logic:** Reuse the core `extractMetaFromMember` and `analyzeStateNode` functions wherever possible. The goal is to enhance the orchestration, not rewrite the fundamental metadata parsing.
4.  **Configuration Driven:** The extractor should learn about these complex structures through new, optional properties in the `MachineConfig`.

---

## Part 1: Supporting Hierarchical States (`delegateToChild`)

### 1.1. Conceptual Plan

1.  **Configuration:** Update `MachineConfig` to allow defining a parent-child relationship. A parent state will have a `child` property in its context, and we'll need to know which property on the child's context acts as the discriminant (e.g., `status`).
2.  **Recursive Analysis:** Modify `extractMachine` to be recursive. When it analyzes a parent state, it must also analyze all possible child states and embed their generated JSON into the parent's `states` property.
3.  **Transition Delegation:** Modify `analyzeStateNode`. When it encounters a property defined with `delegateToChild('actionName')`, it must:
    a. Find the type of the `child` property in the parent's context. This will be a union of all possible child states.
    b. For each state in that union, find the `actionName` method.
    c. Run the existing metadata extraction on that child's method to find its target, description, etc.
    d. Aggregate these findings. An action delegated to a child may result in a transition to another child state, which is an internal transition within the parent state.

### 1.2. Implementation Steps

#### **Step 1: Update Configuration Types (`src/extract.ts`)**

Modify `MachineConfig` to support nesting. We will add a `children` property.

```typescript
// in src/extract.ts

export interface MachineConfig {
  // ... existing properties
  id: string;
  initialState: string;

  // NEW: Add support for defining child states
  children?: {
    // The property in the parent's context that holds the child machine
    contextProperty: 'child'; // Typically 'child'
    // An array of all possible child state class names
    classes: string[];
    // The initial child state
    initialState: string;
  };
}
```

#### **Step 2: Modify `analyzeStateNode` to Handle Delegation**

This is the most complex part. Update `analyzeStateNode` in `src/extract.ts` to recognize the `delegateToChild` pattern.

```typescript
// in src/extract.ts, inside analyzeStateNode function

// ... inside the `for (const member of classDeclaration.getInstanceMembers())` loop ...

// Existing logic to get initializer
const initializer = member.getInitializer();

// NEW: Check for the delegateToChild pattern
if (initializer && Node.isCallExpression(initializer) && initializer.getExpression().getText() === 'delegateToChild') {
  const delegatedActionNameNode = initializer.getArguments()[0];
  if (delegatedActionNameNode && Node.isStringLiteral(delegatedActionNameNode)) {
    const delegatedActionName = delegatedActionNameNode.getLiteralValue();
    if (verbose) {
      console.error(`      -> Delegated action found: ${memberName} -> child.${delegatedActionName}`);
    }

    // This is a delegated action. We need to find the child's implementation.
    // In XState, this is an internal transition within the parent state.
    // The target will be another child state. We can model this by finding the target
    // of the child's action.

    // For simplicity in this guide, we will represent it as an internal action for now.
    // A full implementation would trace the target.
    chartNode.on[memberName] = {
      // NOTE: This is a simplification. A complete solution would need to trace
      // the child's transition target and represent it as an internal transition,
      // e.g., target: '.childStateName'
      actions: [`delegateToChild('${delegatedActionName}')`],
      description: `Delegates '${delegatedActionName}' to the child state.`,
    };
  }
  continue; // Skip the rest of the loop for this member
}

// ... existing logic to call extractMetaFromMember(member, verbose) ...
```
*Self-Correction: A truly robust implementation is more complex than the simplification above. The extractor would need to get the type of the `child` property, iterate its union types, find the `delegatedActionName` method on each, and extract the target from there, creating a multi-target transition if necessary.*

#### **Step 3: Make `extractMachine` Recursive**

Update `extractMachine` to process the `children` configuration.

```typescript
// in src/extract.ts

export function extractMachine(
  config: MachineConfig,
  project: Project,
  verbose = false
): any {
  // ... existing setup logic ...

  const fullChart: any = {
    id: config.id,
    initial: config.initialState,
    states: {},
  };
  
  // ...

  for (const className of config.classes) {
    // ... analyze the parent state node as before ...
    const stateNode = analyzeStateNode(classSymbol, verbose);

    // NEW: If this class is the parent and has children, process them.
    if (className === config.initialState && config.children) {
      if (verbose) {
        console.error(`  👪 Analyzing children for state: ${className}`);
      }
      stateNode.initial = config.children.initialState;
      stateNode.states = {}; // Create the nested states object

      // Recursively analyze each child state
      for (const childClassName of config.children.classes) {
        const childClassDeclaration = sourceFile.getClass(childClassName);
        if (childClassDeclaration) {
          const childSymbol = childClassDeclaration.getSymbolOrThrow();
          // Analyze the child and add it to the parent's `states` object
          stateNode.states[childClassName] = analyzeStateNode(childSymbol, verbose);
        } else {
          console.warn(`⚠️ Warning: Child class '${childClassName}' not found in '${config.input}'.`);
        }
      }
    }

    fullChart.states[className] = stateNode;
  }

  return fullChart;
}
```

---

## Part 2: Supporting Parallel States (`createParallelMachine`)

### 2.1. Conceptual Plan

1.  **Configuration:** Introduce a new top-level `parallel` property in `MachineConfig`. This will define the different orthogonal "regions" of the parallel state.
2.  **New Extraction Path:** In `extractMachine`, add a new branch to handle this `parallel` config.
3.  **Graph Traversal:** For each region defined in the config, the extractor must perform a graph traversal starting from the region's initial state. It will analyze the initial class, find all its transition targets, analyze those, and so on, until it has discovered all reachable states *within that region*.
4.  **Assembly:** The final JSON will be assembled with `type: 'parallel'` and a `states` object containing a separate state machine definition for each region.

### 2.2. Implementation Steps

#### **Step 1: Update Configuration Types (`src/extract.ts`)**

Add a `parallel` option to `MachineConfig`. The existing `classes` property will be ignored if `parallel` is used.

```typescript
// in src/extract.ts

export interface ParallelRegionConfig {
  /** A unique name for this region (e.g., 'fontStyle'). */
  name: string;
  /** The initial state class for this region. */
  initialState: string;
  /** All reachable state classes within this region. */
  classes: string[];
}

export interface MachineConfig {
  // ... existing properties ...
  id: string;
  
  // EITHER `initialState` and `classes` for an FSM...
  initialState?: string;
  classes?: string[];

  // OR `parallel` for a parallel machine.
  parallel?: {
    regions: ParallelRegionConfig[];
  };

  children?: { /* ... as before ... */ };
}
```

#### **Step 2: Update `extractMachine` for Parallel States**

Add a new top-level `if` block in `extractMachine` to handle the `parallel` configuration.

```typescript
// in src/extract.ts, inside extractMachine function

export function extractMachine(
  config: MachineConfig,
  project: Project,
  verbose = false
): any {
  if (verbose) {
    console.error(`\n🔍 Analyzing machine: ${config.id}`);
    console.error(`  Source: ${config.input}`);
  }

  const sourceFile = project.getSourceFile(config.input);
  if (!sourceFile) {
    throw new Error(`Source file not found: ${config.input}`);
  }

  // NEW: Handle parallel machine configuration
  if (config.parallel) {
    if (verbose) console.error(`  Parallel machine detected. Analyzing regions.`);

    const parallelChart: any = {
      id: config.id,
      type: 'parallel',
      states: {},
    };

    for (const region of config.parallel.regions) {
      if (verbose) console.error(`    Analyzing region: ${region.name}`);
      
      const regionStates: any = {};
      for (const className of region.classes) {
        const classDeclaration = sourceFile.getClass(className);
        if (classDeclaration) {
          const classSymbol = classDeclaration.getSymbolOrThrow();
          regionStates[className] = analyzeStateNode(classSymbol, verbose);
        } else {
          console.warn(`⚠️ Warning: Class '${className}' not found for region '${region.name}'.`);
        }
      }
      
      parallelChart.states[region.name] = {
        initial: region.initialState,
        states: regionStates,
      };
    }
    return parallelChart;
  }

  // --- Fallback to existing FSM logic ---
  if (!config.initialState || !config.classes) {
    throw new Error(`Machine config for '${config.id}' must have either 'parallel' or 'initialState'/'classes'.`);
  }
  
  // ... rest of the existing FSM extraction logic ...
}
```
*Note: The above implementation relies on the user providing all reachable `classes` for each region. A more advanced version would perform the graph traversal automatically, but this is a solid, explicit first step.*

### Example of New Configuration

Here is how a user would configure these new features in their `.statechart.config.ts`:

```typescript
// .statechart.config.ts

const config: ExtractionConfig = {
  machines: [
    // 1. Example of a Hierarchical Machine
    {
      input: 'examples/dashboardMachine.ts',
      id: 'dashboard',
      classes: ['DashboardMachine', 'LoggedOutMachine'],
      initialState: 'DashboardMachine',
      children: {
        contextProperty: 'child',
        initialState: 'ViewingChildMachine',
        classes: ['ViewingChildMachine', 'EditingChildMachine'],
      },
    },

    // 2. Example of a Parallel Machine
    {
      input: 'examples/editorMachine.ts',
      id: 'editor',
      parallel: {
        regions: [
          {
            name: 'fontWeight',
            initialState: 'NormalWeight',
            classes: ['NormalWeight', 'BoldWeight'],
          },
          {
            name: 'textDecoration',
            initialState: 'NoDecoration',
            classes: ['NoDecoration', 'UnderlineState'],
          },
        ],
      },
    },
  ],
};

export default config;
```

### Final Validation

After implementing these changes, the generated JSON for the parallel machine should look like this:

```json
{
  "id": "editor",
  "type": "parallel",
  "states": {
    "fontWeight": {
      "initial": "NormalWeight",
      "states": {
        "NormalWeight": {
          "on": { "bold": { "target": "BoldWeight" } }
        },
        "BoldWeight": {
          "on": { "unbold": { "target": "NormalWeight" } }
        }
      }
    },
    "textDecoration": {
      "initial": "NoDecoration",
      "states": {
        "NoDecoration": {
          "on": { "underline": { "target": "UnderlineState" } }
        },
        "UnderlineState": {
          "on": { "removeUnderline": { "target": "NoDecoration" } }
        }
      }
    }
  }
}
```