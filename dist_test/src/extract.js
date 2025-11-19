"use strict";
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
 * 2. Create a configuration object or use .statechart.config.ts
 * 3. Run the script from your project root: `npx ts-node ./scripts/extract-statechart.ts`
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADVANCED_CONFIG_EXAMPLES = void 0;
exports.extractMachine = extractMachine;
exports.extractMachines = extractMachines;
exports.generateChart = generateChart;
const ts_morph_1 = require("ts-morph");
// =============================================================================
// SECTION: CORE ANALYSIS LOGIC
// =============================================================================
/**
 * Recursively traverses a `ts-morph` Type object and serializes it into a
 * plain JSON-compatible value. It's smart enough to resolve class constructor
 * types into their string names.
 *
 * Note: This function is kept for future extensibility but is not currently used
 * as the AST-based extraction approach (via extractFromCallExpression) is preferred.
 *
 * @param type - The `ts-morph` Type object to serialize.
 * @param verbose - Enable debug logging
 * @returns A JSON-compatible value (string, number, object, array).
 * @internal
 */
// @ts-expect-error - verbose parameter is used but TypeScript doesn't detect it
function _typeToJson(type, verbose = false) {
    // --- Terminal Types ---
    const symbol = type.getSymbol();
    if (symbol && symbol.getDeclarations().some(ts_morph_1.Node.isClassDeclaration)) {
        return symbol.getName(); // Resolve class types to their string name
    }
    if (type.isStringLiteral())
        return type.getLiteralValue();
    if (type.isNumberLiteral())
        return type.getLiteralValue();
    if (type.isBooleanLiteral())
        return type.getLiteralValue();
    if (type.isString())
        return 'string';
    if (type.isNumber())
        return 'number';
    if (type.isBoolean())
        return 'boolean';
    // --- Recursive Types ---
    if (type.isArray()) {
        const elementType = type.getArrayElementTypeOrThrow();
        return [_typeToJson(elementType, verbose)];
    }
    // --- Object Types ---
    if (type.isObject() || type.isIntersection()) {
        const obj = {};
        const properties = type.getProperties();
        // Filter out symbol properties and internal properties
        for (const prop of properties) {
            const propName = prop.getName();
            // Skip symbol properties (those starting with "__@")
            if (propName.startsWith('__@'))
                continue;
            const declaration = prop.getValueDeclaration();
            if (!declaration)
                continue;
            try {
                obj[propName] = _typeToJson(declaration.getType(), verbose);
            }
            catch (e) {
                if (verbose)
                    console.error(`      Warning: Failed to serialize property ${propName}:`, e);
                obj[propName] = 'unknown';
            }
        }
        // If we got an empty object, return null (no metadata)
        return Object.keys(obj).length > 0 ? obj : null;
    }
    if (verbose) {
        console.error(`      Unhandled type: ${type.getText()}`);
    }
    return 'unknown'; // Fallback for unhandled types
}
// =============================================================================
// SECTION: AST-BASED METADATA EXTRACTION
// =============================================================================
/**
 * Resolves a class name from an AST node (handles identifiers and typeof expressions)
 */
function resolveClassName(node) {
    // Handle: LoggingInMachine
    if (ts_morph_1.Node.isIdentifier(node)) {
        return node.getText();
    }
    // Handle: typeof LoggingInMachine
    if (ts_morph_1.Node.isTypeOfExpression(node)) {
        return node.getExpression().getText();
    }
    return 'unknown';
}
/**
 * Parses an object literal expression into a plain JavaScript object
 */
