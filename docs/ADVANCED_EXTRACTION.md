# Hierarchical and parallel extraction

The static extractor can arrange annotated class states into nested or orthogonal statechart structures. This page covers the configuration differences from a flat machine; read the [statechart extraction guide](statechart-extraction.md) first for annotations, CLI options, output formats, validation, and limitations.

These options affect generated statechart structure only. They do not add runtime parent/child scheduling or parallel execution to machine instances.

## Hierarchical states

`children` nests one configured set of child classes under the top-level initial state.

```ts
import type { ExtractionConfig } from '@doeixd/machine/extract';

const config: ExtractionConfig = {
  machines: [{
    input: 'src/dashboard-machine.ts',
    output: 'statecharts/dashboard.json',
    id: 'dashboard',
    initialState: 'Dashboard',
    classes: ['Dashboard', 'Failed'],
    children: {
      contextProperty: 'view',
      initialState: 'Viewing',
      classes: ['Viewing', 'Editing'],
    },
  }],
  validate: true,
};

export default config;
```

The resulting shape is equivalent to:

```json
{
  "id": "dashboard",
  "initial": "Dashboard",
  "states": {
    "Dashboard": {
      "initial": "Viewing",
      "states": {
        "Viewing": { "on": {} },
        "Editing": { "on": {} }
      },
      "on": {}
    },
    "Failed": { "on": {} }
  }
}
```

Important boundaries:

- Children are attached only to the configured top-level `initialState`.
- `children.classes` must name class declarations in the same input source file.
- Parent and child transitions are analyzed independently.
- `contextProperty` records the intended runtime relationship but does not cause the extractor to inspect arbitrary object graphs.
- Only one child-state group is supported by this configuration shape; recursive, per-parent hierarchy configuration is not currently available.

## Parallel regions

`parallel` replaces top-level `initialState` and `classes`. Each region declares its own initial class and class set.

```ts
import type { ExtractionConfig } from '@doeixd/machine/extract';

const config: ExtractionConfig = {
  machines: [{
    input: 'src/editor-machine.ts',
    output: 'statecharts/editor.json',
    id: 'editor',
    parallel: {
      regions: [
        {
          name: 'fontWeight',
          initialState: 'Normal',
          classes: ['Normal', 'Bold'],
        },
        {
          name: 'selection',
          initialState: 'NoSelection',
          classes: ['NoSelection', 'TextSelected'],
        },
      ],
    },
  }],
  format: 'json',
  validate: true,
};

export default config;
```

This produces a root with `type: "parallel"`:

```json
{
  "id": "editor",
  "type": "parallel",
  "states": {
    "fontWeight": {
      "initial": "Normal",
      "states": {
        "Normal": { "on": {} },
        "Bold": { "on": {} }
      }
    },
    "selection": {
      "initial": "NoSelection",
      "states": {
        "NoSelection": { "on": {} },
        "TextSelected": { "on": {} }
      }
    }
  }
}
```

Each region is structurally independent in the generated chart. The extractor does not prove that regions avoid shared mutable data or cross-region effects.

## Run the extractor

From a consuming project:

```bash
npx --package @doeixd/machine extract \
  --config .statechart.config.ts \
  --validate
```

From this repository, use `npm run extract`, `npm run extract:watch`, or `npm run extract:validate`.

There are no direct CLI flags for hierarchical or parallel structure; put those definitions in a TypeScript or JSON configuration file. The single-machine `--input` form creates a flat configuration.

## Programmatic extraction

Use `extractMachine` when you need control over source discovery:

```ts
import { Project } from 'ts-morph';
import {
  extractMachine,
  type MachineConfig,
} from '@doeixd/machine/extract';

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
const machineConfig: MachineConfig = {
  input: 'src/editor-machine.ts',
  id: 'editor',
  parallel: {
    regions: [{
      name: 'fontWeight',
      initialState: 'Normal',
      classes: ['Normal', 'Bold'],
    }],
  },
};

const chart = extractMachine(machineConfig, project);
```

The supplied `Project` must already contain the configured input file. `extractMachines(config)` is a convenience for the repository’s conventional `src/**/*.ts` and `examples/**/*.ts` layout; use `extractMachine` with your own project when sources live elsewhere.

## Troubleshooting

### A class is missing

Class names are case-sensitive and must appear in the configured input file. A class omitted from `classes` is omitted from the generated statechart even if another transition targets it.

### A nested group appears under the wrong state

The current hierarchy configuration always attaches `children` to the top-level `initialState`. It cannot select a different parent. Restructure the chart configuration or post-process the generated data when you need a deeper hierarchy.

### A parallel chart has no top-level `initial`

That is expected. A parallel root uses `type: "parallel"`; each region supplies its own `initial` value.

### Validation succeeds but the model is still wrong

Schema validation checks output structure. It does not prove that transition targets exist, that class lists are complete, or that runtime behavior matches annotations. Review extractor warnings and test important generated charts as build artifacts.
