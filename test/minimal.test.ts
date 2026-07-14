import { describe, expect, it, vi } from 'vitest';
import {
  factory,
  machine,
  match,
  run,
  runnable,
  tag,
  union,
  withChildren,
  type States,
  type UnionOf,
} from '../src/minimal';

describe('minimal API', () => {
  it('creates immutable flat snapshots with machine', () => {
    const counter = machine({ count: 0 }, (state, next) => ({
      increment: () => next({ count: state.count + 1 }),
    }));

    const updated = counter.increment();
    expect(counter.count).toBe(0);
    expect(updated.count).toBe(1);
  });

  it('preserves single-state transition chains with factory', () => {
    const createCounter = factory<{ count: number }>()((state, next) => ({
      increment: () => next({ count: state.count + 1 }),
      add: (amount: number) => next({ count: state.count + amount }),
    }));

    expect(createCounter({ count: 0 }).increment().add(4).count).toBe(5);
  });

  it('routes tagged typestates and matches them exhaustively', () => {
    type FetchState = States<{
      idle: {};
      loading: { url: string };
      success: { data: string };
    }>;

    const createFetch = union<FetchState>()({
      idle: (_state, next) => ({
        load: (url: string) => next(tag('loading', { url })),
      }),
      loading: (_state, next) => ({
        resolve: (data: string) => next(tag('success', { data })),
        cancel: () => next(tag('idle')),
      }),
      success: (_state, next) => ({
        reset: () => next(tag('idle')),
      }),
    });

    type FetchMachine = UnionOf<typeof createFetch>;
    const success: FetchMachine = createFetch(tag('idle')).load('/api').resolve('done');

    expect(match(success, {
      idle: () => 'idle',
      loading: state => state.url,
      success: state => state.data,
    })).toBe('done');
  });

  it('creates named factories with tag.enum', () => {
    const Status = tag.enum(tag('idle'), tag('loading'), tag('success'));

    expect(Status.idle()).toEqual({ tag: 'idle' });
    expect(Status.loading({ url: '/api' })).toEqual({
      tag: 'loading',
      url: '/api',
    });
    expect(Object.isFrozen(Status)).toBe(true);
    expect(() => tag.enum(tag('idle'), tag('idle'))).toThrow(
      "duplicate tag 'idle'",
    );
  });

  it('runs entry lifecycles and cleans them up', () => {
    type ToggleState = States<{ off: {}; on: {} }>;
    const createToggle = union<ToggleState>()({
      off: (_state, next) => ({ turnOn: () => next(tag('on')) }),
      on: (_state, next) => ({ turnOff: () => next(tag('off')) }),
    });
    const entered = vi.fn();
    const cleaned = vi.fn();
    const runner = run(runnable(createToggle(tag('off')), {
      off: { onEnter: () => { entered('off'); return cleaned; } },
      on: { onEnter: () => { entered('on'); return cleaned; } },
    }));

    const listener = vi.fn();
    runner.subscribe(listener);
    runner.send('turnOn');

    expect(runner.get().tag).toBe('on');
    expect(entered).toHaveBeenCalledWith('on');
    expect(cleaned).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);

    runner.stop();
    expect(cleaned).toHaveBeenCalledTimes(2);
  });

  it('composes child snapshots under a parent', () => {
    const createCounter = factory<{ count: number }>()((state, next) => ({
      increment: () => next({ count: state.count + 1 }),
    }));
    const parent = withChildren(
      { name: 'dashboard' },
      { counter: createCounter({ count: 0 }) },
    );

    const updated = parent.counter.increment();
    expect(parent.counter.count).toBe(0);
    expect(updated.name).toBe('dashboard');
    expect(updated.counter.count).toBe(1);
  });
});