function parseObjectLiteral(obj) {
    if (!ts_morph_1.Node.isObjectLiteralExpression(obj)) {
        return {};
    }
    const result = {};
    for (const prop of obj.getProperties()) {
        if (ts_morph_1.Node.isPropertyAssignment(prop)) {
            const name = prop.getName();
            const init = prop.getInitializer();
            if (init) {
                if (ts_morph_1.Node.isStringLiteral(init)) {
                    result[name] = init.getLiteralValue();
                }
                else if (ts_morph_1.Node.isNumericLiteral(init)) {
                    result[name] = init.getLiteralValue();
                }
                else if (init.getText() === 'true' || init.getText() === 'false') {
                    result[name] = init.getText() === 'true';
                }
                else if (ts_morph_1.Node.isIdentifier(init)) {
                    result[name] = init.getText();
                }
                else if (ts_morph_1.Node.isObjectLiteralExpression(init)) {
                    result[name] = parseObjectLiteral(init);
                }
                else if (ts_morph_1.Node.isArrayLiteralExpression(init)) {
                    result[name] = init.getElements().map(el => {
                        if (ts_morph_1.Node.isObjectLiteralExpression(el)) {
                            return parseObjectLiteral(el);
                        }
                        return el.getText();
                    });
                }
            }
        }
    }
    return result;
}
/**
 * Parses an invoke service configuration, resolving class names for onDone/onError
 */
function parseInvokeService(obj) {
    if (!ts_morph_1.Node.isObjectLiteralExpression(obj)) {
        return {};
    }
    const service = {};
    for (const prop of obj.getProperties()) {
        if (ts_morph_1.Node.isPropertyAssignment(prop)) {
            const name = prop.getName();
            const init = prop.getInitializer();
            if (!init)
                continue;
            if (name === 'onDone' || name === 'onError') {
                // Resolve class names for state targets
                service[name] = resolveClassName(init);
            }
            else if (ts_morph_1.Node.isStringLiteral(init)) {
                service[name] = init.getLiteralValue();
            }
            else if (ts_morph_1.Node.isIdentifier(init)) {
                service[name] = init.getText();
            }
        }
    }
    return service;
}
/**
 * Recursively extracts metadata from a call expression chain
 * Handles nested DSL primitive calls like: describe(text, guarded(guard, transitionTo(...)))
 */
function extractFromCallExpression(call, verbose = false) {
    if (!ts_morph_1.Node.isCallExpression(call)) {
        return null;
    }
    const expression = call.getExpression();
    const fnName = ts_morph_1.Node.isIdentifier(expression) ? expression.getText() : null;
    if (!fnName) {
        return null;
    }
    const metadata = {};
    const args = call.getArguments();
    switch (fnName) {
        case 'transitionTo':
            // Args: (target, implementation)
            if (args[0]) {
                metadata.target = resolveClassName(args[0]);
            }
            // The second argument might be another call expression, but we don't recurse there
            // because transitionTo is the innermost wrapper
            break;
        case 'describe':
            // Args: (description, transition)
            if (args[0] && ts_morph_1.Node.isStringLiteral(args[0])) {
                metadata.description = args[0].getLiteralValue();
            }
            // Recurse into wrapped transition
            if (args[1] && ts_morph_1.Node.isCallExpression(args[1])) {
                const nested = extractFromCallExpression(args[1], verbose);
                if (nested) {
                    Object.assign(metadata, nested);
                }
            }
            break;
        case 'guarded':
            // Args: (guard, transition)
            if (args[0]) {
                const guard = parseObjectLiteral(args[0]);
                if (Object.keys(guard).length > 0) {
                    metadata.guards = [guard];
                }
            }
            // Recurse into wrapped transition
            if (args[1] && ts_morph_1.Node.isCallExpression(args[1])) {
                const nested = extractFromCallExpression(args[1], verbose);
                if (nested) {
                    Object.assign(metadata, nested);
                }
            }
            break;
        case 'invoke':
            // Args: (service, implementation)
            if (args[0]) {
                const service = parseInvokeService(args[0]);
                if (Object.keys(service).length > 0) {
                    metadata.invoke = service;
                }
            }
            break;
        case 'action':
            // Args: (action, transition)
            if (args[0]) {
                const actionMeta = parseObjectLiteral(args[0]);
                if (Object.keys(actionMeta).length > 0) {
                    metadata.actions = [actionMeta];
                }
            }
            // Recurse into wrapped transition
            if (args[1] && ts_morph_1.Node.isCallExpression(args[1])) {
                const nested = extractFromCallExpression(args[1], verbose);
                if (nested) {
                    Object.assign(metadata, nested);
                }
            }
            break;
        case 'guard':
            // Args: (condition, transition, options?)
            // Extract description from options object (third argument)
            if (args[2]) {
                const options = parseObjectLiteral(args[2]);
                if (options.description) {
                    metadata.description = options.description;
                }
            }
            // Add a generic guard condition for static analysis
            metadata.guards = [{ name: 'runtime_guard', description: metadata.description || 'Synchronous condition check' }];
            // Recurse into the transition (second argument)
            if (args[1] && ts_morph_1.Node.isCallExpression(args[1])) {
                const nested = extractFromCallExpression(args[1], verbose);
                if (nested) {
                    Object.assign(metadata, nested);
                }
            }
            break;
        case 'guardAsync':
            // Args: (condition, transition, options?)
            // Extract description from options object (third argument)
            if (args[2]) {
                const options = parseObjectLiteral(args[2]);
                if (options.description) {
                    metadata.description = options.description;
                }
            }
            // Add a generic guard condition for static analysis
            metadata.guards = [{ name: 'runtime_guard_async', description: metadata.description || 'Asynchronous condition check' }];
            // Recurse into the transition (second argument)
            if (args[1] && ts_morph_1.Node.isCallExpression(args[1])) {
                const nested = extractFromCallExpression(args[1], verbose);
                if (nested) {
                    Object.assign(metadata, nested);
                }
            }
            break;
        default:
            // Not a DSL primitive we recognize
            return null;
    }
    return Object.keys(metadata).length > 0 ? metadata : null;
}
/**
 * Extracts metadata by parsing the AST of DSL primitive calls.
 * This is the new approach that solves the generic type parameter resolution problem.
 *
 * @param member - The class member (property declaration) to analyze
 * @param verbose - Enable debug logging
 * @returns The extracted metadata object, or `null` if no metadata is found.
 */
