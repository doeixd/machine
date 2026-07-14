import { factory, run, runnable, tag, union, type States, type UnionOf } from '../../src/minimal';

const createCounter = factory<{ count: number }>()((state, next) => ({
  increment: () => next({ count: state.count + 1 }),
  add: (amount: number) => next({ count: state.count + amount }),
}));

const counter = createCounter({ count: 0 });
counter.increment().add(2);
// @ts-expect-error counter transitions require their declared arguments
counter.add();

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
const idle: FetchMachine = createFetch(tag('idle'));
const loading = idle.load('/api');
loading.resolve('done');
// @ts-expect-error loading states cannot start another load
loading.load('/again');

const runner = run(runnable<FetchMachine>(idle, {}));
runner.send('load', '/api');
runner.send('resolve', 'done');
runner.send('reset');
// @ts-expect-error unknown transition name
runner.send('missing');
// @ts-expect-error load requires a URL
runner.send('load');

const Status = tag.enum(tag('idle'), tag('loading'), tag('success'));
const enumIdle: { readonly tag: 'idle' } = Status.idle();
const enumLoading: { readonly tag: 'loading'; url: string } =
  Status.loading({ url: '/api' });
void enumIdle;
void enumLoading;
// @ts-expect-error enum members are limited to the declared tags
Status.missing();
// @ts-expect-error enum payloads must be objects
Status.loading('api');
// @ts-expect-error payloads cannot override the enum member's tag
Status.loading({ tag: 'idle', url: '/api' });

const state = tag.factory<FetchState>();
state('loading')({ url: '/api' });
// @ts-expect-error tag factories are constrained to the tagged union
state('missing')({});

union<FetchState>()({
  idle: (_state, next) => ({
    // @ts-expect-error next rejects tags outside the declared union
    invalid: () => next(tag('missing')),
  }),
  loading: (_state, next) => ({
    // @ts-expect-error next requires the selected tag's payload
    invalid: () => next(tag('success')),
  }),
  success: (_state, next) => ({ reset: () => next(tag('idle')) }),
});
