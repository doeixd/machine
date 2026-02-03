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
  type Tagged
} from '../src/minimal';

// ============================================================================
// EXAMPLE 1: Simple Counter
// ============================================================================

const counter = machine({ count: 0 }, (ctx, next) => ({
  inc: () => next({ count: ctx.count + 1 }),
  dec: () => next({ count: ctx.count - 1 }),
  add: (n: number) => next({ count: ctx.count + n }),
  reset: () => next({ count: 0 })
}));

// Usage
console.log(counter.count);                    // 0
console.log(counter.inc().count);              // 1
console.log(counter.inc().inc().dec().count);  // 1
console.log(counter.add(10).count);            // 10
console.log(counter.count);                    // 0 (immutable)

// Chaining
const result = counter.inc().inc().add(5).dec().count;
console.log(result); // 6

// ============================================================================
// EXAMPLE 2: Traffic Light (Cyclic Typestate)
// ============================================================================

const green = machine({ tag: 'green' as const }, (ctx, next) => ({
  change: () => yellow
}));

const yellow = machine({ tag: 'yellow' as const }, (ctx, next) => ({
  change: () => red
}));

const red = machine({ tag: 'red' as const }, (ctx, next) => ({
  change: () => green
}));

type TrafficLight = typeof green | typeof yellow | typeof red;

// Usage
console.log(green.tag);                        // 'green'
console.log(green.change().tag);               // 'yellow'
console.log(green.change().change().tag);      // 'red'
console.log(green.change().change().change().tag); // 'green'

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

const loggedOut = machine({ tag: 'loggedOut' as const }, (ctx, next) => ({
  login: (user: User, token: string) => loggedIn(user, token)
}));

const loggedIn = (user: User, token: string) =>
  machine({ tag: 'loggedIn' as const, user, token }, (ctx, next) => ({
    logout: () => loggedOut,
    refreshToken: (newToken: string) => loggedIn(ctx.user, newToken),
    updateProfile: (updates: Partial<User>) =>
      loggedIn({ ...ctx.user, ...updates }, ctx.token)
  }));

type AuthState = typeof loggedOut | ReturnType<typeof loggedIn>;

// Usage
const alice: User = { id: '1', name: 'Alice', email: 'alice@example.com' };

const session = loggedOut.login(alice, 'token123');
console.log(session.user.name);  // 'Alice'
console.log(session.token);      // 'token123'

const updated = session.updateProfile({ name: 'Alicia' });
console.log(updated.user.name);  // 'Alicia'

const loggedOutAgain = updated.logout();
console.log(loggedOutAgain.tag); // 'loggedOut'
// loggedOutAgain.user;          // TypeError: Property 'user' does not exist

// ============================================================================
// EXAMPLE 4: Data Fetching (Async States)
// ============================================================================

interface FetchError {
  code: number;
  message: string;
}

const idle = machine({ tag: 'idle' as const }, (ctx, next) => ({
  fetch: (url: string) => loading(url)
}));

const loading = (url: string) =>
  machine({ tag: 'loading' as const, url, startedAt: Date.now() }, (ctx, next) => ({
    succeed: <T>(data: T) => success(data),
    fail: (error: FetchError) => failure(error, ctx.url),
    cancel: () => idle
  }));

const success = <T>(data: T) =>
  machine({ tag: 'success' as const, data }, (ctx, next) => ({
    refetch: (url: string) => loading(url),
    clear: () => idle
  }));

const failure = (error: FetchError, lastUrl: string) =>
  machine({ tag: 'failure' as const, error, lastUrl }, (ctx, next) => ({
    retry: () => loading(ctx.lastUrl),
    clear: () => idle
  }));

type FetchState<T = unknown> =
  | typeof idle
  | ReturnType<typeof loading>
  | ReturnType<typeof success<T>>
  | ReturnType<typeof failure>;

// Usage
const state1 = idle.fetch('/api/users');
console.log(state1.tag);     // 'loading'
console.log(state1.url);     // '/api/users'

const state2 = state1.succeed({ users: ['alice', 'bob'] });
console.log(state2.tag);     // 'success'
console.log(state2.data);    // { users: ['alice', 'bob'] }

const state3 = idle.fetch('/api/fail').fail({ code: 500, message: 'Server error' });
console.log(state3.tag);     // 'failure'
console.log(state3.error.message); // 'Server error'
console.log(state3.retry().url);   // '/api/fail'

// ============================================================================
// EXAMPLE 5: Timer with Effects
// ============================================================================

const stopped = machine({ tag: 'stopped' as const, elapsed: 0 }, (ctx, next) => ({
  start: () => running(ctx.elapsed),
  reset: () => next({ tag: 'stopped' as const, elapsed: 0 })
}));

const running = (elapsed: number) =>
  machine({ tag: 'running' as const, elapsed }, (ctx, next) => ({
    tick: () => running(ctx.elapsed + 1),
    pause: () => paused(ctx.elapsed),
    stop: () => stopped
  }));

