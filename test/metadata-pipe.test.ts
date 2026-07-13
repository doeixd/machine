import { Project } from 'ts-morph';
import { describe as suite, expect, expectTypeOf, it } from 'vitest';
import { extractMachine } from '../src/extract';
import {
  action,
  describe,
  guarded,
  metadata,
  pipe,
  transitionTo,
  type MetadataOf,
} from '../src/index';
import { RUNTIME_META } from '../src/primitives';

suite('pipeable metadata', () => {
  it('composes annotations without changing the transition signature', () => {
    class LoggedIn {
      constructor(readonly username: string) {}
    }

    const login = pipe(
      (username: string) => new LoggedIn(username),
      transitionTo(LoggedIn),
      describe('Log in'),
      guarded({ name: 'hasUsername' }),
      action({ name: 'auditLogin' }),
    );

    expect(login('pat')).toEqual(new LoggedIn('pat'));
    expectTypeOf(login).parameters.toEqualTypeOf<[username: string]>();
    expectTypeOf(login).returns.toEqualTypeOf<LoggedIn>();

    const runtimeMeta = login[RUNTIME_META];
    expect(runtimeMeta).toMatchObject({
      target: 'LoggedIn',
      description: 'Log in',
      guards: [{ name: 'hasUsername' }],
      actions: [{ name: 'auditLogin' }],
    });

    type LoginMeta = MetadataOf<typeof login>;
    expectTypeOf<LoginMeta>().toMatchTypeOf<{
      target: typeof LoggedIn;
      description: string;
    }>();
  });

  it('preserves decorator ordering across direct and pipe forms', () => {
    class Target {}
    const implementation = () => new Target();

    const piped = pipe(
      implementation,
      transitionTo(Target),
      action({ name: 'inner' }),
      action({ name: 'outer' }),
    );
    const nested = action(
      { name: 'outer' },
      action({ name: 'inner' }, transitionTo(Target, () => new Target())),
    );

    expect(piped[RUNTIME_META]?.actions).toEqual(nested[RUNTIME_META]?.actions);
    expect(piped[RUNTIME_META]?.actions?.map(item => item.name)).toEqual(['outer', 'inner']);
  });

  it('annotates an object without changing its identity', () => {
    const value = { status: 'idle' as const };
    const annotated = pipe(value, metadata({ description: 'Initial state' }));

    expect(annotated).toBe(value);
    expect(annotated[RUNTIME_META]).toEqual({ description: 'Initial state' });
    expect(Object.keys(annotated)).toEqual(['status']);

    type ValueMeta = MetadataOf<typeof annotated>;
    expectTypeOf<ValueMeta>().toMatchTypeOf<{ description: string }>();
  });

  it('normalizes class references in generic runtime metadata', () => {
    class Success {}
    class Failure {}

    const transition = metadata({
      target: Success,
      invoke: { src: 'load', onDone: Success, onError: Failure },
    }, () => new Success());

    expect(transition[RUNTIME_META]).toMatchObject({
      target: 'Success',
      invoke: { src: 'load', onDone: 'Success', onError: 'Failure' },
    });
  });

  it('extracts piped decorators statically', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('/machine.ts', `
      class LoggedIn {}
      class LoggedOut {
        login = pipe(
          (username: string) => new LoggedIn(),
          transitionTo(LoggedIn),
          describe('Log in'),
          guarded({ name: 'hasUsername' }),
          action({ name: 'auditLogin' })
        );
      }
    `);

    const chart = extractMachine({
      id: 'auth',
      input: '/machine.ts',
      initialState: 'LoggedOut',
      classes: ['LoggedOut', 'LoggedIn'],
    }, project);

    expect(chart.states.LoggedOut.on.login).toEqual({
      target: 'LoggedIn',
      description: 'Log in',
      cond: 'hasUsername',
      actions: ['auditLogin'],
    });
  });
});
