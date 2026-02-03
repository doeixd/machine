/**
 * @fileoverview Examples demonstrating the minimal typestate library.
 */

import {
  machine,
  match,
  runnable,
  run,
  withChildren,
  factory,
  tag,
  union,
  isState,
  type Machine,
  type Tagged,
  type UnionOf,
  type States
} from '../src/minimal';

// ============================================================================
// EXAMPLE 1: Simple Counter (Single-State)
// ============================================================================

// Use factory() for perfect inference on single-state machines
const counterFactory = factory<{ count: number }>()((ctx, next) => ({
  inc: () => next({ count: ctx.count + 1 }),
  dec: () => next({ count: ctx.count - 1 }),
  add: (n: number) => next({ count: ctx.count + n }),
  reset: () => next({ count: 0 })
}));

const counter = counterFactory({ count: 0 });

// Usage
console.log(counter.count);                    // 0
console.log(counter.inc().count);              // 1
console.log(counter.inc().inc().dec().count);  // 1
console.log(counter.add(10).count);            // 10

// Chaining (Type-safe!)
const result = counter.inc().inc().add(5).dec().count;
console.log(result); // 6

// ============================================================================
// EXAMPLE 2: Traffic Light (Multi-State)
// ============================================================================

const trafficLight = union<{ tag: 'green' } | { tag: 'yellow' } | { tag: 'red' }>()({
  green: (ctx, next) => ({
    change: () => next({ tag: 'yellow' })
  }),
  yellow: (ctx, next) => ({
    change: () => next({ tag: 'red' })
  }),
  red: (ctx, next) => ({
    change: () => next({ tag: 'green' })
  })
});

const green = trafficLight({ tag: 'green' });

type TrafficLight = UnionOf<typeof trafficLight>;

// Pattern matching
function render(light: TrafficLight): string {
  return match(light, {
    green: () => '🟢 GO',
    yellow: () => '🟡 CAUTION',
    red: () => '🔴 STOP'
  });
}

console.log(render(green));           // '🟢 GO'
console.log(render(green.change())); // '🟡 CAUTION'

// ============================================================================
// EXAMPLE 3: Authentication (Different Data Per State)
// ============================================================================

interface User {
  id: string;
  name: string;
  email: string;
}

const auth = union<{ tag: 'loggedOut' } | { tag: 'loggedIn'; user: User; token: string }>()({
  loggedOut: (ctx, next) => ({
    login: (user: User, token: string) => next({ tag: 'loggedIn', user, token })
  }),
  loggedIn: (ctx, next) => ({
    logout: () => next({ tag: 'loggedOut' }),
    refreshToken: (newToken: string) => next({ ...ctx, token: newToken }),
    updateProfile: (updates: Partial<User>) =>
      next({ ...ctx, user: { ...ctx.user, ...updates } })
  })
});

type AuthState = UnionOf<typeof auth>;

const alice: User = { id: '1', name: 'Alice', email: 'alice@example.com' };
const session = auth({ tag: 'loggedOut' }).login(alice, 'token123');

console.log(session.user.name);  // 'Alice'
const updated = session.updateProfile({ name: 'Alicia' });
console.log(updated.user.name);  // 'Alicia'

const loggedOutAgain = updated.logout();
console.log(loggedOutAgain.tag); // 'loggedOut'

// ============================================================================
// EXAMPLE 4: Data Fetching (Async States)
// ============================================================================

interface FetchError {
  code: number;
  message: string;
}

const fetchFlow = union<
  { tag: 'idle' } |
  { tag: 'loading'; url: string; startedAt: number } |
  { tag: 'success'; data: any } |
  { tag: 'failure'; error: FetchError; lastUrl: string }
>()({
  idle: (ctx, next) => ({
    fetch: (url: string) => next({ tag: 'loading', url, startedAt: Date.now() })
  }),
  loading: (ctx, next) => ({
    succeed: (data: any) => next({ tag: 'success', data }),
    fail: (error: FetchError) => next({ tag: 'failure', error, lastUrl: ctx.url }),
    cancel: () => next({ tag: 'idle' })
  }),
  success: (ctx, next) => ({
    refetch: (url: string) => next({ tag: 'loading', url, startedAt: Date.now() }),
    clear: () => next({ tag: 'idle' })
  }),
  failure: (ctx, next) => ({
    retry: () => next({ tag: 'loading', url: ctx.lastUrl, startedAt: Date.now() }),
    clear: () => next({ tag: 'idle' })
  })
});

type FetchState = UnionOf<typeof fetchFlow>;

const state1 = fetchFlow({ tag: 'idle' }).fetch('/api/users');
const state2 = state1.succeed({ users: ['alice', 'bob'] });
console.log(state2.tag);     // 'success'
console.log(state2.data);    // { users: ['alice', 'bob'] }

// ============================================================================
// EXAMPLE 5: Timer with Effects
// ============================================================================

const timerFlow = union<
  { tag: 'stopped'; elapsed: number } |
  { tag: 'running'; elapsed: number } |
  { tag: 'paused'; elapsed: number }
>()({
  stopped: (ctx, next) => ({
    start: () => next({ tag: 'running', elapsed: ctx.elapsed }),
    reset: () => next({ tag: 'stopped', elapsed: 0 })
  }),
  running: (ctx, next) => ({
    tick: () => next({ ...ctx, elapsed: ctx.elapsed + 1 }),
    pause: () => next({ tag: 'paused', elapsed: ctx.elapsed }),
    stop: () => next({ tag: 'stopped', elapsed: ctx.elapsed })
  }),
  paused: (ctx, next) => ({
    resume: () => next({ tag: 'running', elapsed: ctx.elapsed }),
    stop: () => next({ tag: 'stopped', elapsed: ctx.elapsed })
  })
});