function extractMetaFromMember(member, verbose = false) {
    // Only process property declarations (methods with initializers)
    if (!ts_morph_1.Node.isPropertyDeclaration(member)) {
        if (verbose)
            console.error(`      ⚠️ Not a property declaration`);
        return null;
    }
    const initializer = member.getInitializer();
    if (!initializer) {
        if (verbose)
            console.error(`      ⚠️ No initializer`);
        return null;
    }
    // Check if it's a call expression (DSL primitive call)
    if (!ts_morph_1.Node.isCallExpression(initializer)) {
        if (verbose)
            console.error(`      ⚠️ Initializer is not a call expression`);
        return null;
    }
    // Extract metadata by parsing the call chain
    const metadata = extractFromCallExpression(initializer, verbose);
    if (metadata && verbose) {
        console.error(`      ✅ Extracted metadata:`, JSON.stringify(metadata, null, 2));
    }
    return metadata;
}
/**
 * Analyzes a single class symbol to find all annotated transitions and effects,
 * building a state node definition for the final statechart.
 *
 * @param classSymbol - The `ts-morph` Symbol for the class to analyze.
 * @param verbose - Enable verbose logging
 * @returns A state node object (e.g., `{ on: {...}, invoke: [...] }`).
 */
function analyzeStateNode(classSymbol, verbose = false) {
    const chartNode = { on: {} };
    const classDeclaration = classSymbol.getDeclarations()[0];
    if (!classDeclaration || !ts_morph_1.Node.isClassDeclaration(classDeclaration)) {
        if (verbose) {
            console.error(`⚠️ Warning: Could not get class declaration for ${classSymbol.getName()}`);
        }
        return chartNode;
    }
    const className = classSymbol.getName();
    if (verbose) {
        console.error(`  Analyzing state: ${className}`);
    }
    for (const member of classDeclaration.getInstanceMembers()) {
        const memberName = member.getName();
        if (verbose) {
            console.error(`    Checking member: ${memberName}`);
        }
        // NEW: Use AST-based extraction instead of type-based
        const meta = extractMetaFromMember(member, verbose);
        if (!meta)
            continue;
        if (verbose) {
            console.error(`    Found transition: ${memberName}`);
        }
        // Separate `invoke` metadata from standard `on` transitions, as it's a
        // special property of a state node in XState/Stately syntax.
        const { invoke, actions, guards, ...onEntry } = meta;
        if (invoke) {
            if (!chartNode.invoke)
                chartNode.invoke = [];
            chartNode.invoke.push({
                src: invoke.src,
                onDone: { target: invoke.onDone },
                onError: { target: invoke.onError },
                description: invoke.description,
            });
            if (verbose) {
                console.error(`      → Invoke: ${invoke.src}`);
            }
        }
        // If there's a target, it's a standard event transition.
        if (onEntry.target) {
            const transition = { target: onEntry.target };
            // Add description if present
            if (onEntry.description) {
                transition.description = onEntry.description;
            }
            // Add guards as 'cond' property
            if (guards) {
                transition.cond = guards.map((g) => g.name).join(' && ');
                if (verbose) {
                    console.error(`      → Guard: ${transition.cond}`);
                }
            }
            // Add actions array
            if (actions && actions.length > 0) {
                transition.actions = actions.map((a) => a.name);
                if (verbose) {
                    console.error(`      → Actions: ${transition.actions.join(', ')}`);
                }
            }
            chartNode.on[memberName] = transition;
            if (verbose) {
                console.error(`      → Target: ${onEntry.target}`);
            }
        }
    }
    return chartNode;
}
// =============================================================================
// SECTION: MAIN ORCHESTRATOR
// =============================================================================
/**
 * Helper function to analyze a state node with optional nesting support
 */
