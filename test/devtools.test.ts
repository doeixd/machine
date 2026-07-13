import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAsyncMachine } from '../src/index';
import { connectToDevTools, type MachineDevTools } from '../src/devtools';

describe('DevTools integration', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
  });

  it('reports initial context, events, and state changes', async () => {
    const devTools: MachineDevTools = { init: vi.fn(), send: vi.fn() };
    Object.defineProperty(globalThis, 'window', {
      value: { __MACHINE_DEVTOOLS__: devTools },
      configurable: true,
      writable: true,
    });
    const machine = createAsyncMachine({ status: 'idle' as string }, {
      async load(_options: { signal: AbortSignal }) {
        return createAsyncMachine({ status: 'loaded' }, this);
      },
    });

    const runner = connectToDevTools(machine);
    await runner.dispatch({ type: 'load', args: [] });

    expect(devTools.init).toHaveBeenCalledWith({ status: 'idle' });
    expect(devTools.send).toHaveBeenCalledWith({
      type: 'STATE_CHANGED',
      payload: {
        event: { type: 'load', args: [] },
        context: { status: 'loaded' },
        currentState: 'loaded',
      },
    });
  });

  it('does not let an optional DevTools failure break transitions', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    Object.defineProperty(globalThis, 'window', {
      value: {
        __MACHINE_DEVTOOLS__: {
          init: () => { throw new Error('init failed'); },
          send: () => { throw new Error('send failed'); },
        },
      },
      configurable: true,
      writable: true,
    });
    const machine = createAsyncMachine({ status: 'idle' as string }, {
      async load(_options: { signal: AbortSignal }) {
        return createAsyncMachine({ status: 'loaded' }, this);
      },
    });

    const runner = connectToDevTools(machine);
    await expect(runner.dispatch({ type: 'load', args: [] })).resolves.toBeDefined();
    expect(runner.state.status).toBe('loaded');
    expect(warning).toHaveBeenCalledTimes(2);
    warning.mockRestore();
  });
});
