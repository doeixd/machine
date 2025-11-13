import { createMachine, Machine } from './src/index'

type Functions<C extends object> =
  Record<string, (this: C, ...args: any[]) => Machine<any>>

const counter = createMachine(
  { count: 0 },
  {
    increment(this: { count: number }) {
      return createMachine({ count: this.count + 1 }, this as any)
    },
    decrement(this: { count: number }) {
      return createMachine({ count: this.count - 1 }, this as any)
    }
  } as any
)

const result = counter.increment()
// Hover over result to see inferred type
const nextResult = result.increment()