const paused = (elapsed: number) =>
  machine({ tag: 'paused' as const, elapsed }, (ctx, next) => ({
    resume: () => running(ctx.elapsed),
    stop: () => stopped
  }));

type TimerState = typeof stopped | ReturnType<typeof running> | ReturnType<typeof paused>;

// Add lifecycle effects
const timerWithEffects = runnable(stopped, {
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

// Usage with runner
const timer = run(timerWithEffects);

timer.subscribe((state) => {
  console.log(`[${state.tag}] elapsed: ${state.elapsed}`);
});

timer.send('start');  // Logs: "Timer started", starts interval
// Every second: logs "[running] elapsed: 1", "[running] elapsed: 2", ...

setTimeout(() => {
  timer.send('pause');  // Logs: "Timer stopped", clears interval
  console.log('Paused at:', timer.get().elapsed);

  setTimeout(() => {
    timer.send('resume'); // Logs: "Timer started", new interval

    setTimeout(() => {
      timer.stop();       // Final cleanup
    }, 3000);
  }, 2000);
}, 5000);

// ============================================================================
// EXAMPLE 6: Nested Machines (Parent/Children)
// ============================================================================

const volume = machine({ level: 50 }, (ctx, next) => ({
  up: () => next({ level: Math.min(100, ctx.level + 10) }),
  down: () => next({ level: Math.max(0, ctx.level - 10) }),
  set: (level: number) => next({ level: Math.max(0, Math.min(100, level)) }),
  mute: () => next({ level: 0 })
}));

const playback = machine({ tag: 'stopped' as const }, (ctx, next) => ({
  play: () => playbackPlaying,
  // Can't pause/stop when already stopped
}));

const playbackPlaying = machine({ tag: 'playing' as const }, (ctx, next) => ({
  pause: () => playbackPaused,
  stop: () => playback
}));

const playbackPaused = machine({ tag: 'paused' as const }, (ctx, next) => ({
  play: () => playbackPlaying,
  stop: () => playback
}));

// Compose into a media player
const player = withChildren(
  { name: 'Media Player', track: 'song.mp3' },
  { volume, playback }
);

// Usage
console.log(player.name);           // 'Media Player'
console.log(player.volume.level);   // 50
console.log(player.playback.tag);   // 'stopped'

// Chain operations across children
const next1 = player
  .volume.up()
  .volume.up()
  .playback.play()
  .volume.down();

console.log(next1.volume.level);    // 60
console.log(next1.playback.tag);    // 'playing'

// Original unchanged
console.log(player.volume.level);   // 50

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

const formEditing = (data: FormData, errors: ValidationError[] = []) =>
  machine({ tag: 'editing' as const, ...data, errors }, (ctx, next) => ({
    setEmail: (email: string) => formEditing({ ...data, email }, []),
    setPassword: (password: string) => formEditing({ ...data, password }, []),
    setConfirmPassword: (confirmPassword: string) =>
      formEditing({ ...data, confirmPassword }, []),

    submit: () => {
      // Guards are just if statements
      const errors: ValidationError[] = [];

      if (!ctx.email.includes('@')) {
        errors.push({ field: 'email', message: 'Invalid email address' });
      }
      if (ctx.password.length < 8) {
        errors.push({ field: 'password', message: 'Password must be 8+ characters' });
      }
      if (ctx.password !== ctx.confirmPassword) {
        errors.push({ field: 'confirmPassword', message: 'Passwords do not match' });
      }

      if (errors.length > 0) {
        return next({ ...ctx, errors });
      }

      return formSubmitting(data);
    }
  }));

const formSubmitting = (data: FormData) =>
  machine({ tag: 'submitting' as const, ...data }, (ctx, next) => ({
    succeed: () => formSuccess(),
    fail: (message: string) => formEditing(data, [{ field: 'form', message }])
  }));

const formSuccess = () =>
  machine({ tag: 'success' as const }, (ctx, next) => ({
    reset: () => formEditing({ email: '', password: '', confirmPassword: '' })
  }));

// Usage
const form = formEditing({ email: '', password: '', confirmPassword: '' });

const attempt1 = form
  .setEmail('invalid')
  .setPassword('short')
  .submit();

console.log(attempt1.tag);     // 'editing'
console.log(attempt1.errors);  // [{ field: 'email', ... }, { field: 'password', ... }]

const attempt2 = form
  .setEmail('alice@example.com')
  .setPassword('securepassword123')
  .setConfirmPassword('securepassword123')
  .submit();

console.log(attempt2.tag);     // 'submitting'

// ============================================================================
// EXAMPLE 8: Using Type Guards
// ============================================================================

function handleAuthState(state: AuthState) {
  if (isState(state, 'loggedIn')) {
    // TypeScript knows: state has user, token, logout, refreshToken, updateProfile
    console.log(`Welcome, ${state.user.name}!`);
    return state.refreshToken('newToken');
  } else {
    // TypeScript knows: state only has login
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

// Create multiple instances
const todo1 = createTodo({ id: '1', text: 'Learn typestate', completed: false });
const todo2 = createTodo({ id: '2', text: 'Build app', completed: false });
const todo3 = createTodo({ id: '3', text: 'Ship it', completed: true });

console.log(todo1.toggle().completed); // true
console.log(todo2.setText('Build awesome app').text); // 'Build awesome app'

// ============================================================================
// EXAMPLE 10: Complex Workflow (Multi-Step Process)
// ============================================================================

interface OrderData {
  items: string[];
  shippingAddress?: string;
  paymentMethod?: string;
}

const orderCart = (items: string[]) =>
  machine({ tag: 'cart' as const, items }, (ctx, next) => ({
    addItem: (item: string) => orderCart([...ctx.items, item]),
    removeItem: (item: string) => orderCart(ctx.items.filter(i => i !== item)),
    checkout: () => ctx.items.length > 0 ? orderShipping(ctx.items) : next(ctx)
  }));

const orderShipping = (items: string[]) =>
  machine({ tag: 'shipping' as const, items, shippingAddress: '' }, (ctx, next) => ({
    setAddress: (address: string) => next({ ...ctx, shippingAddress: address }),
    back: () => orderCart(ctx.items),
    continue: () => ctx.shippingAddress
      ? orderPayment(ctx.items, ctx.shippingAddress)
      : next(ctx)
  }));

const orderPayment = (items: string[], shippingAddress: string) =>
  machine(
    { tag: 'payment' as const, items, shippingAddress, paymentMethod: '' },
    (ctx, next) => ({
      setPayment: (method: string) => next({ ...ctx, paymentMethod: method }),
      back: () => orderShipping(ctx.items),
      submit: () => ctx.paymentMethod
        ? orderConfirmation(ctx.items, ctx.shippingAddress, ctx.paymentMethod)
        : next(ctx)
    })
  );

const orderConfirmation = (items: string[], address: string, payment: string) =>
  machine(
    { tag: 'confirmation' as const, items, address, payment, orderId: crypto.randomUUID() },
    (ctx, next) => ({
      newOrder: () => orderCart([])
    })
  );

type OrderState =
  | ReturnType<typeof orderCart>
  | ReturnType<typeof orderShipping>
  | ReturnType<typeof orderPayment>
  | ReturnType<typeof orderConfirmation>;

// Usage
const order = orderCart([])
  .addItem('Widget')
  .addItem('Gadget')
  .checkout()
  .setAddress('123 Main St')
  .continue()
  .setPayment('credit_card')
  .submit();

console.log(order.tag);      // 'confirmation'
console.log(order.orderId);  // uuid
console.log(order.items);    // ['Widget', 'Gadget']

// Full workflow rendering
function renderOrder(state: OrderState): string {
  return match(state, {
    cart: (s) => `Cart: ${s.items.length} items`,
    shipping: (s) => `Shipping to: ${s.shippingAddress || '(enter address)'}`,
    payment: (s) => `Payment: ${s.paymentMethod || '(select method)'}`,
    confirmation: (s) => `Order ${s.orderId} confirmed!`
  });
}

console.log(renderOrder(order)); // "Order abc-123... confirmed!"
// ============================================================================

// EXAMPLE: Search Union
// ============================================================================


type SearchState =
  | { tag: 'idle' }
  | { tag: 'loading'; query: string }
  | { tag: 'success'; data: string[] }
  | { tag: 'error'; message: string };

const searchFlow = union<SearchState>()({
  idle: (ctx, next) => ({
    search: (query: string) => next({ tag: 'loading', query })
  }),
  loading: (ctx, next) => ({
    succeed: (data: string[]) => next({ tag: 'success', data }),
    fail: (message: string) => next({ tag: 'error', message })
  }),
  success: (ctx, next) => ({
    reset: () => next({ tag: 'idle' })
  }),
  error: (ctx, next) => ({
    retry: () => next({ tag: 'loading', query: 'previous' }),
    cancel: () => next({ tag: 'idle' })
  })
});

const s1 = searchFlow({ tag: 'idle' });
const s2 = s1.search('books');
console.log('S2 Status:', s2.tag, 'Query:', s2.query);

const s3 = s2.succeed(['Book A', 'Book B']);
console.log('S3 Status:', s3.tag, 'Data:', s3.data);

const s4 = s3.reset();
console.log('S4 Status:', s4.tag);

const s5 = searchFlow({ tag: 'error', message: 'Failed' });
const s6 = s5.retry();
console.log('S6 Status:', s6.tag, 'Query:', s6.query);

console.log('--- SEARCH SUCCESS ---');

