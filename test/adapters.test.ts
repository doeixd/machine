import { describe, expect, it, vi } from 'vitest';
import { createMachine } from '../src/index';
import { asEventEmitter, asEventTarget, asObservable } from '../src/adapters';

function createCounter() {
  return createMachine({ count: 0 }, (next) => ({
    increment: () => next({ count: 1 }),
    fail: () => { throw new Error('transition failed'); },
  }));
}

describe('event adapters', () => {
  it('routes EventTarget dispatches into transitions', () => {
    const target = asEventTarget(createCounter());
    const listener = vi.fn();
    target.addMachineEventListener('statechange', listener);

    target.dispatch('increment');

    expect(target.context.count).toBe(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: { state: expect.objectContaining({ context: { count: 1 } }) },
    }));
  });

  it('turns EventTarget transition failures into error events', () => {
    const target = asEventTarget(createCounter());
    const listener = vi.fn();
    target.addMachineEventListener('error', listener);

    target.dispatch('fail');

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: { error: expect.objectContaining({ message: 'transition failed' }) },
    }));
  });

  it('keeps EventEmitter transitions and errors on their channels', () => {
    const emitter = asEventEmitter(createCounter());
    const changes = vi.fn();
    const errors = vi.fn();
    emitter.on('statechange', changes);
    emitter.on('error', errors);

    emitter.dispatch('increment');
    emitter.dispatch('fail');

    expect(emitter.context.count).toBe(1);
    expect(changes).toHaveBeenCalledOnce();
    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ message: 'transition failed' }));
  });

  it('implements Observable initial, error, and completion behavior', () => {
    const observable = asObservable(createCounter());
    const observer = { next: vi.fn(), error: vi.fn(), complete: vi.fn() };
    observable.subscribe(observer);

    expect(observer.next).toHaveBeenCalledWith(expect.objectContaining({ context: { count: 0 } }));

    observable.dispatch('increment');
    observable.dispatch('fail');
    observable.complete();
    observable.dispatch('increment');

    expect(observer.next).toHaveBeenCalledTimes(2);
    expect(observer.error).toHaveBeenCalledWith(expect.objectContaining({ message: 'transition failed' }));
    expect(observer.complete).toHaveBeenCalledOnce();

    const late = { next: vi.fn(), complete: vi.fn() };
    observable.subscribe(late);
    expect(late.next).not.toHaveBeenCalled();
    expect(late.complete).toHaveBeenCalledOnce();
  });

  it('registers Observable subscribers before the initial emission', () => {
    const observable = asObservable(createCounter());
    const counts: number[] = [];

    observable.subscribe({
      next(state) {
        counts.push(state.context.count);
        if (state.context.count === 0) observable.dispatch('increment');
      }
    });

    expect(counts).toEqual([0, 1]);
  });

  it('isolates Observable subscribers from each other', () => {
    const observable = asObservable(createCounter());
    const errors = vi.fn();
    const healthy = vi.fn();
    observable.subscribe({
      next(state) {
        if (state.context.count === 1) throw new Error('subscriber failed');
      },
      error: errors,
    });
    observable.subscribe({ next: healthy });

    observable.dispatch('increment');

    expect(errors).toHaveBeenCalledWith(expect.objectContaining({ message: 'subscriber failed' }));
    expect(healthy).toHaveBeenLastCalledWith(expect.objectContaining({ context: { count: 1 } }));
  });

  it('uses the returned typestate transition set', () => {
    type LoggedOut = ReturnType<typeof loggedOut>;
    type LoggedIn = ReturnType<typeof loggedIn>;
    type Auth = LoggedOut | LoggedIn;
    function loggedOut() {
      return createMachine({ status: 'out' as const }, { login: () => loggedIn() });
    }
    function loggedIn() {
      return createMachine({ status: 'in' as const }, { logout: () => loggedOut() });
    }

    const emitter = asEventEmitter(loggedOut() as Auth);
    emitter.dispatch('login');
    expect(emitter.context.status).toBe('in');
    emitter.dispatch('logout');
    expect(emitter.context.status).toBe('out');
  });
});
