 <todo>
  Todos
  ☒ Install required dependencies (commander, chokidar, ajv, chalk, tsx)
  ☒ Create authMachine.ts example with all primitives
  ☒ Create fetchMachine.ts example
  ☐ Create formMachine.ts and trafficLightMachine.ts examples
  ☐ Add metadata() wrapper to primitives.ts
  ☐ Enhance extract.ts to support all machine patterns
  ☐ Create CLI tool (scripts/extract-statechart.ts)
  ☐ Create .statechart.config.ts configuration file
  ☐ Add XState JSON schema for validation
  ☐ Add extraction tests
  ☐ Update package.json with scripts
  ☐ Export primitives from src/index.ts
  ☐ Update documentation (README, CLAUDE.md, docs/extraction.md)
  ☐ Test end-to-end extraction and validate in Stately Viz
 </todo>

<plan>
 ⎿  Plan: Production-Ready XState Statechart Generation System

     Overview

     Enhance the existing src/extract.ts into a comprehensive, production-ready statechart extraction tool that
     supports all machine patterns (class-based, functional, type-state) with full CLI tooling, build integration,
     and comprehensive examples.

     1. Core Extraction Enhancement (src/extract.ts)

     Support Multiple Machine Patterns:

     - Class-based (already works): Machines extending MachineBase
     - Functional: Machines created with createMachine() - extract from variable declarations
     - Type-State: Discriminated union types - extract from type definitions + metadata wrappers
     - Add metadata<T>(meta: Metadata) wrapper function for flexible annotation

     Improvements:

     - Make fully configurable (accept config object instead of hardcoded values)
     - Add support for multiple machines in one extraction
     - Better error handling and validation
     - Support nested states and parallel states
     - Extract all metadata: guards, actions, invoke, descriptions

     2. CLI Tool (scripts/extract-statechart.ts)

     Create comprehensive CLI with:
     - Arguments: --input <file>, --output <file>, --config <file>, --watch, --format <json|mermaid|both>
     - Config file support: .statechart.config.ts or statechart.config.json
     - Watch mode: Auto-regenerate on file changes
     - Validation: Validate output against XState JSON schema
     - Pretty output: Formatted JSON, progress indicators, error messages

     3. Example Machines (examples/)

     Create comprehensive examples using all primitives:

     examples/authMachine.ts - Authentication Flow

     - States: LoggedOut, LoggingIn, LoggedIn, SessionExpired
     - Uses: transitionTo(), guarded(), describe(), invoke()
     - Demonstrates: Async operations, guards, error handling

     examples/fetchMachine.ts - Data Fetching

     - States: Idle, Loading, Success, Error, Retrying
     - Uses: All primitives including action()
     - Demonstrates: Retry logic, loading states, error recovery

     examples/formMachine.ts - Multi-step Form

     - States: Step1, Step2, Step3, Complete, ValidationError
     - Demonstrates: Sequential flow, validation, state accumulation

     examples/trafficLightMachine.ts - Simple FSM

     - States: Red, Yellow, Green
     - Demonstrates: Basic transitions, timer-based flow

     4. Metadata Wrapper (src/primitives.ts)

     Add flexible metadata() function:
     export function metadata<T>(meta: Partial<TransitionMeta>, value: T): T {
       // Attach metadata to value for extraction
       return value;
     }

     Allows usage like:
     const machine = metadata({
       states: ['idle', 'loading', 'success'],
       transitions: { fetch: { from: 'idle', to: 'loading' } }
     }, createMachine(...))

     5. Package.json Integration

     Add scripts:
     - "extract": "tsx scripts/extract-statechart.ts" - Run extraction
     - "extract:watch": "tsx scripts/extract-statechart.ts --watch" - Watch mode
     - "extract:validate": "tsx scripts/extract-statechart.ts --validate" - Validate only
     - "build": "... && npm run extract" - Auto-generate during build

     Add dependencies:
     - commander - CLI framework
     - chokidar - File watching
     - ajv - JSON schema validation
     - chalk - Colored output

     6. Configuration System

     Create .statechart.config.ts:
     export default {
       machines: [
         {
           input: 'examples/authMachine.ts',
           classes: ['LoggedOut', 'LoggedIn'],
           output: 'statecharts/auth.json',
           id: 'auth',
           initialState: 'LoggedOut'
         },
         // ... more machines
       ],
       validate: true,
       format: 'json',
       watch: false
     }

     7. Validation & Schema

     Create schemas/xstate-schema.json:
     - XState v5 JSON schema for validation
     - Validate generated output matches schema
     - Provide helpful error messages for mismatches

     8. Testing (test/extract.test.ts)

     Comprehensive tests for:
     - Class-based extraction
     - Functional machine extraction
     - Type-state extraction
     - Metadata extraction (all primitives)
     - Config file parsing
     - CLI argument parsing
     - Output validation
     - Error handling

     9. Documentation

     Update:
     - README.md: Add "Statechart Extraction" section with examples
     - CLAUDE.md: Update extraction documentation
     - Create docs/extraction.md: Comprehensive extraction guide
     - Add JSDoc to all extraction functions

     10. Build Integration

     Create Vite/Rollup/Webpack plugin (choose one):
     - Auto-run extraction during development
     - Trigger on file changes
     - Optional: emit as build artifact

     File Changes Required

     New Files:

     - scripts/extract-statechart.ts - Main CLI tool
     - examples/authMachine.ts - Auth example
     - examples/fetchMachine.ts - Fetch example
     - examples/formMachine.ts - Form example
     - examples/trafficLightMachine.ts - Simple example
     - .statechart.config.ts - Config file
     - schemas/xstate-schema.json - Validation schema
     - test/extract.test.ts - Extraction tests
     - docs/extraction.md - Documentation

     Modified Files:

     - src/extract.ts - Major enhancements
     - src/primitives.ts - Add metadata() wrapper
     - src/index.ts - Export primitives
     - package.json - Add scripts and dependencies
     - README.md - Add extraction section
     - CLAUDE.md - Update docs
     - tsconfig.json - Add scripts/ to include

     Generated Files (examples):

     - statecharts/auth.json
     - statecharts/fetch.json
     - statecharts/form.json
     - statecharts/trafficLight.json

     Success Criteria

     ✅ Can extract statecharts from all three machine patterns✅ CLI works with watch mode and validation✅ All
     examples generate valid XState JSON✅ Generated JSON works in Stately Viz editor✅ Comprehensive test
     coverage✅ Clear documentation and examples✅ Build integration with npm scripts

     Estimated Complexity

     - High complexity - This is a significant feature addition
     - Multiple file creations and modifications
     - New dependencies and build tooling
     - Comprehensive testing required

     Notes

     - The metadata() wrapper approach allows maximum flexibility for functional and type-state patterns
     - Full build integration makes this a production-grade tool
     - Examples serve as both documentation and test cases
     - Watch mode makes development iteration fast


