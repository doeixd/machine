import {
  MachineBase,
  classCase,
  createMatcher,
} from '../../src/index';

class Idle extends MachineBase<{ status: 'idle' }> {}
class Loading extends MachineBase<{ status: 'loading'; startedAt: number }> {}
class Success extends MachineBase<{ status: 'success'; data: string }> {}
class Failed extends MachineBase<{ status: 'error'; error: Error }> {}

type FetchMachine = Idle | Loading | Success | Failed;

const matchFetch = createMatcher(
  classCase('idle', Idle),
  classCase('loading', Loading),
  classCase('success', Success),
  classCase('error', Failed),
);

export function describeFetch(snapshot: FetchMachine): string {
  matchFetch(snapshot);

  if (matchFetch.is.success(snapshot)) {
    snapshot.context.data satisfies string;
  }

  return matchFetch.when(snapshot).is(
    matchFetch.case.idle(() => 'Ready'),
    matchFetch.case.loading(state => `Started at ${state.context.startedAt}`),
    matchFetch.case.success(state => `Loaded: ${state.context.data}`),
    matchFetch.case.error(state => `Failed: ${state.context.error.message}`),
    matchFetch.exhaustive,
  );
}

const incomplete = (snapshot: FetchMachine) => matchFetch.when(snapshot).is(
  matchFetch.case.idle(() => 'Ready'),
  matchFetch.exhaustive,
);

// @ts-expect-error an incomplete inferred match does not produce a string
const invalidDescription: (snapshot: FetchMachine) => string = incomplete;
