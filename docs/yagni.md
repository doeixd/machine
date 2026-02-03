# Minimal Typestate - YAGNI

A state machine library in 20 lines. Everything else is just code.

## Philosophy

Most state machine libraries solve problems you don't have. They add:

- Configuration objects
- String-based events
- Runtime interpreters
- Effect systems
- Plugin architectures
- Visualization hooks

You don't need any of that. You need:

1. State bundled with transitions
2. TypeScript enforcing valid transitions

That's it.

## The Core

```typescript
function machine<C extends object, T extends object>(
  context: C,
  factory: (ctx: C, next: (c: C) => C & T) => T
): C & T {
  const next = (c: C): C & T => machine(c, factory);
  return Object.assign({}, context, factory(context, next));
}
```

10 lines. That's the library.

## Usage

```typescript
const counter = machine({ count: 0 }, (ctx, next) => ({
  inc: () => next({ count: ctx.count + 1 }),
  dec: () => next({ count: ctx.count - 1 }),
  add: (n: number) => next({ count: ctx.count + n })
}));

counter.count           // 0
counter.inc().count     // 1
counter.add(5).count    // 5
```

Transitions return new machines. Chain them. TypeScript infers everything.

---

## Multi-State Machines

Different states need different transitions? Write functions.

```typescript
const idle = () => machine({ status: 'idle' }, (ctx, next) => ({
  fetch: (url: string) => loading(url)
}));

const loading = (url: string) =>
  machine({ status: 'loading', url }, (ctx, next) => ({
    succeed: (data: string) => success(data),
    fail: (error: string) => failure(error, url)
  }));

const success = (data: string) =>
  machine({ status: 'success', data }, (ctx, next) => ({
    reset: () => idle()
  }));

const failure = (error: string, lastUrl: string) =>
  machine({ status: 'error', error, lastUrl }, (ctx, next) => ({
    retry: () => loading(lastUrl),
    reset: () => idle()
  }));
```

Usage:

```typescript
idle().fetch('/api')              // loading machine
idle().fetch('/api').succeed('x') // success machine
idle().fetch('/api').fail('err')  // failure machine

idle().succeed        // TypeError: property doesn't exist
idle().fetch().reset  // TypeError: property doesn't exist
```

TypeScript enforces valid transitions. No configuration. No runtime checks. Just types.

---

## YAGNI

### You don't need `union()`

Some libraries provide:

```typescript
// ❌ Unnecessary abstraction
const flow = union<State>()({
  idle: (ctx, next) => ({ ... }),
  loading: (ctx, next) => ({ ... }),
  success: (ctx, next) => ({ ... })
});
```

This requires:
- Upfront type definitions
- String keys for routing
- Runtime dispatch
- Learning a new API

Just write functions:

```typescript
// ✅ Just code
const idle = () => machine({ status: 'idle' }, (ctx, next) => ({
  fetch: (url: string) => loading(url)
}));

const loading = (url: string) =>
  machine({ status: 'loading', url }, (ctx, next) => ({
    succeed: (data: string) => success(data)
  }));
```

Same result. No abstraction. TypeScript infers the types.

---

### You don't need `factory()`

Some libraries provide:

```typescript
// ❌ Unnecessary abstraction
const createCounter = factory<{ count: number }>()((ctx, next) => ({
  inc: () => next({ count: ctx.count + 1 })
}));

const a = createCounter({ count: 0 });
const b = createCounter({ count: 100 });
```

Just write a function:

```typescript
// ✅ Just code
const createCounter = (count: number) =>
  machine({ count }, (ctx, next) => ({
    inc: () => next({ count: ctx.count + 1 })
  }));

const a = createCounter(0);
const b = createCounter(100);
```

Same result. No new concept.

---

### You don't need `tag()`

Some libraries provide:

```typescript
// ❌ Unnecessary abstraction
const idle = machine(tag('idle'), (ctx, next) => ({ ... }));
const loading = machine(tag('loading', { url }), (ctx, next) => ({ ... }));
```

Just write the object:

```typescript
// ✅ Just code
const idle = machine({ status: 'idle' }, (ctx, next) => ({ ... }));
const loading = (url: string) => 
  machine({ status: 'loading', url }, (ctx, next) => ({ ... }));
```

If TypeScript complains about literal types:

```typescript
{ status: 'idle' as const }
```

One keyword. No helper needed.

---

### You don't need `match()`

Some libraries provide:

```typescript
// ❌ Unnecessary abstraction
const message = match(state, {
  idle: () => 'Ready',
  loading: (s) => `Loading ${s.url}`,
  success: (s) => `Done: ${s.data}`
});
```

Just branch:

```typescript
// ✅ Just code
function render(state: FetchState) {
  if (state.status === 'idle') return 'Ready';
  if (state.status === 'loading') return `Loading ${state.url}`;
  if (state.status === 'success') return `Done: ${state.data}`;
}
```