</plan>
     <context>
Type-Level Metadata DSL
Relevant source files
Purpose and Scope
This document describes the Type-Level Metadata DSL provided by 
src/primitives.ts
 which enables compile-time annotation of state machine transitions with formal semantics. The DSL consists of wrapper functions (transitionTo, guarded, invoke, action, describe) that brand transition methods with metadata at the type level while remaining identity functions at runtime.

This metadata serves two purposes:

Documentation: Types express guards, target states, and side effects directly in code
Static Analysis: Build-time tools can extract formal statecharts (see Static Analysis and Statechart Generation)
For information about creating and managing machines at runtime, see Creating Machines. For information about the static analysis tool that consumes this metadata, see Static Analysis and Statechart Generation.

Sources: 
src/primitives.ts
1-13

System Architecture
The Type-Level Metadata DSL operates in two distinct phases: compile-time type branding and runtime execution. At compile-time, TypeScript's type system preserves rich metadata about transitions. At runtime, the DSL functions are no-ops that return their arguments unchanged.


















Sources: 
src/primitives.ts
1-13
 
src/extract.ts
60-78

The META_KEY Branding System
The core mechanism for attaching metadata to types is the META_KEY symbol and the WithMeta<F, M> utility type. This system "brands" function types with an invisible metadata property that TypeScript tracks but JavaScript ignores.

