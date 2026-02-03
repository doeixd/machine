
import { type States } from './src/types';

type PickMode = States<{
  idle: {},
  active: { isCloseMode: boolean; timeoutId: number }
}>;

const m1: PickMode = { tag: 'idle' };
const m2: PickMode = { tag: 'active', isCloseMode: true, timeoutId: 123 };

// @ts-expect-error
const m3: PickMode = { tag: 'idle', extra: 1 };
// @ts-expect-error
const m4: PickMode = { tag: 'active' };

console.log('States utility verified!');

