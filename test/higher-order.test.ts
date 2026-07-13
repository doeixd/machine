import { describe, expect, it, vi } from 'vitest';
import { createMachine } from '../src/index';
import { MachineBase } from '../src/base';
import { createFetchMachine, createParallelMachine, delegateToChild, toggle } from '../src/higher-order';

describe('higher-order machines', () => {
  it('executes configured fetches and resolves to success', async () => {
    const fetcher = vi.fn(async (id: number) => ({ id, name: 'Ada' }));
    const onSuccess = vi.fn();
    const idle = createFetchMachine({ fetcher, onSuccess });
    if (idle.context.status !== 'idle') throw new Error('expected idle');

    const loading = idle.fetch(7);
    const result = await loading.done();

    expect(fetcher).toHaveBeenCalledWith(7, { signal: expect.any(AbortSignal) });
    expect(result.context).toEqual({ status: 'success', data: { id: 7, name: 'Ada' } });
    expect(onSuccess).toHaveBeenCalledWith({ id: 7, name: 'Ada' });
  });

  it('produces retrying and final error typestates', async () => {
    const cause = new Error('offline');
    const fetcher = vi.fn(async () => { throw cause; });
    const onError = vi.fn();
    const idle = createFetchMachine({ fetcher, maxRetries: 1, onError });
    if (idle.context.status !== 'idle') throw new Error('expected idle');

    const first = await idle.fetch().done();
    expect(first.context.status).toBe('retrying');
    if (first.context.status !== 'retrying') throw new Error('expected retrying');

    const final = await first.retry().done();
    expect(final.context).toEqual({ status: 'error', error: cause });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledWith(cause);
  });

  it('aborts active fetches and resolves completion as canceled', async () => {
    let observedSignal: AbortSignal | undefined;
    const idle = createFetchMachine<never, Error, string>({
      fetcher: (_url, { signal }) => {
        observedSignal = signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      },
    });
    if (idle.context.status !== 'idle') throw new Error('expected idle');

    const loading = idle.fetch('/api');
    const canceled = loading.cancel();
    const completion = await loading.done();

    expect(observedSignal?.aborted).toBe(true);
    expect(canceled.context.status).toBe('canceled');
    expect(completion.context.status).toBe('canceled');
  });

  it('updates one region at a time in parallel machines', () => {
    const left = createMachine({ left: 0 }, (next) => ({
      incrementLeft: () => next({ left: 1 }),
    }));
    const right = createMachine({ right: false }, (next) => ({
      toggleRight: () => next({ right: true }),
    }));

    const parallel = createParallelMachine(left, right);
    const updated = parallel.incrementLeft().toggleRight();

    expect(updated.context).toEqual({ left: 1, right: true });
    expect(parallel.context).toEqual({ left: 0, right: false });
  });

  it('rejects colliding parallel transition names', () => {
    const first = createMachine({ first: 0 }, (next) => ({ next: () => next({ first: 1 }) }));
    const second = createMachine({ second: 0 }, (next) => ({ next: () => next({ second: 1 }) }));

    expect(() => createParallelMachine(first, second)).toThrow(
      "transition 'next' exists on both machines"
    );
  });

  it('supports prototype transitions in parallel class machines', () => {
    class Left extends MachineBase<{ left: number }> {
      increment() { return new Left({ left: this.context.left + 1 }); }
    }
    class Right extends MachineBase<{ right: boolean }> {
      toggle() { return new Right({ right: !this.context.right }); }
    }

    const updated = createParallelMachine(
      new Left({ left: 0 }),
      new Right({ right: false }),
    ).increment().toggle();

    expect(updated.context).toEqual({ left: 1, right: true });
  });

  it('binds delegated prototype methods to their child', () => {
    class Child extends MachineBase<{ count: number }> {
      increment() { return new Child({ count: this.context.count + 1 }); }
    }
    class Parent extends MachineBase<{ child: Child }> {
      incrementChild = delegateToChild<Parent, 'increment'>('increment');
    }

    const updated = new Parent({ child: new Child({ count: 0 }) }).incrementChild();
    expect(updated.context.child.context.count).toBe(1);
  });

  it('rejects overlapping parallel context and invalid toggles', () => {
    const first = createMachine({ value: 1 }, {});
    const second = createMachine({ value: 2 }, {});
    expect(() => createParallelMachine(first, second)).toThrow(
      "context key 'value' exists on both machines"
    );

    const invalidToggle = toggle<any, any>('value');
    expect(() => invalidToggle.call({ context: { value: 1 } })).toThrow(
      "Cannot toggle non-boolean context property 'value'"
    );
  });
});
