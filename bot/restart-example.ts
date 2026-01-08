#!/usr/bin/env bun
/**
 * Example demonstrating the RestartManager
 * 
 * This script simulates a bot that:
 * 1. Watches for file changes in the current directory
 * 2. Simulates tasks being added and removed
 * 3. Only restarts when idle (no active tasks)
 * 
 * Try editing files in bot/ directory while this is running!
 */

import { RestartManager } from "./RestartManager";

// Simulate task tracking (like TaskInputFlows in bot/index.ts)
const activeTasks = new Map<string, any>();

// Add a task
function addTask(id: string) {
  console.log(`➕ Task ${id} started`);
  activeTasks.set(id, { id, startTime: Date.now() });
}

// Remove a task
function removeTask(id: string) {
  console.log(`✅ Task ${id} completed`);
  activeTasks.delete(id);
}

// Check if bot is idle
function isIdle() {
  return activeTasks.size === 0;
}

// Setup restart manager
const restartManager = new RestartManager({
  watchPaths: ['bot'],
  isIdle,
  onRestart: () => {
    console.log('\n🔄 Restarting process...\n');
    process.exit(0);
  },
  idleCheckInterval: 2000,
  debounceDelay: 1000,
  logger: {
    info: (msg) => console.log(`[RestartManager] ${msg}`),
    warn: (msg) => console.warn(`[RestartManager] ${msg}`),
  }
});

console.log('🤖 Bot Example Starting...\n');
console.log('This example demonstrates smart restart behavior:');
console.log('1. Edit any file in bot/ directory');
console.log('2. The restart will be queued');
console.log('3. Bot will only restart when idle (no active tasks)\n');
console.log('Try editing bot/index.ts or bot/RestartManager.ts!\n');

// Start watching
restartManager.start();

// Simulate some tasks
console.log('Simulating task workflow...\n');

// Add a task immediately
addTask('task-1');

// Remove it after 5 seconds
setTimeout(() => {
  removeTask('task-1');
  console.log('\n💤 Bot is now idle - if you edited files, restart will happen now!\n');
}, 5000);

// Add another task after 10 seconds
setTimeout(() => {
  addTask('task-2');
  console.log('\n📝 New task started - bot is busy again\n');
}, 10000);

// Remove it after 15 seconds
setTimeout(() => {
  removeTask('task-2');
  console.log('\n💤 Bot is idle again\n');
}, 15000);

// Keep the process running
setInterval(() => {
  const status = isIdle() ? '💤 IDLE' : '⚙️  BUSY';
  const taskCount = activeTasks.size;
  console.log(`Status: ${status} | Active tasks: ${taskCount}`);
}, 3000);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down gracefully...');
  restartManager.stop();
  process.exit(0);
});

console.log('Press Ctrl+C to stop\n');

