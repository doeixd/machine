/**
 * @file Time-Travel Debugging with History and Snapshot Middleware
 * @description Comprehensive examples of recording, replaying, and debugging state machines
 */

import {
  createMachine,
  withHistory,
  withSnapshot,
  withTimeTravel,
  type HistoryEntry,
  type ContextSnapshot
} from '../src/index';

// =============================================================================
// EXAMPLE 1: Basic History Tracking
// =============================================================================

console.log('=== EXAMPLE 1: Basic History Tracking ===\n');

const counter = createMachine({ count: 0 }, {
  increment: function() {
    return createMachine({ count: this.context.count + 1 }, this);
  },
  decrement: function() {
    return createMachine({ count: this.context.count - 1 }, this);
  },
  add: function(n: number) {
    return createMachine({ count: this.context.count + n }, this);
  },
  reset: function() {
    return createMachine({ count: 0 }, this);
  }
});

const { machine: trackedCounter, history, clear: clearHistory } = withHistory(counter, {
  maxSize: 100,
  onEntry: (entry) => {
    console.log(`📝 Recorded: ${entry.transitionName}(${entry.args.join(', ')})`);
  }
});

let state1 = trackedCounter;
state1 = state1.increment();
state1 = state1.increment();
state1 = state1.add(5);
state1 = state1.decrement();

console.log('\n📚 Full History:');
history.forEach((entry, i) => {
  const timestamp = new Date(entry.timestamp).toISOString();
  console.log(`  ${i + 1}. [${timestamp}] ${entry.transitionName}(${entry.args.join(', ')})`);
});

console.log(`\n✓ Total operations: ${history.length}`);
console.log(`✓ Final count: ${state1.context.count}`);

// =============================================================================
// EXAMPLE 2: Serialized History (for persistence)
// =============================================================================

console.log('\n=== EXAMPLE 2: Serialized History ===\n');

const calculator = createMachine({ result: 0 }, {
  add: function(n: number) {
    return createMachine({ result: this.context.result + n }, this);
  },
  multiply: function(n: number) {
    return createMachine({ result: this.context.result * n }, this);
  },
  divide: function(n: number) {
    return createMachine({ result: this.context.result / n }, this);
  }
});

const { machine: persistentCalc, history: calcHistory } = withHistory(calculator, {
  serializer: {
    serialize: (args) => JSON.stringify(args),
    deserialize: (str) => JSON.parse(str)
  }
});

let calcState = persistentCalc;
calcState = calcState.add(10);
calcState = calcState.multiply(3);
calcState = calcState.add(5);

console.log('💾 Serialized History (for storage):');
calcHistory.forEach((entry) => {
  console.log(`  ${entry.transitionName}: ${entry.serializedArgs}`);
});

// Simulate saving to localStorage/database
const serializedHistory = JSON.stringify(
  calcHistory.map(e => ({
    transition: e.transitionName,
    args: e.serializedArgs,
    timestamp: e.timestamp
  }))
);

console.log('\n📦 JSON for storage:');
console.log(serializedHistory);

// =============================================================================
// EXAMPLE 3: Context Snapshots for Time-Travel
// =============================================================================

console.log('\n=== EXAMPLE 3: Context Snapshots ===\n');

const todoMachine = createMachine(
  { todos: [] as string[], completed: [] as string[] },
  {
    addTodo: function(todo: string) {
      return createMachine({ ...this, todos: [...this.context.todos, todo] }, this);
    },
    completeTodo: function(index: number) {
      const todo = this.context.todos[index];
      return createMachine({
        todos: this.context.todos.filter((_, i) => i !== index),
        completed: [...this.context.completed, todo]
      }, this);
    },
    removeTodo: function(index: number) {
      return createMachine({
        ...this,
        todos: this.context.todos.filter((_, i) => i !== index)
      }, this);
    }
  }
);

const { machine: snapshotTodos, snapshots, restore } = withSnapshot(todoMachine, {
  maxSize: 50,
  onlyIfChanged: true,
  captureSnapshot: (before, after) => {
    return {
      todosAdded: after.todos.length - before.todos.length,
      todosRemoved: before.todos.length - after.todos.length,
      completedAdded: after.completed.length - before.completed.length
    };
  },
  onSnapshot: (snapshot) => {
    console.log(`📸 Snapshot: ${snapshot.transitionName}`);
    console.log(`   Before: ${snapshot.before.todos.length} todos, ${snapshot.before.completed.length} completed`);
    console.log(`   After: ${snapshot.after.todos.length} todos, ${snapshot.after.completed.length} completed`);
    console.log(`   Diff:`, snapshot.diff);
  }
});

let todoState = snapshotTodos;
todoState = todoState.addTodo('Buy groceries');
todoState = todoState.addTodo('Write tests');
todoState = todoState.addTodo('Deploy app');
todoState = todoState.completeTodo(1); // Complete "Write tests"
todoState = todoState.addTodo('Review PR');

