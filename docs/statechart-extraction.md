# Statechart extraction

The extractor turns annotated class-based machines into XState-compatible JSON. It is a build-time tool; it does not interpret or execute the machine.

## What is supported

- Class declarations listed explicitly in configuration.
- Transition metadata expressed with `transitionTo`, `describe`, `guard`, `guardSync`, `guardAsync`, `guarded`, `action`, `invoke`, and `metadata`.
- Direct nested annotations and curried annotations composed with `pipe`.
- Literal strings and object literals that can be read from the TypeScript AST.
- Flat, hierarchical, and parallel output configuration.
- JSON, Mermaid, or both output formats.
- JSON Schema validation through AJV.

Functional machines are not statically extracted. Computed metadata values and arbitrary runtime expressions cannot be resolved from source syntax.

## Configuration

Create `.statechart.config.ts`:

```ts
import type { ExtractionConfig } from '@doeixd/machine/extract';

const config: ExtractionConfig = {
  machines: [
    {
      input: 'src/auth-machine.ts',
      classes: ['LoggedOut', 'LoggingIn', 'LoggedIn'],
      output: 'statecharts/auth.json',
      id: 'auth',
      initialState: 'LoggedOut',
      description: 'Authentication flow',
    },
  ],
  validate: true,
  format: 'json',
  verbose: false,
  watch: false,
};

export default config;
```

Paths are resolved from the current working directory.

For nested states or orthogonal regions, see [hierarchical and parallel extraction](ADVANCED_EXTRACTION.md). Those options change the generated chart layout; they do not create runtime composition behavior.

## Annotating transitions

```ts
import {
  MachineBase,
  action,
  describe,
  guard,
  pipe,
  transitionTo,
} from '@doeixd/machine';

class Idle extends MachineBase<{ status: 'idle' }> {
  start = describe(
    'Begin the request',
    action(
      { name: 'recordStart' },
      transitionTo(Loading, () => new Loading()),
    ),
  );
}

class Loading extends MachineBase<{ status: 'loading' }> {}
```

The same transition can be written as a left-to-right pipeline:

```ts
class Idle extends MachineBase<{ status: 'idle' }> {
  start = pipe(
    () => new Loading(),
    transitionTo(Loading),
    action({ name: 'recordStart' }),
    describe('Begin the request'),
  );
}
```

The wrappers attach non-enumerable runtime metadata. The static extractor separately parses the wrapper calls from the AST. Keep metadata arguments literal when static output is required.

## CLI

Inside this repository:

```bash
npm run extract
npm run extract:watch
npm run extract:validate
```

From an installed package:

```bash
npx --package @doeixd/machine extract --config .statechart.config.ts
```

Direct single-machine invocation:

```bash
npx --package @doeixd/machine extract \
  --input src/auth-machine.ts \
  --id auth \
  --classes LoggedOut,LoggingIn,LoggedIn \
  --initial LoggedOut \
  --output statecharts/auth.json \
  --validate
```

Options:

| Option | Meaning |
| --- | --- |
| `--config <file>` | TypeScript or JSON configuration file |
| `--input <file>` | Single source file; overrides configured machines |
| `--id <id>` | Required with `--input` |
| `--classes <names>` | Comma-separated classes required with `--input` |
| `--initial <name>` | Initial class required with `--input` |
| `--output <file>` | Output path |
| `--format json\|mermaid\|both` | Output format |
| `--validate` | Validate JSON against the bundled schema |
| `--watch` | Re-extract after source or config changes |
| `--verbose` | Print AST analysis details |

CLI flags override corresponding configuration values when supplied. Omitting a flag does not disable a value enabled in the config file.

For `format: 'both'`, an output such as `auth.json` produces `auth.json` and `auth.mmd`.

## Programmatic API

```ts
import { Project } from 'ts-morph';
import { extractMachine, extractMachines } from '@doeixd/machine/extract';

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });

const chart = extractMachine({
  input: 'src/auth-machine.ts',
  classes: ['LoggedOut', 'LoggedIn'],
  id: 'auth',
  initialState: 'LoggedOut',
}, project);
```

Use `extractMachines(config)` for the conventional `src/**/*.ts` and `examples/**/*.ts` layout used by this repository. For another source layout, create a `Project` containing your inputs and call `extractMachine` for each configuration.

## Runtime extraction

The main entry also exports runtime metadata helpers from `runtime-extract.ts`:

- `extractFunctionMetadata(fn)`;
- `extractStateNode(instance)`;
- `generateStatechart(states, config)`;
- `extractFromInstance(instance, config)`.

Runtime extraction can observe computed values because annotations have already executed. Static extraction is better suited to CI and documentation because it does not run application code.

## Validation

When validation is enabled, every generated chart is checked against `schemas/xstate-schema.json`. Validation errors include their JSON instance path and cause the CLI to exit unsuccessfully before output is written.

The bundled schema checks structural compatibility. It does not prove that target names exist, guards are semantically correct, or application code is safe.

## Known limitations

- Static extraction is class-oriented.
- The `extractMachines` convenience currently discovers source files under `src` and `examples`; use a custom `Project` with `extractMachine` for other layouts.
- Metadata implementations are not serialized, only their declared names and descriptions.
- Complex computed syntax may be ignored.
- Mermaid generation currently covers event transitions and does not fully render every hierarchical or invoked-service detail.