Or use a switch:

```typescript
switch (state.status) {
  case 'idle': return 'Ready';
  case 'loading': return `Loading ${state.url}`;
  case 'success': return `Done: ${state.data}`;
}
```

TypeScript already does exhaustiveness checking with `noImplicitReturns`, or use a simple helper:

```typescript
function assertNever(x: never): never {
  throw new Error("Unexpected object: " + x);
}

switch (state.status) {
  case 'idle': return 'Ready';
  case 'loading': return `Loading ${state.url}`;
  case 'success': return `Done: ${state.data}`;
  default: return assertNever(state);
}
```

---

### You don't need effect primitives

Some libraries provide:

```typescript
// ❌ Unnecessary abstraction
const withEffects = runnable(machine, {
  loading: {
    onEnter: (ctx, send) => {
      const id = setTimeout(() => send('timeout'), 5000);
      return () => clearTimeout(id);
    }
  }
});
```

Just write the code:

```typescript
// ✅ Just code
let state = idle();
let timeout: number | null = null;

function send(event: string, ...args: unknown[]) {
  const prev = state;
  state = (state as any)[event]?.(...args) ?? state;
  
  // Entered loading
  if (prev.status !== 'loading' && state.status === 'loading') {
    timeout = setTimeout(() => send('timeout'), 5000);
  }
  
  // Left loading
  if (prev.status === 'loading' && state.status !== 'loading') {
    if (timeout) clearTimeout(timeout);
    timeout = null;
  }
}
```

Effects are application code. They don't belong in a state machine library.

---

### You don't need delegation primitives

Some libraries provide:

```typescript
// ❌ Unnecessary abstraction  
const parent = machine({ child: counter }, (ctx, next) => ({
  ...delegate(ctx, 'child', next, { pick: ['inc', 'dec'] })
}));
```

Just write the forwarding:

```typescript
// ✅ Just code
const parent = machine({ child: counter }, (ctx, next) => ({
  inc: () => next({ child: ctx.child.inc() }),
  dec: () => next({ child: ctx.child.dec() })
}));
```

More explicit. No magic. TypeScript infers everything.

If you have many children:

```typescript
const parent = machine({ a: counterA, b: counterB }, (ctx, next) => ({
  incA: () => next({ ...ctx, a: ctx.a.inc() }),
  incB: () => next({ ...ctx, b: ctx.b.inc() })
}));
```

Verbose? Yes. Clear? Also yes. You probably don't have 20 children.

---

## When You Actually Need It

### Pattern Matching

If you're handling unions at boundaries frequently:

```typescript
function match<T extends { status: string }, R>(
  state: T,
  cases: { [K in T['status']]: (s: Extract<T, { status: K }>) => R }
): R {
  return (cases as any)[state.status](state);
}
```

5 lines. Add it when you need it.

### Delegation

If you genuinely have 10+ children:

```typescript
function delegate<C extends object, K extends keyof C, T extends object>(
  ctx: C,
  key: K,
  next: (c: C) => C & T
): Record<string, (...args: any[]) => C & T> {
  const child = ctx[key] as Record<string, Function>;
  const result: Record<string, Function> = {};
  for (const k of Object.keys(child)) {
    if (typeof child[k] === 'function') {
      result[k] = (...args: any[]) => next({ ...ctx, [key]: child[k](...args) });
    }
  }
  return result;
}
```

15 lines. Add it when you need it.

### Tag Helper

If `as const` bothers you:

```typescript
function tag<T extends string>(name: T): { status: T };
function tag<T extends string, O extends object>(name: T, data: O): { status: T } & O;
function tag(name: string, data?: object) {
  return data ? { ...data, status: name } : { status: name };
}
```

5 lines. Add it when you need it.

---

## The Complete "Library"

```typescript
/**
 * Creates a state machine.
 * 
 * @param context - State data
 * @param factory - Returns transitions that can access ctx and create next states
 * @returns Machine with context properties and transition methods
 */
export function machine<C extends object, T extends object>(
  context: C,
  factory: (ctx: C, next: (c: C) => C & T) => T
): C & T {
  const next = (c: C): C & T => machine(c, factory);
  return Object.assign({}, context, factory(context, next));
}

// Types
export type Machine<C extends object, T extends object> = C & T;
export type Context<M> = M extends Machine<infer C, any> ? C : never;
export type Transitions<M> = M extends Machine<any, infer T> ? T : never;
```

That's it. ~15 lines including types.

---

## Examples

### Counter

```typescript
const counter = machine({ count: 0 }, (ctx, next) => ({
  inc: () => next({ count: ctx.count + 1 }),
  dec: () => next({ count: ctx.count - 1 }),
  set: (n: number) => next({ count: n })
}));
```

### Toggle