console.log('\n⏮️  Time Travel: Restore to snapshot #2 (after adding 3 todos)');
const restoredState = restore(snapshots[2].after);
console.log('Restored state:', restoredState.context);

// =============================================================================
// EXAMPLE 4: Full Time-Travel Debugging
// =============================================================================

console.log('\n=== EXAMPLE 4: Full Time-Travel Debugging ===\n');

type GameState = {
  player: string;
  score: number;
  level: number;
  health: number;
};

const game = createMachine<GameState>(
  { player: 'Hero', score: 0, level: 1, health: 100 },
  {
    earnPoints: function(points: number) {
      return createMachine({ ...this, score: this.context.score + points }, this);
    },
    levelUp: function() {
      return createMachine({ ...this, level: this.context.level + 1, health: 100 }, this);
    },
    takeDamage: function(damage: number) {
      return createMachine({ ...this, health: Math.max(0, this.context.health - damage) }, this);
    },
    heal: function(amount: number) {
      return createMachine({ ...this, health: Math.min(100, this.context.health + amount) }, this);
    }
  }
);

const gameTracker = withTimeTravel(game, {
  maxSize: 100,
  serializer: {
    serialize: (data) => JSON.stringify(data),
    deserialize: (str) => JSON.parse(str)
  },
  onRecord: (type, data) => {
    if (type === 'history') {
      console.log(`🎮 Action: ${(data as HistoryEntry).transitionName}(${(data as HistoryEntry).args.join(', ')})`);
    }
  }
});

let gameState = gameTracker.machine;
gameState = gameState.earnPoints(100);
gameState = gameState.earnPoints(50);
gameState = gameState.levelUp();
gameState = gameState.earnPoints(200);
gameState = gameState.takeDamage(30);
gameState = gameState.takeDamage(20);
gameState = gameState.heal(15);

console.log('\n📊 Game Statistics:');
console.log(`  Final State: Level ${gameState.context.level}, Score ${gameState.context.score}, Health ${gameState.context.health}`);
console.log(`  Total Actions: ${gameTracker.history.length}`);
console.log(`  State Changes: ${gameTracker.snapshots.length}`);

console.log('\n🎬 Replay History:');
gameTracker.replay();

console.log('\n🔍 Detailed Snapshot Analysis:');
gameTracker.snapshots.forEach((snapshot, i) => {
  const healthDiff = snapshot.after.health - snapshot.before.health;
  const scoreDiff = snapshot.after.score - snapshot.before.score;

  console.log(`\n  Snapshot ${i + 1}: ${snapshot.transitionName}`);
  console.log(`    Score: ${snapshot.before.score} → ${snapshot.after.score} (${scoreDiff >= 0 ? '+' : ''}${scoreDiff})`);
  console.log(`    Health: ${snapshot.before.health} → ${snapshot.after.health} (${healthDiff >= 0 ? '+' : ''}${healthDiff})`);
  console.log(`    Level: ${snapshot.before.level} → ${snapshot.after.level}`);
});

// Restore to a previous good state (before taking damage)
console.log('\n⏪ Time-Travel: Restore to state before damage');
const beforeDamageSnapshot = gameTracker.snapshots.find(s =>
  s.transitionName === 'earnPoints' && s.after.score === 350
);

if (beforeDamageSnapshot) {
  const restoredGame = gameTracker.restore(beforeDamageSnapshot.after);
  console.log('Restored game state:', restoredGame.context);
}

// =============================================================================
// EXAMPLE 5: Audit Log with Filtering
// =============================================================================

console.log('\n=== EXAMPLE 5: Audit Log with Filtering ===\n');

type BankAccount = {
  balance: number;
  owner: string;
};

const bankAccount = createMachine<BankAccount>(
  { balance: 1000, owner: 'Alice' },
  {
    deposit: function(amount: number) {
      return createMachine({ ...this, balance: this.context.balance + amount }, this);
    },
    withdraw: function(amount: number) {
      if (amount > this.context.balance) {
        throw new Error('Insufficient funds');
      }
      return createMachine({ ...this, balance: this.context.balance - amount }, this);
    },
    checkBalance: function() {
      // Read-only operation, no state change
      return createMachine(this, this);
    },
    transfer: function(amount: number, recipient: string) {
      if (amount > this.context.balance) {
        throw new Error('Insufficient funds');
      }
      return createMachine({ ...this, balance: this.context.balance - amount }, this);
    }
  }
);

const auditLog: Array<{ timestamp: number; action: string; details: any }> = [];

const { machine: auditedAccount, history: accountHistory } = withHistory(bankAccount, {
  filter: (name) => name !== 'checkBalance', // Don't log read operations
  onEntry: (entry) => {
    auditLog.push({
      timestamp: entry.timestamp,
      action: entry.transitionName,
      details: {
        args: entry.args,
        id: entry.id
      }
    });
    console.log(`🏦 Audit: ${entry.transitionName}(${entry.args.join(', ')})`);
  }
});

