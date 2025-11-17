import {
  createMachine,
  withHistory,
  withSnapshot,
  withTimeTravel
} from './src/index';

const createCounter = () => {
  const t = {
    increment: function() { return createMachine({ count: this.count + 1 }, t); },
    add: function(n: number) { return createMachine({ count: this.count + n }, t); }
  };
  return createMachine({ count: 0 }, t);
};

let tracker = withTimeTravel(createCounter());
console.log('Initial tracker keys:', Object.keys(tracker));
console.log('Has history:', 'history' in tracker);
console.log('Has snapshots:', 'snapshots' in tracker);
console.log('History:', tracker.history);
console.log('Snapshots:', tracker.snapshots);

const result1 = tracker.increment.call(tracker.context);
console.log('\nAfter first increment, result1 keys:', Object.keys(result1));
console.log('Result1 has history:', 'history' in result1);
console.log('Result1 history:', (result1 as any).history);
console.log('Result1 has snapshots:', 'snapshots' in result1);
console.log('Result1 snapshots:', (result1 as any).snapshots);

tracker = result1;
console.log('\ntracker after reassignment:');
console.log('Has history:', 'history' in tracker);
console.log('Has snapshots:', 'snapshots' in tracker);