```typescript
const off = machine({ on: false }, (ctx, next) => ({
  toggle: () => on
}));

const on = machine({ on: true }, (ctx, next) => ({
  toggle: () => off
}));
```

### Async Flow

```typescript
const idle = machine({ status: 'idle' as const }, (ctx, next) => ({
  fetch: (url: string) => loading(url)
}));

const loading = (url: string) =>
  machine({ status: 'loading' as const, url }, (ctx, next) => ({
    succeed: <T>(data: T) => success(data),
    fail: (error: string) => failure(error, url)
  }));

const success = <T>(data: T) =>
  machine({ status: 'success' as const, data }, (ctx, next) => ({
    reset: () => idle()
  }));

const failure = (error: string, lastUrl: string) =>
  machine({ status: 'error' as const, error, lastUrl }, (ctx, next) => ({
    retry: () => loading(lastUrl),
    reset: () => idle()
  }));
```

### Form Wizard

```typescript
const step1 = (data: Partial<FormData> = {}) =>
  machine({ step: 1 as const, ...data }, (ctx, next) => ({
    setName: (name: string) => step1({ ...ctx, name }),
    next: () => ctx.name ? step2(ctx) : step1(ctx)
  }));

const step2 = (data: Partial<FormData>) =>
  machine({ step: 2 as const, ...data }, (ctx, next) => ({
    setEmail: (email: string) => step2({ ...ctx, email }),
    back: () => step1(ctx),
    next: () => ctx.email ? step3(ctx) : step2(ctx)
  }));

const step3 = (data: Partial<FormData>) =>
  machine({ step: 3 as const, ...data }, (ctx, next) => ({
    back: () => step2(ctx),
    submit: () => submitted(ctx as FormData)
  }));

const submitted = (data: FormData) =>
  machine({ step: 'done' as const, ...data }, (ctx, next) => ({
    restart: () => step1()
  }));
```

### With React

```typescript
function useCounter() {
  const [state, setState] = useState(counter);
  
  return {
    count: state.count,
    inc: () => setState(s => s.inc()),
    dec: () => setState(s => s.dec()),
    set: (n: number) => setState(s => s.set(n))
  };
}
```

### With Effects (just code)

```typescript
function useFetch() {
  const [state, setState] = useState(idle());
  const controllerRef = useRef<AbortController | null>(null);
  
  const send = useCallback((event: string, ...args: any[]) => {
    setState(prev => {
      const next = (prev as any)[event]?.(...args) ?? prev;
      
      // Effect: start fetch when entering loading
      if (prev.status !== 'loading' && next.status === 'loading') {
        controllerRef.current = new AbortController();
        fetch(next.url, { signal: controllerRef.current.signal })
          .then(r => r.json())
          .then(data => send('succeed', data))
          .catch(err => send('fail', err.message));
      }
      
      // Effect: abort when leaving loading
      if (prev.status === 'loading' && next.status !== 'loading') {
        controllerRef.current?.abort();
      }
      
      return next;
    });
  }, []);
  
  return { state, send };
}
```

---

## FAQ

**Q: What about visualization/devtools?**

A: `console.log(state)`. If you need more, build it for your app.

**Q: What about persistence?**

A: `localStorage.setItem('state', JSON.stringify(state))`. It's just an object.

**Q: What about middleware/logging?**

A: Wrap your send function.

```typescript
function send(event: string, ...args: any[]) {
  console.log('Before:', state.status, event, args);
  state = (state as any)[event]?.(...args) ?? state;
  console.log('After:', state.status);
}
```

**Q: What about time-travel debugging?**

A: Keep a history array.

```typescript
const history: State[] = [initial];

function send(event: string, ...args: any[]) {
  const next = (state as any)[event]?.(...args);
  if (next) {
    history.push(next);
    state = next;
  }
}

function undo() {
  if (history.length > 1) {
    history.pop();
    state = history[history.length - 1];
  }
}
```

**Q: What about parallel states?**

A: Two machines.

```typescript
const app = {
  auth: authMachine,
  ui: uiMachine
};

function send(target: 'auth' | 'ui', event: string, ...args: any[]) {
  app[target] = (app[target] as any)[event]?.(...args) ?? app[target];
}
```

**Q: What about actors/spawn?**

A: You probably don't need them. If you do, you'll know, and you can build exactly what you need.

---

## The Point

State machines are simple. A state. Some transitions. New states.

```typescript
state + event → newState
```

TypeScript gives you compile-time safety. Functions give you composition. Objects give you data.

You don't need a framework. You need 10 lines and the willingness to write code.

```typescript
function machine<C extends object, T extends object>(
  context: C,
  factory: (ctx: C, next: (c: C) => C & T) => T
): C & T {
  const next = (c: C): C & T => machine(c, factory);
  return Object.assign({}, context, factory(context, next));
}
```

That's the library. Everything else is your code.