META_KEY Symbol
The META_KEY is a unique symbol used as a property key to store metadata within a type:

// From src/primitives.ts:22
export const META_KEY = Symbol("MachineMeta");
This symbol serves as a type-level marker that the static analyzer searches for when extracting statecharts. Because it's a symbol, it doesn't conflict with any real properties and is invisible to runtime code.

Sources: 
src/primitives.ts
22

WithMeta<F, M> Type
The WithMeta type intersects a function type F with a hidden metadata object M:

// From src/primitives.ts:85-88
export type WithMeta<
  F extends (...args: any[]) => any,
  M extends TransitionMeta
> = F & { [META_KEY]: M };
This creates a new type that:

At runtime: Behaves identically to F (just a function)
At compile-time: Carries M as a hidden property accessible to type analysis tools
Diagram: Type Intersection Structure







Sources: 
src/primitives.ts
85-88

DSL Function Reference
Each DSL function serves as an annotation primitive that brands a function with specific metadata. All functions are identity functions at runtime—they return their input unchanged.

transitionTo()
Declares that a transition targets a specific state class.

Type Signature:

// From src/primitives.ts:105-113
function transitionTo<
  T extends ClassConstructor,
  F extends (...args: any[]) => any
>(
  _target: T,
  implementation: F
): WithMeta<F, { target: T }>
Parameter	Type	Purpose
_target	ClassConstructor	The class representing the target state (prefixed with _ because it's only used at type level)
implementation	F	The actual transition function that returns a machine instance
Returns	WithMeta<F, { target: T }>	The implementation branded with target metadata
Example Usage:

class LoggedOut extends MachineBase<{ status: "loggedOut" }> {
  login = transitionTo(
    LoggedIn,  // Type-level target
    (username: string) => new LoggedIn({ username })  // Runtime implementation
  );
}
Sources: 
src/primitives.ts
95-113
 
README.md
779-805

describe()
Adds human-readable documentation to a transition.

Type Signature:

// From src/primitives.ts:122-131
function describe<
  F extends (...args: any[]) => any,
  M extends TransitionMeta
>(
  _text: string,
  transition: WithMeta<F, M>
): WithMeta<F, M & { description: string }>
Parameter	Type	Purpose
_text	string	Documentation text describing the transition's purpose
transition	WithMeta<F, M>	A previously branded transition function
Returns	WithMeta<F, M & { description: string }>	The transition with added description metadata
Example Usage:

login = describe(
  "Authenticates the user and transitions to logged-in state",
  transitionTo(LoggedIn, (username: string) => new LoggedIn({ username }))
);
Sources: 
src/primitives.ts
116-131
 
README.md
783-789

guarded()
Annotates a transition with a guard condition that must be satisfied for the transition to be enabled. Note that this only adds metadata—the guard logic must still be implemented in your function.

Type Signature:

// From src/primitives.ts:142-150
function guarded<
  F extends (...args: any[]) => any,
  M extends TransitionMeta
>(
  guard: GuardMeta,
  transition: WithMeta<F, M>
): WithMeta<F, M & { guards: [typeof guard] }>
Parameter	Type	Purpose
guard	GuardMeta	Object with name and optional description
transition	WithMeta<F, M>	The transition to guard
Returns	WithMeta<F, M & { guards: [GuardMeta] }>	The transition with guard metadata
GuardMeta Interface:

// From src/primitives.ts:33-38
export interface GuardMeta {
  name: string;          // Guard identifier (e.g., "isAdmin")
  description?: string;  // Optional explanation
}
Example Usage:

deleteAccount = guarded(
  { name: "isAdmin", description: "Only admins can delete accounts" },
  transitionTo(Deleted, () => new Deleted())
);
Important: The guarded() function only records metadata. You must implement the actual guard check:

deleteAccount(userId: string) {
  if (!this.context.isAdmin) {
    throw new Error("Unauthorized");  // Implement the guard
  }
  return new Deleted();
}
Sources: 
src/primitives.ts
133-150
 
README.md
791-797

invoke()
Declares that a transition or state entry involves an asynchronous service (side effect). This is used to model async operations like API calls, database queries, or timers.

Type Signature:

// From src/primitives.ts:163-172
function invoke<
  D extends ClassConstructor,
  E extends ClassConstructor,
  F extends (...args: any[]) => any
>(
  service: { src: string; onDone: D; onError: E; description?: string },
  implementation: F
): WithMeta<F, { invoke: typeof service }>
Parameter	Type	Purpose
service.src	string	Service identifier (e.g., "fetchUserData")
service.onDone	ClassConstructor	Target state on success
service.onError	ClassConstructor	Target state on error
service.description	string?	Optional documentation
implementation	F	The async function implementation
Returns	WithMeta<F, { invoke: InvokeMeta }>	The implementation with invoke metadata
InvokeMeta Interface:

// From src/primitives.ts:43-52
export interface InvokeMeta {
  src: string;
  onDone: ClassConstructor;
  onError: ClassConstructor;
  description?: string;
}
Example Usage:

class Loading extends MachineBase<{ status: "loading" }> {
  fetchData = invoke(
    {
      src: "fetchUserData",
      onDone: Success,
      onError: Error,
      description: "Fetches user profile from API"
    },
    async (userId: string) => {
      try {
        const data = await api.getUser(userId);
        return new Success({ data });
      } catch (error) {
        return new Error({ error: error.message });
      }
    }
  );
}
Sources: 
src/primitives.ts
153-172
 
README.md
798-806

action()
Annotates a transition with a side-effect action—operations that don't change state structure but produce external effects (logging, analytics, event firing).

Type Signature:

// From src/primitives.ts:183-190
function action<
  F extends (...args: any[]) => any,
  M extends TransitionMeta
>(
  action: ActionMeta,
  transition: WithMeta<F, M>
): WithMeta<F, M & { actions: [typeof action] }>
Parameter	Type	Purpose
action	ActionMeta	Object with name and optional description
transition	WithMeta<F, M>	The transition to annotate
Returns	WithMeta<F, M & { actions: [ActionMeta] }>	The transition with action metadata
ActionMeta Interface:

// From src/primitives.ts:57-62
export interface ActionMeta {
  name: string;          // Action identifier (e.g., "logAnalytics")
  description?: string;  // Optional explanation
}
Example Usage:

submit = action(
  { name: "trackSubmission", description: "Log form submission to analytics" },
  transitionTo(Submitted, (formData) => {
    analytics.track("form_submit", formData);
    return new Submitted({ formData });
  })
);
Sources: 
src/primitives.ts
174-190

Complete Metadata Type Structure
All metadata is typed through the TransitionMeta interface, which aggregates all possible annotation types:

// From src/primitives.ts:67-78
export interface TransitionMeta {
  target?: ClassConstructor;      // Set by transitionTo()
  description?: string;            // Set by describe()
  guards?: GuardMeta[];           // Set by guarded()
  invoke?: InvokeMeta;            // Set by invoke()
  actions?: ActionMeta[];         // Set by action()
}
Metadata Composition Diagram:







Sources: 
src/primitives.ts
67-78

Runtime vs. Compile-Time Behavior
The DSL functions exhibit fundamentally different behavior depending on execution phase:

Behavior Comparison Table
Aspect	Compile-Time (TypeScript)	Runtime (JavaScript)
Function Execution	Never executed—types only	All DSL functions are identity: return input as any
Metadata Storage	Preserved in type signatures via WithMeta	Completely erased—no metadata objects exist
Type Checking	TypeScript validates metadata structure	No type checking
Analysis	ts-morph reads types from AST	Static analyzer (extract.ts) operates here
Overhead	Zero—types erased after compilation	Zero—DSL calls are inlined away
Purpose	Enable static analysis and documentation	Execute actual transition logic
Code Transformation Example
Source Code:

class Auth extends MachineBase<{ status: "idle" }> {
  login = describe(
    "User login",
    transitionTo(LoggedIn, (user: string) => new LoggedIn({ user }))
  );
}
Compile-Time Type (simplified):

// TypeScript sees:
login: WithMeta<
  (user: string) => LoggedIn,
  { target: LoggedIn, description: "User login" }
>
Runtime JavaScript Output:

// JavaScript executes:
class Auth {
  login(user) {
    return new LoggedIn({ user });  // DSL wrappers completely removed
  }
}
Sources: 
src/primitives.ts
105-190
 
README.md
779-805

Static Analysis Integration
The metadata encoded by the DSL is extracted by the static analysis tool defined in 
src/extract.ts
 The analysis flow operates entirely at build-time using ts-morph:

Key Static Analysis Functions
The extraction process uses these functions from 
src/extract.ts
:

typeToJson(type: Type) 
src/extract.ts
32-58

Recursively serializes ts-morph Type objects to JSON
Resolves ClassConstructor types to their string names
Handles string/number/boolean literals, arrays, and objects
extractMetaFromType(type: Type) 
src/extract.ts
67-77

Searches for the escaped META_KEY property in a type
Extracts and serializes the metadata object
Returns null if no metadata is found
analyzeStateNode(classSymbol: TSSymbol) 
src/extract.ts
86-122

Analyzes all instance members of a class
Separates invoke metadata (state-level) from on transitions (event-level)
Builds the state node object: { on: {...}, invoke: [...] }
Sources: 
src/extract.ts
1-190
 
README.md
777-816

Usage Patterns
Basic Transition Annotation
The simplest pattern is annotating a transition with its target state:

class Idle extends MachineBase<{ status: "idle" }> {
  start = transitionTo(
    Loading,
    () => new Loading({ status: "loading" })
  );
}
Sources: 
README.md
783-789

Composing Multiple Annotations
DSL functions compose through nesting. Each wrapper adds metadata to the previous layer:

class Admin extends MachineBase<{ role: "admin" }> {
  deleteUser = describe(
    "Permanently removes a user from the system",
    guarded(
      { name: "hasPermission", description: "User must have DELETE_USER permission" },
      action(
        { name: "auditLog", description: "Log deletion to audit trail" },
        transitionTo(
          UserDeleted,
          (userId: string) => {
            // Implementation
            auditLog.record("user_deleted", userId);
            return new UserDeleted({ userId });
          }
        )
      )
    )
  );
}
This produces metadata:

{
  target: UserDeleted,
  description: "Permanently removes a user from the system",
  guards: [{ name: "hasPermission", description: "..." }],
  actions: [{ name: "auditLog", description: "..." }]
}
Sources: 
src/primitives.ts
1-190

Async Service Invocation
Use invoke() for transitions that trigger asynchronous operations:

class FetchReady extends MachineBase<{ url: string }> {
  fetch = invoke(
    {
      src: "httpRequest",
      onDone: FetchSuccess,
      onError: FetchError,
      description: "Performs HTTP GET request"
    },
    async (url: string) => {
      try {
        const response = await fetch(url);
        const data = await response.json();
        return new FetchSuccess({ data });
      } catch (error) {
        return new FetchError({ error: error.message });
      }
    }
  );
}
The static analyzer extracts this as:

{
  "invoke": [{
    "src": "httpRequest",
    "onDone": { "target": "FetchSuccess" },
    "onError": { "target": "FetchError" },
    "description": "Performs HTTP GET request"
  }]
}
Sources: 
README.md
798-806
 
src/extract.ts
99-109

Type System Details
ClassConstructor Type
The DSL uses ClassConstructor to reference target states by their class definitions:

// From src/primitives.ts:28
export type ClassConstructor = new (...args: any[]) => any;
This allows type-safe references to state classes without using magic strings. The static analyzer resolves these to string names during extraction.

Resolution Example:

// In code:
transitionTo(LoggedInMachine, ...)

// Static analyzer resolves:
classSymbol.getName() // => "LoggedInMachine"

// In generated JSON:
{ "target": "LoggedInMachine" }
Sources: 
src/primitives.ts
25-28
 
src/extract.ts
32-58

Type Safety Guarantees
The DSL functions enforce type constraints to prevent invalid metadata:

transitionTo() requires target to be a class constructor
describe() requires transition to already be branded with metadata
guarded() requires a WithMeta input, preventing guards on non-transitions
invoke() requires both onDone and onError to be class constructors
action() requires a WithMeta input
These constraints make it impossible to apply DSL annotations to non-transition functions at compile-time.

Sources: 
src/primitives.ts
105-190

Relationship to Other Systems
The Type-Level Metadata DSL integrates with several other library components:

System	Relationship	Details
Static Analysis (#4.3)	Consumes metadata	extract.ts reads DSL annotations to generate statecharts
MachineBase Class (#3.7)	Uses DSL	Class-based machines use DSL for transition annotation
Creating Machines (#3.2)	Optional for functional style	Functional machines can use DSL but it's not required
Stately Viz / XState	Targets these tools	Generated JSON is compatible with external visualization tools
Integration Flow:










Sources: 
README.md
817-822
 
src/extract.ts
1-190

Static Analysis and Statechart Generation
Relevant source files
Purpose and Scope
This document describes the static analysis system that enables extraction of formal statechart definitions from TypeScript source code. The system consists of two components: a type-level metadata DSL for annotating state machines (
src/primitives.ts
) and a build-time extraction tool (
src/extract.ts
) that uses ts-morph to parse the TypeScript AST and generate JSON statecharts compatible with external visualization tools like Stately Viz and XState.

This system bridges the gap between type-safe TypeScript machines and traditional statechart tooling ecosystems. For information about creating and using machines at runtime, see Creating Machines. For information about the Type-State Programming philosophy, see Type-State Programming Explained.

System Architecture Overview
The static analysis system operates through a two-phase pipeline: annotation (development time) and extraction (build time).

Architecture Diagram
















Sources: 
src/extract.ts
1-190
 
src/primitives.ts
1-191

Type-Level Metadata System
The type-level metadata DSL is implemented in 
src/primitives.ts
 It provides wrapper functions that are identity functions at runtime but brand types with metadata at compile time. This dual nature enables zero-runtime overhead while preserving information for static analysis.

The META_KEY Branding Mechanism










The META_KEY is a unique symbol defined at 
src/primitives.ts
22
 It serves as a type-level key that the static analyzer can locate within complex intersection types.

Sources: 
src/primitives.ts
22-88

Core Type Definitions
Type	Purpose	Location
META_KEY	Unique symbol for type branding	
src/primitives.ts
22
ClassConstructor	Represents a class constructor type	
src/primitives.ts
28
TransitionMeta	Comprehensive metadata shape	
src/primitives.ts
67-78
WithMeta<F, M>	Branded function type	
src/primitives.ts
85-88
GuardMeta	Guard condition metadata	
src/primitives.ts
33-38
InvokeMeta	Async service metadata	
src/primitives.ts
42-52
ActionMeta	Side effect metadata	
src/primitives.ts
57-62
Sources: 
src/primitives.ts
14-88

DSL Annotation Functions












All DSL functions follow the same pattern:

Accept metadata parameters and an implementation/transition function
Return the implementation unchanged (return implementation as any)
Type signature includes WithMeta<F, M> to brand the type
Example composition from 
README.md
783-789
:

login = describe(
  "Authenticates the user",
  transitionTo(LoggedInMachine, (username: string) => {
    return new LoggedInMachine({ username });
  })
);
Sources: 
src/primitives.ts
95-191
 
README.md
779-815

Static Analysis Tool
The extraction tool in 
src/extract.ts
 uses the TypeScript Compiler API via ts-morph to analyze source files and generate statechart JSON.

Analysis Pipeline
Sources: 
src/extract.ts
1-190

Key Functions
generateChart()
The main orchestrator function at 
src/extract.ts
133-185
 It:

Configures project settings (source file path, classes to analyze)
Initializes a ts-morph Project
Iterates over specified classes
Calls analyzeStateNode() for each class
Assembles the final chart and outputs JSON
Configuration variables at 
src/extract.ts
138-150
:

Variable	Purpose	Example
sourceFilePath	Path to machine definitions	"src/authMachine.ts"
classesToAnalyze	Array of class names	["LoggedOutMachine", "LoggedInMachine"]
chartId	Top-level statechart ID	"auth"
initialState	Initial state class name	"LoggedOutMachine"
Sources: 
src/extract.ts
133-185

analyzeStateNode()
Defined at 
src/extract.ts
86-122
 This function:

Takes a ts-morph Symbol representing a class
Iterates over all instance members (methods/properties)
Calls extractMetaFromType() for each member
Separates invoke metadata from standard on transitions
Builds a state node object matching XState/Stately syntax
Transformation logic at 
src/extract.ts
97-119
:

const { invoke, ...onEntry } = meta;

if (invoke) {
  chartNode.invoke.push({
    src: invoke.src,
    onDone: { target: invoke.onDone },
    onError: { target: invoke.onError }
  });
}

if (onEntry.target) {
  if (onEntry.guards) {
    onEntry.cond = onEntry.guards.map(g => g.name).join(' && ');
  }
  chartNode.on[member.getName()] = onEntry;
}
Sources: 
src/extract.ts
86-122

extractMetaFromType()
Defined at 
src/extract.ts
67-77
 This function:

Receives a ts-morph Type object
Escapes the META_KEY symbol (line 69)
Searches for the property with that key
Extracts the type's value declaration
Calls typeToJson() to serialize
Key implementation at 
src/extract.ts
69-76
:

const escapedKey = String(ts.escapeLeadingUnderscores(META_KEY.description!));
const metaProperty = type.getProperty(escapedKey);
if (!metaProperty) return null;

const declaration = metaProperty.getValueDeclaration();
if (!declaration) return null;

return typeToJson(declaration.getType());
Sources: 
src/extract.ts
67-77

typeToJson()
Defined at 
src/extract.ts
32-58
 This recursive function serializes ts-morph Type objects into plain JSON values:

Type resolution logic:



















Critical feature at 
src/extract.ts
34-37
: The function resolves ClassConstructor types (used in transitionTo()) to their string names, enabling the JSON output to reference state classes by name.

Sources: 
src/extract.ts
32-58

Complete Workflow Example
This diagram shows how metadata flows from source code through analysis to output:












Example source code pattern from 
README.md
783-789
:

import { transitionTo, guarded, describe } from "@doeixd/machine/primitives";

class AuthMachine extends MachineBase<{ status: "idle" }> {
  login = describe(
    "Authenticates the user",
    transitionTo(LoggedInMachine, (username: string) => {
      return new LoggedInMachine({ username });
    })
  );

  adminAction = guarded(
    { name: "isAdmin" },
    transitionTo(AdminMachine, () => new AdminMachine())
  );

  fetchData = invoke(
    {
      src: "fetchUserData",
      onDone: SuccessMachine,
      onError: ErrorMachine
    },
    async () => { /* ... */ }
  );
}
Sources: 
README.md
779-815
 
src/extract.ts
1-190

Output Format and Compatibility
The generateChart() function outputs JSON following the XState/Stately statechart specification.

Output Structure






Example output:

{
  "id": "auth",
  "initial": "LoggedOutMachine",
  "states": {
    "LoggedOutMachine": {
      "on": {
        "login": {
          "target": "LoggedInMachine",
          "description": "Authenticates the user"
        }
      }
    },
    "LoggedInMachine": {
      "on": {
        "logout": {
          "target": "LoggedOutMachine"
        },
        "deleteAccount": {
          "target": "DeletedMachine",
          "cond": "isAdmin"
        }
      },
      "invoke": [{
        "src": "fetchUserData",
        "onDone": { "target": "SuccessMachine" },
        "onError": { "target": "ErrorMachine" }
      }]
    }
  }
}
Format compatibility:

Tool	Compatible	Notes
Stately Viz	✅ Yes	Direct import via JSON
XState DevTools	✅ Yes	Compatible state machine format
Custom Tooling	✅ Yes	Standard JSON, easily parsable
Sources: 
src/extract.ts
165-180
 
README.md
810-815

Configuration and Usage
Prerequisites
Install required dependencies:

npm install -D ts-node ts-morph
Configuration
Edit the configuration section in 
src/extract.ts
134-152
:

const sourceFilePath = "src/authMachine.ts";
const classesToAnalyze = [
  "LoggedOutMachine",
  "LoggedInMachine",
];
const chartId = "auth";
const initialState = "LoggedOutMachine";
Execution
Run from project root:

npx ts-node src/extract.ts > statechart.json
The script outputs JSON to stdout (console.log at line 184) and diagnostic messages to stderr (console.error at lines 154, 174, 182).

Sources: 
src/extract.ts
133-190
 
README.md
810-815

Integration into Build Pipeline
The extraction tool can be integrated into your build process:

package.json scripts:

{
  "scripts": {
    "extract-chart": "ts-node src/extract.ts > chart.json",
    "prebuild": "npm run extract-chart"
  }
}
This ensures statechart artifacts are generated before each build.

Sources: 
README.md
810-815

Design Rationale
Why Type-Level Metadata?
The dual-nature design (runtime no-op, compile-time metadata) provides:

Zero runtime overhead - DSL functions compile away completely
Type safety preservation - Metadata doesn't interfere with type inference
Tooling compatibility - Standard TypeScript code, no custom syntax
Optional usage - Annotations are opt-in, core library works without them
Why ts-morph?
The ts-morph library (
src/extract.ts
17
) provides:

Full TypeScript Compiler API access without complexity
Type resolution and symbol traversal
Handles TypeScript's advanced type system features
Maintains compatibility with TypeScript versions
Limitations
Limitation	Reason	Workaround
Requires build step	Static analysis needs source code	Run during development/CI
Manual class list	Type system can't enumerate classes	Configure in generateChart()
Class-based only	Needs symbols with declarations	Use MachineBase subclasses
Single source file	Simplifies analysis	Use imports and configure path
Sources: 
src/extract.ts
1-190
 
src/primitives.ts
1-191

Summary
The static analysis system enables formal verification and tooling integration through a two-layer architecture:

Type-Level Metadata DSL (
src/primitives.ts
): Annotate transitions with transitionTo(), guarded(), invoke(), etc. These are identity functions at runtime but brand types with metadata.

Build-Time Extractor (
src/extract.ts
): Uses ts-morph to parse TypeScript AST, extract META_KEY properties, resolve class references, and generate XState-compatible JSON.

The generated statecharts bridge the gap between type-safe TypeScript machines and traditional state machine visualization tools, enabling developers to leverage both worlds.

Sources: 
README.md
775-815
 
src/extract.ts
1-190
 
src/primitives.ts
1-191
     </context>