/**
 * @file Static Statechart Extractor for @doeixd/machine
 * @description
 * This build-time script uses the TypeScript Compiler API via `ts-morph` to analyze
 * your machine source code. It reads the "type-level metadata" encoded by the
 * primitives (`transitionTo`, `guarded`, etc.) and generates a formal, JSON-serializable
 * statechart definition compatible with tools like Stately Viz.
 *
 * This script does NOT execute your code. It performs a purely static analysis of the types.
 *
 * @usage
 * 1. Ensure you have `ts-node` and `ts-morph` installed: `npm install -D ts-node ts-morph`
 * 2. Configure the settings in the `generateChart` function below.
 * 3. Run the script from your project root: `npx ts-node ./scripts/extract.ts > chart.json`
 */

import { Project, ts, Type, Symbol as TSSymbol, Node } from 'ts-morph';
import { META_KEY } from './primitives';

// =============================================================================
// SECTION: CORE ANALYSIS LOGIC
// =============================================================================

/**
 * Recursively traverses a `ts-morph` Type object and serializes it into a
 * plain JSON-compatible value. It's smart enough to resolve class constructor
 * types into their string names.
 *
 * @param type - The `ts-morph` Type object to serialize.
 * @returns A JSON-compatible value (string, number, object, array).
 */
function typeToJson(type: Type): any {
  // --- Terminal Types ---
  const symbol = type.getSymbol();
  if (symbol && symbol.getDeclarations().some(Node.isClassDeclaration)) {
    return symbol.getName(); // Resolve class types to their string name
  }
  if (type.isStringLiteral()) return type.getLiteralValue();
  if (type.isNumberLiteral()) return type.getLiteralValue();
  if (type.isBooleanLiteral()) return type.getLiteralValue();

  // --- Recursive Types ---
  if (type.isArray()) {
    const elementType = type.getArrayElementTypeOrThrow();
    return [typeToJson(elementType)]; // Note: Assumes homogenous array for simplicity
  }
  if (type.isObject()) {
    const obj: { [key: string]: any } = {};
    for (const prop of type.getProperties()) {
      const declaration = prop.getValueDeclaration();
      if (!declaration) continue;
      obj[prop.getName()] = typeToJson(declaration.getType());
    }
    return obj;
  }

  return 'unknown'; // Fallback for unhandled types
}

/**
 * Given a type, this function looks for our special `META_KEY` brand and,
 * if found, extracts and serializes the metadata type into a plain object.
 *
 * @param type - The type of a class member (e.g., a transition method).
 * @returns The extracted metadata object, or `null` if no metadata is found.
 */
function extractMetaFromType(type: Type): any | null {
  // The META_KEY is escaped because it's a unique symbol, not a plain string property.
  const escapedKey = String(ts.escapeLeadingUnderscores(META_KEY.description!));
  const metaProperty = type.getProperty(escapedKey);
  if (!metaProperty) return null;

  const declaration = metaProperty.getValueDeclaration();
  if (!declaration) return null;

  return typeToJson(declaration.getType());
}

/**
 * Analyzes a single class symbol to find all annotated transitions and effects,
 * building a state node definition for the final statechart.
 *
 * @param classSymbol - The `ts-morph` Symbol for the class to analyze.
 * @returns A state node object (e.g., `{ on: {...}, invoke: [...] }`).
 */
function analyzeStateNode(classSymbol: TSSymbol): object {
  const chartNode: any = { on: {} };
  const classDeclaration = classSymbol.getDeclarations()[0];
  if (!classDeclaration || !Node.isClassDeclaration(classDeclaration)) {
    return chartNode;
  }

  for (const member of classDeclaration.getInstanceMembers()) {
    const meta = extractMetaFromType(member.getType());
    if (!meta) continue;

    // Separate `invoke` metadata from standard `on` transitions, as it's a
    // special property of a state node in XState/Stately syntax.
    const { invoke, ...onEntry } = meta;

    if (invoke) {
      if (!chartNode.invoke) chartNode.invoke = [];
      chartNode.invoke.push({
        src: invoke.src,
        onDone: { target: invoke.onDone },
        onError: { target: invoke.onError },
        description: invoke.description,
      });
    }

    // If there's a target, it's a standard event transition.
    if (onEntry.target) {
      if (onEntry.guards) {
        // Stately/XState syntax for guards is the `cond` property.
        onEntry.cond = onEntry.guards.map((g: any) => g.name).join(' && ');
      }
      chartNode.on[member.getName()] = onEntry;
    }
  }

  return chartNode;
}

// =============================================================================
// SECTION: MAIN ORCHESTRATOR
// =============================================================================

/**
 * The main analysis function.
 * Configures the project, specifies which files and classes to analyze,
 * and orchestrates the generation of the final JSON chart to standard output.
 */
export function generateChart() {
  // --- 🎨 CONFIGURATION 🎨 ---
  // Adjust these settings to match your project structure.

  /** The relative path to the file containing your machine class definitions. */
  const sourceFilePath = "src/authMachine.ts";

  /** An array of the string names of all classes that represent a state. */
  const classesToAnalyze = [
    "LoggedOutMachine",
    "LoggedInMachine",
  ];

  /** The top-level ID for your statechart. */
  const chartId = "auth";

  /** The string name of the class that represents the initial state. */
  const initialState = "LoggedOutMachine";

  // --- End Configuration ---

  console.error("🔍 Analyzing state machine from:", sourceFilePath);

  const project = new Project();
  project.addSourceFilesAtPaths("src/**/*.ts");

  const sourceFile = project.getSourceFile(sourceFilePath);
  if (!sourceFile) {
    console.error(`❌ Error: Source file not found at '${sourceFilePath}'.`);
    process.exit(1);
  }

  const fullChart: any = {
    id: chartId,
    initial: initialState,
    states: {},
  };

  for (const className of classesToAnalyze) {
    const classDeclaration = sourceFile.getClass(className);
    if (!classDeclaration) {
      console.warn(`⚠️ Warning: Class '${className}' not found in '${sourceFilePath}'. Skipping.`);
      continue;
    }
    const classSymbol = classDeclaration.getSymbolOrThrow();
    const stateNode = analyzeStateNode(classSymbol);
    fullChart.states[className] = stateNode;
  }

  console.error("✅ Analysis complete. Generating JSON chart...");
  // Print the final JSON to stdout so it can be piped to a file.
  console.log(JSON.stringify(fullChart, null, 2));
}

// This allows the script to be executed directly from the command line.
if (require.main === module) {
  generateChart();
}