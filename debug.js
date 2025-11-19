const { createMachine, withTimeTravel } = require('./dist/index.js');

const createCounter = () => {
  const t = {
    increment: function() { return createMachine({ count: this.count + 1 }, t); },
    add: function(n) { return createMachine({ count: this.count + n }, t); }
  };
  return createMachine({ count: 0 }, t);
};

const tracker = withTimeTravel(createCounter());
console.log('Initial tracker has history:', 'history' in tracker);
console.log('Initial tracker has snapshots:', 'snapshots' in tracker);

const newTracker = tracker.increment.call(tracker.context);
console.log('New tracker has history:', 'history' in newTracker);
console.log('New tracker has snapshots:', 'snapshots' in newTracker);