function analyzeStateNodeWithNesting(className, classSymbol, sourceFile, childConfig, verbose = false) {
    const stateNode = analyzeStateNode(classSymbol, verbose);
    // If this state has children, analyze them recursively
    if (childConfig) {
        if (verbose) {
            console.error(`  👪 Analyzing children for state: ${className}`);
        }
        stateNode.initial = childConfig.initialState;
        stateNode.states = {};
        // Recursively analyze each child state
        for (const childClassName of childConfig.classes) {
            const childClassDeclaration = sourceFile.getClass(childClassName);
            if (childClassDeclaration) {
                const childSymbol = childClassDeclaration.getSymbolOrThrow();
                stateNode.states[childClassName] = analyzeStateNode(childSymbol, verbose);
            }
            else {
                console.warn(`⚠️ Warning: Child class '${childClassName}' not found.`);
            }
        }
    }
    return stateNode;
}
/**
 * Extracts a single machine configuration to a statechart
 *
 * @param config - Machine configuration
 * @param project - ts-morph Project instance
 * @param verbose - Enable verbose logging
 * @returns The generated statechart object
 */
function extractMachine(config, project, verbose = false) {
    if (verbose) {
        console.error(`\n🔍 Analyzing machine: ${config.id}`);
        console.error(`  Source: ${config.input}`);
    }
    const sourceFile = project.getSourceFile(config.input);
    if (!sourceFile) {
        throw new Error(`Source file not found: ${config.input}`);
    }
    // Handle parallel machine configuration
    if (config.parallel) {
        if (verbose) {
            console.error(`  ⏹️ Parallel machine detected. Analyzing regions.`);
        }
        const parallelChart = {
            id: config.id,
            type: 'parallel',
            states: {},
        };
        if (config.description) {
            parallelChart.description = config.description;
        }
        for (const region of config.parallel.regions) {
            if (verbose) {
                console.error(`    📍 Analyzing region: ${region.name}`);
            }
            const regionStates = {};
            for (const className of region.classes) {
                const classDeclaration = sourceFile.getClass(className);
                if (classDeclaration) {
                    const classSymbol = classDeclaration.getSymbolOrThrow();
                    regionStates[className] = analyzeStateNode(classSymbol, verbose);
                }
                else {
                    console.warn(`⚠️ Warning: Class '${className}' not found for region '${region.name}'.`);
                }
            }
            parallelChart.states[region.name] = {
                initial: region.initialState,
                states: regionStates,
            };
        }
        if (verbose) {
            console.error(`  ✅ Extracted ${config.parallel.regions.length} parallel regions`);
        }
        return parallelChart;
    }
    // Handle standard FSM configuration
    if (!config.initialState || !config.classes) {
        throw new Error(`Machine config for '${config.id}' must have either 'parallel' or 'initialState'/'classes'.`);
    }
    const fullChart = {
        id: config.id,
        initial: config.initialState,
        states: {},
    };
    if (config.description) {
        fullChart.description = config.description;
    }
    for (const className of config.classes) {
        const classDeclaration = sourceFile.getClass(className);
        if (!classDeclaration) {
            console.warn(`⚠️ Warning: Class '${className}' not found in '${config.input}'. Skipping.`);
            continue;
        }
        const classSymbol = classDeclaration.getSymbolOrThrow();
        // Check if this is the initial state and has children configuration
        const hasChildren = className === config.initialState && config.children;
        const stateNode = analyzeStateNodeWithNesting(className, classSymbol, sourceFile, hasChildren ? config.children : undefined, verbose);
        fullChart.states[className] = stateNode;
    }
    if (verbose) {
        console.error(`  ✅ Extracted ${config.classes.length} states`);
    }
    return fullChart;
}
/**
 * Extracts multiple machines based on configuration
 *
 * @param config - Full extraction configuration
 * @returns Array of generated statecharts
 */
