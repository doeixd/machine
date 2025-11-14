# Plan: Runtime Metadata Collection via Symbol-Based Attachment (Option A)

## Overview

Add **runtime metadata collection** to complement the existing build-time static extraction system. This enables generating statecharts from **running machine instances** without requiring TypeScript source code access.

### Goals

1. **Zero new dependencies** - Use native JavaScript Symbols
2. **Non-intrusive** - Metadata attached via non-enumerable Symbol properties
3. **Composable** - Handle nested DSL primitives correctly
4. **Dual extraction** - Works alongside static AST-based extraction
5. **Type-safe** - Leverage existing TypeScript types
6. **Minimal overhead** - Small memory footprint, fast access

### Use Cases

- **Debugging production** - Extract statecharts from running instances in production
- **No source access** - Generate diagrams when source code isn't available
- **Dynamic machines** - Extract from machines created with computed values
- **Browser DevTools** - Inspect machines in browser console
- **Testing** - Validate machine structure at runtime

---

## Technical Approach: Symbol-Based Metadata Attachment

### Core Mechanism

```typescript
// Hidden Symbol for runtime metadata (non-enumerable)
const RUNTIME_META = Symbol('__machine_runtime_meta__');

// Attach metadata directly to the function object
function attachMetadata(fn: any, metadata: Partial<TransitionMeta>): void {
  const existing = fn[RUNTIME_META] || {};

  // Intelligently merge metadata
  const merged: TransitionMeta = { ...existing, ...metadata };

  // Handle array properties specially (guards, actions)
  if (metadata.guards) {
    merged.guards = [...(existing.guards || []), ...metadata.guards];
  }
  if (metadata.actions) {
    merged.actions = [...(existing.actions || []), ...metadata.actions];
  }

  // Define non-enumerable property
  Object.defineProperty(fn, RUNTIME_META, {
    value: merged,
    enumerable: false,    // Invisible to for...in, Object.keys()
    writable: false,      // Immutable
    configurable: true    // Allow re-definition for composition
  });
}
```

### Why This Works

**✅ Advantages:**
- Metadata travels with the function itself
- No global state or registries needed
- Non-enumerable = invisible to normal iteration
- Configurable = allows nested DSL composition
- Memory efficient (single property per function)

