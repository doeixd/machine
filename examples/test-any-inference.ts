import { machine, union, tag, States } from '../src/minimal';

// Case 1: factory()
export function typedFactory<C extends object>() {
  return <T>(
    transitionFactory: (ctx: C, next: (context: C) => C & T) => T
  ) => {
    type M = C & T;
    const resultFactory = (context: C): M => {
      const next = (c: C) => resultFactory(c);
      return machine(context, (ctx: any) => transitionFactory(ctx, next as any)) as any;
    };
    return resultFactory;
  };
}

const counterFactory = typedFactory<{ count: number }>()((ctx, next) => ({
  inc: () => next({ count: ctx.count + 1 }),
  noop: () => next(ctx)
}));

const counter = counterFactory({ count: 0 });
const valIncTyped = counter.inc();
// @ts-expect-error - Expected error because it's NOT any
valIncTyped.somethingRandom;

// Case 2: union()
type State = States<{
  idle: {},
  active: { count: number }
}>;

const flow = union<State>()({
  idle: (ctx, next) => ({
    start: () => next(tag('active', { count: 0 }))
  }),
  active: (ctx, next) => ({
    inc: () => next(tag('active', { count: ctx.count + 1 }))
  })
});

const m = flow(tag('idle'));
const valStart = m.start();
// @ts-expect-error - If this errors with "Unused", then it's 'any'
valStart.somethingElse;