function extractMachines(config) {
    var _a;
    const verbose = (_a = config.verbose) !== null && _a !== void 0 ? _a : false;
    if (verbose) {
        console.error(`\n📊 Starting statechart extraction`);
        console.error(`  Machines to extract: ${config.machines.length}`);
    }
    const project = new ts_morph_1.Project();
    project.addSourceFilesAtPaths("src/**/*.ts");
    project.addSourceFilesAtPaths("examples/**/*.ts");
    const results = [];
    for (const machineConfig of config.machines) {
        try {
            const chart = extractMachine(machineConfig, project, verbose);
            results.push(chart);
        }
        catch (error) {
            console.error(`❌ Error extracting machine '${machineConfig.id}':`, error);
            if (!verbose) {
                console.error(`   Run with --verbose for more details`);
            }
        }
    }
    if (verbose) {
        console.error(`\n✅ Extraction complete: ${results.length}/${config.machines.length} machines extracted`);
    }
    return results;
}
/**
 * Legacy function for backwards compatibility
 * Extracts a single hardcoded machine configuration
 * @deprecated Use extractMachine or extractMachines instead
 */
function generateChart() {
    // --- 🎨 CONFIGURATION 🎨 ---
    // Adjust these settings to match your project structure.
    const config = {
        input: "examples/authMachine.ts",
        classes: [
            "LoggedOutMachine",
            "LoggingInMachine",
            "LoggedInMachine",
            "SessionExpiredMachine",
            "ErrorMachine"
        ],
        id: "auth",
        initialState: "LoggedOutMachine",
        description: "Authentication state machine"
    };
    // --- End Configuration ---
    console.error("🔍 Using legacy generateChart function");
    console.error("⚠️ Consider using extractMachines() with a config file instead\n");
    const project = new ts_morph_1.Project();
    project.addSourceFilesAtPaths("src/**/*.ts");
    project.addSourceFilesAtPaths("examples/**/*.ts");
    try {
        const chart = extractMachine(config, project, true);
        console.log(JSON.stringify(chart, null, 2));
    }
    catch (error) {
        console.error(`❌ Error:`, error);
        process.exit(1);
    }
}
/**
 * Example configuration demonstrating hierarchical and parallel machines.
 * This is not used by default but serves as documentation.
 */
exports.ADVANCED_CONFIG_EXAMPLES = {
    hierarchical: {
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
    parallel: {
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
};
// This allows the script to be executed directly from the command line.
if (require.main === module) {
    generateChart();
}
