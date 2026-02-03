
import { tag, isState } from './src/types';

const idle = tag.factory<{ count: number }>('idle');
const s = idle({ count: 10 });

// If narrowing works, this should work without any error
if (isState(s, 'idle')) {
  console.log('Narrowed correctly:', s.tag);
}

// If literal narrowing works, s.tag should be 'idle'
const tagValue: 'idle' = s.tag;
console.log('Literal tag verified:', tagValue);

