import { describe, it, expect } from 'vitest';
import { MachineBase, createMachine } from '../src/index';
import {
  transitionTo,
  describe as desc,
  guarded,
  action,
  invoke,
  RUNTIME_META
} from '../src/primitives';
import {
  extractFunctionMetadata,
  extractStateNode,
  generateStatechart,
  extractFromInstance
} from '../src/runtime-extract';

describe('Runtime Metadata Extraction', () => {
  describe('extractFunctionMetadata', () => {
    it('should return null for non-functions', () => {
      expect(extractFunctionMetadata(null)).toBeNull();
      expect(extractFunctionMetadata(undefined)).toBeNull();
      expect(extractFunctionMetadata(42)).toBeNull();
      expect(extractFunctionMetadata('string')).toBeNull();
    });

    it('should return null for functions without metadata', () => {
      const fn = () => {};
      expect(extractFunctionMetadata(fn)).toBeNull();
    });

    it('should extract metadata from transitionTo', () => {
      class Target {}
      const fn = transitionTo(Target, () => new Target());

      const meta = extractFunctionMetadata(fn);
      expect(meta).not.toBeNull();
      expect(meta?.target).toBe('Target');
    });

    it('should extract metadata from describe', () => {
      class Target {}
      const fn = desc(
        "Test transition",
        transitionTo(Target, () => new Target())
      );

      const meta = extractFunctionMetadata(fn);
      expect(meta?.description).toBe("Test transition");
      expect(meta?.target).toBe("Target");
    });

    it('should extract metadata from guarded', () => {
      class Target {}
      const fn = guarded(
        { name: 'isAdmin' },
        transitionTo(Target, () => new Target())
      );

      const meta = extractFunctionMetadata(fn);
      expect(meta?.guards).toHaveLength(1);
      expect(meta?.guards?.[0].name).toBe('isAdmin');
      expect(meta?.target).toBe('Target');
    });

    it('should extract metadata from action', () => {
      class Target {}
      const fn = action(
        { name: 'logEvent' },
        transitionTo(Target, () => new Target())
      );

      const meta = extractFunctionMetadata(fn);
      expect(meta?.actions).toHaveLength(1);
      expect(meta?.actions?.[0].name).toBe('logEvent');
      expect(meta?.target).toBe('Target');
    });

    it('should extract metadata from invoke', () => {
      class Success {}
      class Error {}

      const fn = invoke(
        {
          src: 'fetchData',
          onDone: Success,
          onError: Error,
          description: 'Fetch user data'
        },
        async () => new Success()
      );

      const meta = extractFunctionMetadata(fn);
      expect(meta?.invoke?.src).toBe('fetchData');
      expect(meta?.invoke?.onDone).toBe('Success');
      expect(meta?.invoke?.onError).toBe('Error');
      expect(meta?.invoke?.description).toBe('Fetch user data');
    });

    it('should compose nested metadata correctly', () => {
      class Target {}

      const fn = desc(
        "Complex transition",
        action(
          { name: 'action1' },
          action(
            { name: 'action2' },
            guarded(
              { name: 'guard1' },
              transitionTo(Target, () => new Target())
            )
          )
        )
      );

      const meta = extractFunctionMetadata(fn);
      expect(meta?.description).toBe("Complex transition");
      expect(meta?.actions).toHaveLength(2);
      expect(meta?.actions?.[0].name).toBe('action1');
      expect(meta?.actions?.[1].name).toBe('action2');
      expect(meta?.guards).toHaveLength(1);
      expect(meta?.guards?.[0].name).toBe('guard1');
      expect(meta?.target).toBe('Target');
    });
  });

  describe('extractStateNode', () => {
    it('should extract simple transitions', () => {
      class Target extends MachineBase<any> {}

      class Source extends MachineBase<any> {
        transition = transitionTo(Target, () => new Target());
      }

      const instance = new Source({ status: 'test' });
      const stateNode = extractStateNode(instance);

      expect(stateNode.on.transition).toEqual({
        target: 'Target'
      });
    });

    it('should extract transitions with descriptions', () => {
      class Target extends MachineBase<any> {}

      class Source extends MachineBase<any> {
        transition = desc(
          "Go to target",
          transitionTo(Target, () => new Target())
        );
      }

      const instance = new Source({ status: 'test' });
      const stateNode = extractStateNode(instance);

      expect(stateNode.on.transition.target).toBe('Target');
      expect(stateNode.on.transition.description).toBe('Go to target');
    });

    it('should extract transitions with guards', () => {
      class Target extends MachineBase<any> {}

      class Source extends MachineBase<any> {
        transition = guarded(
          { name: 'canTransition' },
          transitionTo(Target, () => new Target())
        );
      }

      const instance = new Source({ status: 'test' });
      const stateNode = extractStateNode(instance);

      expect(stateNode.on.transition.target).toBe('Target');
      expect(stateNode.on.transition.cond).toBe('canTransition');
    });

    it('should extract transitions with actions', () => {
      class Target extends MachineBase<any> {}

      class Source extends MachineBase<any> {
        transition = action(
          { name: 'logTransition' },
          transitionTo(Target, () => new Target())
        );
      }

      const instance = new Source({ status: 'test' });
      const stateNode = extractStateNode(instance);

      expect(stateNode.on.transition.target).toBe('Target');
      expect(stateNode.on.transition.actions).toEqual(['logTransition']);
    });

    it('should extract multiple guards as combined condition', () => {
      class Target extends MachineBase<any> {}

      class Source extends MachineBase<any> {
        transition = guarded(
          { name: 'guard1' },
          guarded(
            { name: 'guard2' },
            transitionTo(Target, () => new Target())
          )
        );
      }

      const instance = new Source({ status: 'test' });
      const stateNode = extractStateNode(instance);

      expect(stateNode.on.transition.cond).toBe('guard1 && guard2');
    });

    it('should extract invoke services', () => {
      class Success extends MachineBase<any> {}
      class Error extends MachineBase<any> {}

      class Source extends MachineBase<any> {
        fetchData = invoke(
          {
            src: 'dataService',
            onDone: Success,
            onError: Error
          },
          async () => new Success()
        );
      }

      const instance = new Source({ status: 'test' });
      const stateNode = extractStateNode(instance);

      expect(stateNode.invoke).toHaveLength(1);
      expect(stateNode.invoke[0].src).toBe('dataService');
      expect(stateNode.invoke[0].onDone.target).toBe('Success');
      expect(stateNode.invoke[0].onError.target).toBe('Error');
    });

    it('should ignore non-function properties', () => {
      class Target extends MachineBase<any> {}

      class Source extends MachineBase<any> {
        someData = 'not a function';
        someNumber = 42;
        transition = transitionTo(Target, () => new Target());
      }

      const instance = new Source({ status: 'test' });
      const stateNode = extractStateNode(instance);

      expect(Object.keys(stateNode.on)).toEqual(['transition']);
    });

    it('should ignore functions without metadata', () => {
      class Target extends MachineBase<any> {}

      class Source extends MachineBase<any> {
        regularMethod() { return 'test'; }
        transition = transitionTo(Target, () => new Target());
      }

      const instance = new Source({ status: 'test' });
      const stateNode = extractStateNode(instance);

      expect(Object.keys(stateNode.on)).toEqual(['transition']);
    });
  });

  describe('generateStatechart', () => {
    it('should generate complete statechart', () => {
      class LoggedIn extends MachineBase<any> {
        logout = transitionTo(
          class LoggedOut extends MachineBase<any> {},
          () => new (this.logout as any).target({ status: 'loggedOut' })
        );
      }

      class LoggedOut extends MachineBase<any> {
        login = transitionTo(LoggedIn, () => new LoggedIn({ status: 'loggedIn' }));
      }

      const chart = generateStatechart({
        LoggedOut: new LoggedOut({ status: 'loggedOut' }),
        LoggedIn: new LoggedIn({ status: 'loggedIn' })
      }, {
        id: 'auth',
        initial: 'LoggedOut'
      });

      expect(chart.id).toBe('auth');
      expect(chart.initial).toBe('LoggedOut');
      expect(chart.states.LoggedOut.on.login).toBeDefined();
      expect(chart.states.LoggedOut.on.login.target).toBe('LoggedIn');
      expect(chart.states.LoggedIn.on.logout).toBeDefined();
    });

    it('should include description in chart', () => {
      class State1 extends MachineBase<any> {}
      class State2 extends MachineBase<any> {
        next = transitionTo(State1, () => new State1());
      }

      const chart = generateStatechart({
        State1: new State1({}),
        State2: new State2({})
      }, {
        id: 'test',
        initial: 'State1',
        description: 'Test machine'
      });

      expect(chart.description).toBe('Test machine');
    });
  });

  describe('extractFromInstance', () => {
    it('should extract from single instance', () => {
      class Target extends MachineBase<any> {}

      class Source extends MachineBase<any> {
        transition = desc(
          "Test",
          transitionTo(Target, () => new Target())
        );
      }

      const instance = new Source({ status: 'test' });
      const chart = extractFromInstance(instance, {
        id: 'test',
        stateName: 'Source'
      });

      expect(chart.id).toBe('test');
      expect(chart.initial).toBe('Source');
      expect(chart.states.Source).toBeDefined();
      expect(chart.states.Source.on.transition).toBeDefined();
      expect(chart.states.Source.on.transition.target).toBe('Target');
    });

    it('should use constructor name if stateName not provided', () => {
      class MyState extends MachineBase<any> {
        transition = transitionTo(
          class Target extends MachineBase<any> {},
          () => new (this.transition as any).target()
        );
      }

      const instance = new MyState({ status: 'test' });
      const chart = extractFromInstance(instance, { id: 'test' });

      expect(chart.initial).toBe('MyState');
      expect(chart.states.MyState).toBeDefined();
    });
  });

  describe('Metadata attachment verification', () => {
    it('should store metadata in non-enumerable Symbol property', () => {
      class Target {}
      const fn = transitionTo(Target, () => new Target());

      // Should not be enumerable
      expect(Object.keys(fn)).not.toContain(RUNTIME_META);
      expect(Object.getOwnPropertyNames(fn)).not.toContain(RUNTIME_META.toString());

      // But should be accessible
      expect((fn as any)[RUNTIME_META]).toBeDefined();
    });

    it('should allow metadata property to be reconfigured', () => {
      class Target {}
      const fn = transitionTo(Target, () => new Target());

      // First attachment
      expect((fn as any)[RUNTIME_META].target).toBe('Target');

      // Second attachment (via describe wrapping the same function)
      const described = desc("Test", fn);

      // Should have both target and description
      expect((described as any)[RUNTIME_META].target).toBe('Target');
      expect((described as any)[RUNTIME_META].description).toBe('Test');
    });
  });

  describe('Functional machines', () => {
    it('should work with createMachine', () => {
      class Target {}

      const machine = createMachine(
        { count: 0 },
        {
          increment: transitionTo(Target, function() {
            return new Target();
          })
        }
      );

      const stateNode = extractStateNode(machine);
      expect(stateNode.on.increment.target).toBe('Target');
    });

    it('should work with nested DSL on createMachine', () => {
      class Target {}

      const machine = createMachine(
        { count: 0 },
        {
          increment: desc(
            "Increment counter",
            action(
              { name: 'log' },
              transitionTo(Target, function() {
                return new Target();
              })
            )
          )
        }
      );

      const stateNode = extractStateNode(machine);
      expect(stateNode.on.increment.target).toBe('Target');
      expect(stateNode.on.increment.description).toBe('Increment counter');
      expect(stateNode.on.increment.actions).toEqual(['log']);
    });
  });
});