const { machine: auditedWithSnapshot, snapshots: accountSnapshots } = withSnapshot(auditedAccount, {
  captureSnapshot: (before, after) => ({
    balanceChange: after.balance - before.balance,
    percentChange: ((after.balance - before.balance) / before.balance * 100).toFixed(2) + '%'
  })
});

let accountState = auditedWithSnapshot;
accountState = accountState.deposit(500);
accountState = accountState.checkBalance(); // Not logged
accountState = accountState.withdraw(200);
accountState = accountState.transfer(300, 'Bob');
accountState = accountState.checkBalance(); // Not logged
accountState = accountState.deposit(100);

console.log('\n📋 Audit Log Summary:');
console.log(`  Total audited operations: ${accountHistory.length}`);
console.log(`  Final balance: $${accountState.context.balance}`);

console.log('\n💰 Balance Changes:');
accountSnapshots.forEach((snapshot, i) => {
  console.log(`  ${i + 1}. ${snapshot.transitionName}: $${snapshot.before.balance} → $${snapshot.after.balance}`);
  console.log(`     Change: ${snapshot.diff.balanceChange >= 0 ? '+' : ''}$${snapshot.diff.balanceChange} (${snapshot.diff.percentChange})`);
});

// =============================================================================
// EXAMPLE 6: Undo/Redo Functionality
// =============================================================================

console.log('\n=== EXAMPLE 6: Undo/Redo Implementation ===\n');

type EditorState = {
  text: string;
  cursor: number;
};

const editor = createMachine<EditorState>(
  { text: '', cursor: 0 },
  {
    type: function(char: string) {
      const newText = this.context.text.slice(0, this.context.cursor) + char + this.context.text.slice(this.context.cursor);
      return createMachine({ text: newText, cursor: this.context.cursor + 1 }, this);
    },
    delete: function() {
      if (this.context.cursor === 0) return createMachine(this, this);
      const newText = this.context.text.slice(0, this.context.cursor - 1) + this.context.text.slice(this.context.cursor);
      return createMachine({ text: newText, cursor: this.context.cursor - 1 }, this);
    },
    moveCursor: function(pos: number) {
      return createMachine({ ...this, cursor: Math.max(0, Math.min(pos, this.context.text.length)) }, this);
    }
  }
);

const { machine: undoableEditor, snapshots: editorSnapshots, restore: restoreEditor } = withSnapshot(editor, {
  onlyIfChanged: true
});

// Undo/Redo stack implementation
let currentSnapshotIndex = -1;

const undo = () => {
  if (currentSnapshotIndex > 0) {
    currentSnapshotIndex--;
    const snapshot = editorSnapshots[currentSnapshotIndex];
    console.log(`⏪ Undo to: "${snapshot.after.text}"`);
    return restoreEditor(snapshot.after);
  }
  console.log('❌ Nothing to undo');
  return editorState;
};

const redo = () => {
  if (currentSnapshotIndex < editorSnapshots.length - 1) {
    currentSnapshotIndex++;
    const snapshot = editorSnapshots[currentSnapshotIndex];
    console.log(`⏩ Redo to: "${snapshot.after.text}"`);
    return restoreEditor(snapshot.after);
  }
  console.log('❌ Nothing to redo');
  return editorState;
};

// Type some text
let editorState = undoableEditor;

console.log('Typing: "Hello"');
editorState = editorState.type('H');
currentSnapshotIndex++;
editorState = editorState.type('e');
currentSnapshotIndex++;
editorState = editorState.type('l');
currentSnapshotIndex++;
editorState = editorState.type('l');
currentSnapshotIndex++;
editorState = editorState.type('o');
currentSnapshotIndex++;

console.log(`Current text: "${editorState.context.text}"\n`);

// Undo twice
editorState = undo();
editorState = undo();
console.log(`After 2 undos: "${editorState.context.text}"\n`);

// Redo once
editorState = redo();
console.log(`After 1 redo: "${editorState.context.text}"\n`);

// Type more
console.log('Typing: " World"');
editorState = editorState.type(' ');
currentSnapshotIndex++;
editorState = editorState.type('W');
currentSnapshotIndex++;
editorState = editorState.type('o');
currentSnapshotIndex++;
editorState = editorState.type('r');
currentSnapshotIndex++;
editorState = editorState.type('l');
currentSnapshotIndex++;
editorState = editorState.type('d');
currentSnapshotIndex++;

console.log(`Final text: "${editorState.context.text}"`);

console.log('\n📝 Edit History:');
editorSnapshots.forEach((snapshot, i) => {
  const marker = i === currentSnapshotIndex ? ' ← current' : '';
  console.log(`  ${i + 1}. "${snapshot.after.text}"${marker}`);
});

console.log('\n=== All Examples Complete ===\n');

export {};
