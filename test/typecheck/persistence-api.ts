import {
  createMachine,
  createPersistedActor,
  persistentMachine,
  PersistedActor,
  type MachineCodec,
  type Persistence,
  type PersistedMachineDefinition,
  type PersistenceStorage,
} from '../../src';

// Explicit persistence contract form.
const counter = createMachine({ count: 0 }, (next) => ({
  add(n: number) {
    return next({ count: this.context.count + n });
  },
}));

type Counter = typeof counter;

const storage: PersistenceStorage<{ count: number }> = {
  load: () => Promise.resolve(undefined),
  save: (value) => {
    const persisted: { count: number } = value;
    void persisted;
  },
};

const persistence: Persistence<Counter, { count: number }> = {
  ...storage,
  encode: (machine) => machine.context,
  decode: (context) => createMachine(context, (next) => ({
    add(n: number) {
      return next({ count: this.context.count + n });
    },
  })),
};

const actorPromise: Promise<PersistedActor<Counter, { count: number }>> =
  createPersistedActor(counter, persistence);

async function useActor() {
  const actor = await actorPromise;
  actor.send.add(1);
  actor.ref.send({ type: 'add', args: [2] });
  const snapshot: Counter = actor.getSnapshot();
  const count: number = snapshot.context.count;
  void count;
  return actor;
}
void useActor;

// A codec alone cannot create an actor; storage is required.
const codec: MachineCodec<Counter, { count: number }> = persistence;
void codec;

// Rehydration-table form.
type AuthContext = { status: 'loggedOut' } | { status: 'loggedIn'; user: string };

const createLoggedOut = (ctx: AuthContext = { status: 'loggedOut' }) =>
  createMachine(ctx, () => ({
    login(user: string) {
      return createLoggedIn({ status: 'loggedIn', user });
    },
  }));

const createLoggedIn = (ctx: AuthContext) =>
  createMachine(ctx, () => ({
    logout() {
      return createLoggedOut();
    },
  }));

const Auth = persistentMachine({
  initial: () => createLoggedOut(),
  states: {
    loggedOut: (ctx: AuthContext) => createLoggedOut(ctx),
    loggedIn: (ctx: AuthContext) => createLoggedIn(ctx),
  },
  discriminant: (ctx: AuthContext) => ctx.status,
});

const definition: PersistedMachineDefinition<
  ReturnType<typeof createLoggedOut> | ReturnType<typeof createLoggedIn>,
  AuthContext
> = Auth;
void definition;

async function useDefinition() {
  const authStorage: PersistenceStorage<AuthContext> = {
    load: () => undefined,
    save: async (value) => {
      const persisted: AuthContext = value;
      void persisted;
    },
  };
  const actor = await createPersistedActor(Auth, authStorage);
  const context: AuthContext = actor.getSnapshot().context;
  void context;
}
void useDefinition;

// The encoded representation flows from encode to save.
const encodeResult: AuthContext = Auth.encode(createLoggedOut());
const decoded = Auth.decode({ status: 'loggedIn', user: 'ada' });
const logout: (() => unknown) | undefined = 'logout' in decoded ? decoded.logout : undefined;
void encodeResult;
void logout;