const initialTimer = timerFlow({ tag: 'stopped', elapsed: 0 });

// Add lifecycle effects
const timerWithEffects = runnable(initialTimer, {
  running: {
    onEnter: (send) => {
      console.log('Timer started');
      const id = setInterval(() => send('tick'), 1000);
      return () => {
        console.log('Timer stopped');
        clearInterval(id);
      };
    }
  }
});

// ============================================================================
// EXAMPLE 6: Nested Machines (Parent/Children)
// ============================================================================

const volume = machine({ level: 50 }, (ctx, next) => ({
  up: () => next({ level: Math.min(100, ctx.level + 10) }),
  down: () => next({ level: Math.max(0, ctx.level - 10) }),
  set: (level: number) => next({ level: Math.max(0, Math.min(100, level)) }),
  mute: () => next({ level: 0 })
}));

const playback = union<{ tag: 'stopped' } | { tag: 'playing' } | { tag: 'paused' }>()({
  stopped: (ctx, next) => ({
    play: () => next({ tag: 'playing' })
  }),
  playing: (ctx, next) => ({
    pause: () => next({ tag: 'paused' }),
    stop: () => next({ tag: 'stopped' })
  }),
  paused: (ctx, next) => ({
    play: () => next({ tag: 'playing' }),
    stop: () => next({ tag: 'stopped' })
  })
})({ tag: 'stopped' });

// Compose into a media player
const player = withChildren(
  { name: 'Media Player', track: 'song.mp3' },
  { volume, playback }
);

// Chain operations across children (Perfectly typed!)
const next1 = player
  .volume.up()
  .volume.up()
  .playback.play()
  .volume.down();

console.log(next1.volume.level);    // 60
console.log(next1.playback.tag);    // 'playing'

// ============================================================================
// EXAMPLE 7: Form Validation (Guards)
// ============================================================================

interface FormData {
  email: string;
  password: string;
  confirmPassword: string;
}

interface ValidationError {
  field: string;
  message: string;
}

type FormContext = FormData & { errors: ValidationError[] };

const formFlow = union<
  { tag: 'editing' } & FormContext |
  { tag: 'submitting' } & FormData |
  { tag: 'success' }
>()({
  editing: (ctx, next) => ({
    setEmail: (email: string) => next({ ...ctx, email, errors: [] }),
    setPassword: (password: string) => next({ ...ctx, password, errors: [] }),
    setConfirmPassword: (confirmPassword: string) =>
      next({ ...ctx, confirmPassword, errors: [] }),

    submit: () => {
      const errors: ValidationError[] = [];
      if (!ctx.email.includes('@')) errors.push({ field: 'email', message: 'Invalid email' });
      if (ctx.password.length < 8) errors.push({ field: 'password', message: 'Too short' });
      if (ctx.password !== ctx.confirmPassword) errors.push({ field: 'confirmPassword', message: 'No match' });

      if (errors.length > 0) return next({ ...ctx, errors });
      return next({ tag: 'submitting', email: ctx.email, password: ctx.password, confirmPassword: ctx.confirmPassword });
    }
  }),
  submitting: (ctx, next) => ({
    succeed: () => next({ tag: 'success' }),
    fail: (message: string) => {
      const { tag: _, ...data } = ctx;
      return next({ tag: 'editing', ...data, errors: [{ field: 'form', message }] });
    }
  }),
  success: (ctx, next) => ({
    reset: () => next({ tag: 'editing', email: '', password: '', confirmPassword: '', errors: [] })
  })
});

const form = formFlow({ tag: 'editing', email: '', password: '', confirmPassword: '', errors: [] });
const attempt1 = form.setEmail('invalid').submit();
console.log(attempt1.tag); // 'editing'

// ============================================================================
// EXAMPLE 8: Using Type Guards
// ============================================================================

function handleAuthState(state: AuthState) {
  if (isState(state, 'loggedIn')) {
    console.log(`Welcome, ${state.user.name}!`);
    return state.refreshToken('newToken');
  } else {
    console.log('Please log in');
    return state;
  }
}

// ============================================================================
// EXAMPLE 9: Factory Pattern for Reusable Machines
// ============================================================================

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
}

const createTodo = factory<TodoItem>()((ctx, next) => ({
  toggle: () => next({ ...ctx, completed: !ctx.completed }),
  setText: (text: string) => next({ ...ctx, text }),
  complete: () => next({ ...ctx, completed: true }),
  uncomplete: () => next({ ...ctx, completed: false })
}));

const todo1 = createTodo({ id: '1', text: 'Learn typestate', completed: false });
console.log(todo1.toggle().completed); // true

// ============================================================================
// EXAMPLE 10: Search Union (Compact)
// ============================================================================

type SearchStateMap = States<{
  idle: {},
  loading: { query: string },
  success: { data: string[] },
  error: { message: string }
}>;

const quickSearch = union<SearchStateMap>()({
  idle: (ctx, next) => ({
    search: (query: string) => next(tag('loading', { query }))
  }),
  loading: (ctx, next) => ({
    succeed: (data: string[]) => next(tag('success', { data })),
    fail: (message: string) => next(tag('error', { message }))
  }),
  success: (ctx, next) => ({
    reset: () => next(tag('idle'))
  }),
  error: (ctx, next) => ({
    retry: () => next(tag('loading', { query: 'retry' })),
    cancel: () => next(tag('idle'))
  })
});

const s1 = quickSearch(tag('idle'));
const s2 = s1.search('books').succeed(['Book A']).reset();
console.log('Final Search State:', s2.tag);
