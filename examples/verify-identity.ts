import { machine } from '../src/minimal';
import { createMachine } from '../src/index';

console.log('--- Verifying minimal machine identity optimization ---');

const counterMinimal = machine({ count: 0 }, (ctx, next) => ({
  noop: () => next(ctx),
  inc: () => next({ count: ctx.count + 1 })
}));

const s1Minimal = counterMinimal.noop();
console.log('Minimal noop same instance:', s1Minimal === counterMinimal); // Expected: true

const s2Minimal = counterMinimal.inc();
console.log('Minimal inc different instance:', s2Minimal !== counterMinimal); // Expected: true

console.log('\n--- Verifying createMachine identity optimization ---');

const counterMain = createMachine({ count: 0 }, (next) => ({
  noop: function () { return next(this.context); },
  inc: function () { return next({ count: this.context.count + 1 }); }
}));

const s1Main = (counterMain as any).noop();
console.log('Main noop same instance:', s1Main === counterMain); // Expected: true

const s2Main = (counterMain as any).inc();
console.log('Main inc different instance:', s2Main !== counterMain); // Expected: true