**⚠️ Trade-offs:**
- Mutates the function object (but safely, non-enumerable)
- Requires the function to exist (can't attach to primitives)
- Only works with object-like functions (arrow functions OK)

---

## Composition Strategy: Nested DSL Calls

### The Challenge

DSL primitives nest to compose metadata:

```typescript
login = describe(
  "Start login",           // ← Layer 3: description
  action(
    { name: "log" },       // ← Layer 2: action
    transitionTo(
      LoggedIn,            // ← Layer 1: target
      (user) => ...        // ← Layer 0: implementation
    )
  )
)
```

**Question**: Which function object gets the metadata?

### Solution: Mutate-in-Place and Return Same Function

Each wrapper:
1. Receives a function (possibly already wrapped)
2. Reads existing metadata from `fn[RUNTIME_META]`
3. Merges new metadata with existing
4. Re-defines `RUNTIME_META` property with merged data
5. Returns **the same function** (not a wrapper)

**Result**: The innermost implementation function accumulates all metadata as it passes through each wrapper.

```typescript
// Step 1: transitionTo creates metadata
const impl = (user) => new LoggedIn({ user });
attachMetadata(impl, { target: 'LoggedIn' });
// impl[RUNTIME_META] = { target: 'LoggedIn' }

// Step 2: action adds to existing
attachMetadata(impl, { actions: [{ name: 'log' }] });
// impl[RUNTIME_META] = { target: 'LoggedIn', actions: [...] }

// Step 3: describe adds to existing
attachMetadata(impl, { description: 'Start login' });
// impl[RUNTIME_META] = { target: 'LoggedIn', actions: [...], description: '...' }

// Result: Single function with complete metadata
```

---

## Implementation Details

### 1. New Symbol Export (src/primitives.ts)

```typescript
/**
 * Runtime metadata symbol
 * Non-enumerable property key for storing metadata on function objects
 * @internal
 */
export const RUNTIME_META = Symbol('__machine_runtime_meta__');
```

**Location**: Top of `src/primitives.ts` near `META_KEY`

**Visibility**: Exported for testing and runtime extraction, marked `@internal`

---

### 2. Metadata Attachment Helper (src/primitives.ts)

```typescript
/**
 * Attaches runtime metadata to a function object.
 * Merges with existing metadata if present.
 *
 * @param fn - The function to attach metadata to
 * @param metadata - Partial metadata to merge
 * @internal
 */
function attachRuntimeMeta(fn: any, metadata: Partial<TransitionMeta>): void {
  // Read existing metadata (may be undefined)
  const existing = fn[RUNTIME_META] || {};

  // Shallow merge for simple properties
  const merged: any = { ...existing, ...metadata };

  // Deep merge for array properties
  if (metadata.guards && existing.guards) {
    merged.guards = [...existing.guards, ...metadata.guards];
  } else if (metadata.guards) {
    merged.guards = [...metadata.guards];
  }

  if (metadata.actions && existing.actions) {
    merged.actions = [...existing.actions, ...metadata.actions];
  } else if (metadata.actions) {
    merged.actions = [...metadata.actions];
  }

  // Replace invoke entirely (not an array, can't merge)
  // Last invoke wins (this matches XState semantics)

  // Define or redefine the metadata property
  Object.defineProperty(fn, RUNTIME_META, {
    value: merged,
    enumerable: false,
    writable: false,
    configurable: true  // CRITICAL: Must be configurable for re-definition
  });
}
```

**Key Design Decision**: `configurable: true` allows DSL wrappers to redefine the property as metadata accumulates.

---

### 3. Update DSL Primitives

#### 3.1. transitionTo()

```typescript
export function transitionTo<
  T extends ClassConstructor,
  F extends (...args: any[]) => any
>(
  _target: T,
  implementation: F
): WithMeta<F, { target: T }> {
  // Attach runtime metadata with class name
  attachRuntimeMeta(implementation, {
    target: _target.name || _target.toString()
  });

  return implementation as any;
}
```

**Changes**:
- Add `attachRuntimeMeta()` call before return
- Extract target class name: `_target.name` or fallback to `toString()`

**Challenge**: How to get class name?
- `_target.name` works for named classes: `class Foo {}` → `"Foo"`
- `_target.toString()` for anonymous: `class {}` → `"class {}"`

---

#### 3.2. describe()

```typescript
export function describe<
  F extends (...args: any[]) => any,
  M extends TransitionMeta
>(
  _text: string,
  transition: WithMeta<F, M>
): WithMeta<F, M & { description: string }> {
  // Attach runtime metadata
  attachRuntimeMeta(transition, {
    description: _text
  });

  return transition as any;
}
```

**Changes**:
- Add `attachRuntimeMeta()` call
- Pass string directly

---

#### 3.3. guarded()

```typescript
export function guarded<
  F extends (...args: any[]) => any,
  M extends TransitionMeta
>(
  guard: GuardMeta,
  transition: WithMeta<F, M>
): WithMeta<F, M & { guards: [typeof guard] }> {
  // Attach runtime metadata
  // Note: guards is an array, will be merged by attachRuntimeMeta
  attachRuntimeMeta(transition, {
    guards: [guard]
  });

  return transition as any;
}
```

**Changes**:
- Add `attachRuntimeMeta()` call
- Wrap guard in array (matches `TransitionMeta.guards` type)

---

#### 3.4. invoke()

```typescript
export function invoke<
  D extends ClassConstructor,
  E extends ClassConstructor,
  F extends (...args: any[]) => any
>(
  service: { src: string; onDone: D; onError: E; description?: string },
  implementation: F
): WithMeta<F, { invoke: typeof service }> {
  // Attach runtime metadata with class names resolved
  attachRuntimeMeta(implementation, {
    invoke: {
      src: service.src,
      onDone: service.onDone.name || service.onDone.toString(),
      onError: service.onError.name || service.onError.toString(),
      description: service.description
    }
  });

  return implementation as any;
}
```

**Changes**:
- Add `attachRuntimeMeta()` call
- Resolve class names for `onDone` and `onError`

**Note**: `invoke` is not an array, so last invoke wins (XState semantics).

---

#### 3.5. action()

```typescript
export function action<
  F extends (...args: any[]) => any,
  M extends TransitionMeta
>(
  action: ActionMeta,
  transition: WithMeta<F, M>
): WithMeta<F, M & { actions: [typeof action] }> {
  // Attach runtime metadata
  // Note: actions is an array, will be merged by attachRuntimeMeta
  attachRuntimeMeta(transition, {
    actions: [action]
  });

  return transition as any;
}
```

**Changes**:
- Add `attachRuntimeMeta()` call
- Wrap action in array

---

### 4. Runtime Extraction API (src/runtime-extract.ts - NEW FILE)

Create a new file for runtime extraction utilities:

```typescript
/**
 * @file Runtime statechart extraction utilities
 * @description Extract statecharts from running machine instances
 */

import { RUNTIME_META } from './primitives';

/**
 * Runtime metadata interface (same as TransitionMeta but with resolved class names)
 */
export interface RuntimeTransitionMeta {
  target?: string;
  description?: string;
  guards?: Array<{ name: string; description?: string }>;
  invoke?: {
    src: string;
    onDone: string;
    onError: string;
    description?: string;
  };
  actions?: Array<{ name: string; description?: string }>;
}

/**
 * Extract metadata from a single function if it has runtime metadata attached
 *
 * @param fn - Function to extract from
 * @returns Metadata object or null if no metadata
 */
export function extractFunctionMetadata(fn: any): RuntimeTransitionMeta | null {
  if (typeof fn !== 'function') {
    return null;
  }

  const meta = fn[RUNTIME_META];
  return meta || null;
}

/**
 * Extract state node from a machine class instance
 *
 * @param stateInstance - Instance of a machine state class
 * @returns State node with transitions
 */
export function extractStateNode(stateInstance: any): any {
  const stateNode: any = { on: {} };
  const invoke: any[] = [];

  // Iterate over all properties
  for (const key in stateInstance) {
    const value = stateInstance[key];

    if (typeof value !== 'function') {
      continue;
    }

    const meta = extractFunctionMetadata(value);
    if (!meta) {
      continue;
    }

    // Separate invoke from transitions
    if (meta.invoke) {
      invoke.push({
        src: meta.invoke.src,
        onDone: { target: meta.invoke.onDone },
        onError: { target: meta.invoke.onError },
        description: meta.invoke.description
      });
    }

    // If has target, it's a transition
    if (meta.target) {
      const transition: any = { target: meta.target };

      if (meta.description) {
        transition.description = meta.description;
      }

      if (meta.guards && meta.guards.length > 0) {
        transition.cond = meta.guards.map(g => g.name).join(' && ');
      }

      if (meta.actions && meta.actions.length > 0) {
        transition.actions = meta.actions.map(a => a.name);
      }

      stateNode.on[key] = transition;
    }
  }

  if (invoke.length > 0) {
    stateNode.invoke = invoke;
  }

  return stateNode;
}

/**
 * Generate a complete statechart from multiple state class instances
 *
 * @param states - Object mapping state names to state instances
 * @param config - Chart configuration
 * @returns XState-compatible statechart JSON
 *
 * @example
 * const chart = generateStatechart({
 *   'LoggedOut': new LoggedOutMachine(),
 *   'LoggedIn': new LoggedInMachine()
 * }, {
 *   id: 'auth',
 *   initial: 'LoggedOut'
 * });
 */
export function generateStatechart(
  states: Record<string, any>,
  config: { id: string; initial: string; description?: string }
): any {
  const chart: any = {
    id: config.id,
    initial: config.initial,
    states: {}
  };

  if (config.description) {
    chart.description = config.description;
  }

  for (const [stateName, stateInstance] of Object.entries(states)) {
    chart.states[stateName] = extractStateNode(stateInstance);
  }

  return chart;
}

/**
 * Convenience function to extract statechart from a single machine instance
 * Useful for simple machines with a single context but multiple transitions
 *
 * @param machineInstance - Machine instance
 * @param config - Chart configuration
 * @returns XState-compatible statechart JSON
 */
export function extractFromInstance(
  machineInstance: any,
  config: { id: string; stateName?: string }
): any {
  const stateName = config.stateName || machineInstance.constructor.name || 'State';

  return {
    id: config.id,
    initial: stateName,
    states: {
      [stateName]: extractStateNode(machineInstance)
    }
  };
}
```

---

### 5. Export from src/index.ts

```typescript
// Runtime extraction utilities
export {
  extractFunctionMetadata,
  extractStateNode,
  generateStatechart,
  extractFromInstance,
  type RuntimeTransitionMeta
} from './runtime-extract';

// Export runtime metadata symbol (for advanced use)
export { RUNTIME_META } from './primitives';
```

---

## Integration with Static Extraction

### Dual Extraction Modes

Both extraction methods coexist and serve different purposes:

| Aspect | Static (AST-based) | Runtime (Symbol-based) |
|--------|-------------------|------------------------|
| **When** | Build time | Runtime |
| **Requires** | TypeScript source | Running instance |
| **Input** | Source file path | Machine instances |
| **How** | Parse AST with ts-morph | Read Symbol properties |
| **Use Case** | Documentation, CI/CD | Debugging, production |
| **Overhead** | None (build time only) | Tiny (metadata on functions) |
| **Dynamic values** | ❌ Only literals | ✅ Resolves at runtime |

### Complementary Strengths

**Static extraction** wins when:
- Generating docs during build
- No code execution needed
- Source code available
- Want to validate before running

**Runtime extraction** wins when:
- Debugging production issues
- Source code unavailable
- Machine created with dynamic values
- Browser DevTools inspection

---

## Testing Strategy

### Unit Tests (test/runtime-extract.test.ts - NEW)

```typescript
import { describe, it, expect } from 'vitest';
import { MachineBase } from '../src/index';
import { transitionTo, describe as desc, guarded, action, invoke } from '../src/primitives';
import { extractFunctionMetadata, extractStateNode, generateStatechart } from '../src/runtime-extract';

describe('Runtime Metadata Extraction', () => {
  it('should attach metadata to functions', () => {
    const fn = transitionTo(
      class Target {},
      () => new Target()
    );

    const meta = extractFunctionMetadata(fn);
    expect(meta).toHaveProperty('target');
    expect(meta?.target).toBe('Target');
  });

  it('should compose nested metadata', () => {
    const fn = desc(
      "Test transition",
      action(
        { name: "logTest" },
        transitionTo(
          class Target {},
          () => new Target()
        )
      )
    );

    const meta = extractFunctionMetadata(fn);
    expect(meta?.description).toBe("Test transition");
    expect(meta?.actions).toHaveLength(1);
    expect(meta?.actions?.[0].name).toBe("logTest");
    expect(meta?.target).toBe("Target");
  });

  it('should extract state node from machine instance', () => {
    class Target extends MachineBase<any> {}

    class Source extends MachineBase<any> {
      transition = transitionTo(Target, () => new Target());
    }

    const instance = new Source({ status: 'test' });
    const stateNode = extractStateNode(instance);

    expect(stateNode.on.transition).toEqual({
      target: 'Target'
    });
  });

  it('should generate complete statechart', () => {
    class LoggedOut extends MachineBase<any> {
      login = transitionTo(class LoggedIn {}, () => new LoggedIn());
    }

    class LoggedIn extends MachineBase<any> {
      logout = transitionTo(LoggedOut, () => new LoggedOut({ status: 'out' }));
    }

    const chart = generateStatechart({
      LoggedOut: new LoggedOut({ status: 'out' }),
      LoggedIn: new LoggedIn({ status: 'in' })
    }, {
      id: 'auth',
      initial: 'LoggedOut'
    });

    expect(chart.id).toBe('auth');
    expect(chart.initial).toBe('LoggedOut');
    expect(chart.states.LoggedOut.on.login.target).toBe('LoggedIn');
    expect(chart.states.LoggedIn.on.logout.target).toBe('LoggedOut');
  });

  it('should handle guards and actions', () => {
    const fn = guarded(
      { name: 'isAdmin' },
      action(
        { name: 'log' },
        transitionTo(class Target {}, () => new Target())
      )
    );

    const meta = extractFunctionMetadata(fn);
    expect(meta?.guards?.[0].name).toBe('isAdmin');
    expect(meta?.actions?.[0].name).toBe('log');
  });

  it('should handle invoke metadata', () => {
    const fn = invoke(
      {
        src: 'fetchData',
        onDone: class Success {},
        onError: class Error {}
      },
      async () => new Success()
    );

    const meta = extractFunctionMetadata(fn);
    expect(meta?.invoke?.src).toBe('fetchData');
    expect(meta?.invoke?.onDone).toBe('Success');
    expect(meta?.invoke?.onError).toBe('Error');
  });
});
```

### Integration Test

Create an example machine and verify both extraction methods produce same result:

```typescript
it('should produce same output as static extraction', async () => {
  // Use authMachine.ts example
  const runtimeChart = generateStatechart({
    LoggedOut: new LoggedOutMachine(),
    LoggedIn: new LoggedInMachine()
  }, { id: 'auth', initial: 'LoggedOut' });

  // Load static extraction result
  const staticChart = JSON.parse(
    fs.readFileSync('statecharts/auth.json', 'utf-8')
  );

  // Compare structures (allowing for minor differences)
  expect(runtimeChart.id).toBe(staticChart.id);
  expect(runtimeChart.initial).toBe(staticChart.initial);
  expect(Object.keys(runtimeChart.states)).toEqual(
    expect.arrayContaining(Object.keys(staticChart.states))
  );
});
```

---

## Usage Examples

### Example 1: Extract from Running Instance

```typescript
import { LoggedOutMachine } from './authMachine';
import { extractFromInstance } from '@doeixd/machine';

// Create instance
const machine = new LoggedOutMachine({ status: 'loggedOut' });

// Extract at runtime
const chart = extractFromInstance(machine, {
  id: 'auth',
  stateName: 'LoggedOut'
});

console.log(JSON.stringify(chart, null, 2));
```

### Example 2: Multi-State Extraction

```typescript
import { generateStatechart } from '@doeixd/machine';
import { LoggedOut, LoggedIn } from './authMachine';

const chart = generateStatechart({
  LoggedOut: new LoggedOut({ status: 'loggedOut' }),
  LoggedIn: new LoggedIn({ status: 'loggedIn', token: '' })
}, {
  id: 'authFlow',
  initial: 'LoggedOut',
  description: 'User authentication state machine'
});

// Use in Stately Viz
console.log(JSON.stringify(chart, null, 2));
```

### Example 3: Browser DevTools

```typescript
// In browser console:
const machine = getCurrentMachine(); // Get from app state
const chart = extractFromInstance(machine, { id: 'debug' });

// Copy to clipboard
copy(JSON.stringify(chart, null, 2));

// Paste into https://stately.ai/viz
```

---

## Implementation Steps

### Phase 1: Core Infrastructure

1. ✅ Add `RUNTIME_META` symbol to `src/primitives.ts`
2. ✅ Implement `attachRuntimeMeta()` helper function
3. ✅ Update all DSL primitives to call `attachRuntimeMeta()`
4. ✅ Test metadata attachment manually

### Phase 2: Extraction API

5. ✅ Create `src/runtime-extract.ts`
6. ✅ Implement `extractFunctionMetadata()`
7. ✅ Implement `extractStateNode()`
8. ✅ Implement `generateStatechart()`
9. ✅ Implement `extractFromInstance()`

### Phase 3: Testing

10. ✅ Create `test/runtime-extract.test.ts`
11. ✅ Write unit tests for metadata attachment
12. ✅ Write unit tests for extraction functions
13. ✅ Write integration test comparing static vs runtime
14. ✅ Test with all example machines

### Phase 4: Documentation

15. ✅ Add JSDoc comments to all new functions
16. ✅ Update `docs/statechart-extraction.md` with runtime section
17. ✅ Add runtime extraction examples to README
18. ✅ Update CLAUDE.md with architecture details

### Phase 5: Export & Polish

19. ✅ Export runtime utilities from `src/index.ts`
20. ✅ Verify TypeScript types work correctly
21. ✅ Test tree-shaking (runtime extraction is optional)
22. ✅ Run full test suite

---

## Trade-offs & Considerations

### Memory Impact

**Overhead per annotated function**:
- Symbol property: ~40-80 bytes (depends on metadata size)
- For a machine with 10 transitions: ~400-800 bytes total
- **Verdict**: Negligible for most applications

### Performance Impact

**Runtime**:
- `Object.defineProperty()`: ~0.1-0.5μs per call
- Called once per DSL wrapper during machine creation
- **Verdict**: Negligible, happens at construction time

**Extraction**:
- Iterate over object properties: ~1-5μs per property
- **Verdict**: Fast enough for debugging/development use

### Bundle Size

**Added code**:
- `attachRuntimeMeta()`: ~200 bytes
- Runtime extraction utilities: ~2-3 KB
- **Verdict**: Minimal, tree-shakeable if unused

### Compatibility

**Works with**:
- ✅ All modern browsers (Symbols widely supported)
- ✅ Node.js 6+ (Symbol support)
- ✅ TypeScript 3.5+ (Symbol type support)

**Doesn't work with**:
- ❌ IE11 without polyfill (Symbol not supported)
- ❌ Frozen functions (`Object.freeze()` prevents `defineProperty`)

---

## Success Criteria

- ✅ All DSL primitives attach runtime metadata
- ✅ Nested composition works correctly (metadata accumulates)
- ✅ Runtime extraction produces XState-compatible JSON
- ✅ Runtime and static extraction produce equivalent output
- ✅ Zero impact when runtime extraction not used (tree-shakeable)
- ✅ Full test coverage (>95%)
- ✅ Documentation complete with examples
- ✅ Works in browser and Node.js

---

## Open Questions

1. **Class name resolution**: Should we support anonymous classes differently?
   - **Proposal**: Use `target.constructor.name` or fallback to `"Anonymous"`

2. **Multiple invokes**: XState supports arrays, should we?
   - **Proposal**: Start with last-invoke-wins, add array support later

3. **Metadata inspection API**: Should we expose a helper to check if function has metadata?
   - **Proposal**: Yes, add `hasRuntimeMetadata(fn): boolean`

4. **DevTools integration**: Should runtime extraction integrate with existing devtools?
   - **Proposal**: Yes, add in future PR after this foundation

---

## Future Enhancements

### V2 Features (Future)

1. **Automatic extraction from MachineBase instances**
   ```typescript
   class LoggedOut extends MachineBase<C> {
     // ...
   }

   const instance = new LoggedOut({ ... });
   const chart = instance.toStatechart(); // Auto-extract
   ```

2. **Live statechart updates in DevTools**
   - Connect to browser extension
   - Real-time visualization as machine transitions

3. **Diffing tool**
   ```typescript
   const diff = compareStatecharts(runtimeChart, staticChart);
   // Shows differences between runtime and static extraction
   ```

4. **Metadata validation**
   ```typescript
   validateMetadata(fn); // Throws if metadata is malformed
   ```

---

## Conclusion

This plan provides a complete, production-ready runtime metadata collection system that:

- ✅ **Complements** existing static extraction (doesn't replace it)
- ✅ **Uses native JavaScript** (Symbols, defineProperty)
- ✅ **Zero overhead** when not used (tree-shakeable)
- ✅ **Composable** (handles nested DSL primitives)
- ✅ **Type-safe** (leverages existing TypeScript types)
- ✅ **Well-tested** (comprehensive test coverage)

The Symbol-based approach (Option A) is the right choice because it avoids global state, keeps metadata co-located with functions, and provides excellent ergonomics for both library developers and users.
