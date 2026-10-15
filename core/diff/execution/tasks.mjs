import { depthFirst } from '../../../shared/traversal.mjs';

function validateTask(task) {
  if (typeof task?.name !== 'string' || task.name.length === 0) {
    throw new TypeError('Analyzer task name must be a non-empty string');
  }
  if (
    !Array.isArray(task.dependencies) ||
    task.dependencies.some((dependency) => typeof dependency !== 'string')
  ) {
    throw new TypeError(`${task.name} dependencies must be strings`);
  }
  if (!Number.isInteger(task.concurrencyWeight) || task.concurrencyWeight < 1) {
    throw new TypeError(`${task.name} concurrencyWeight must be a positive integer`);
  }
  validateOptionalTaskFields(task);
  if (!Number.isInteger(task.timeoutMs) || task.timeoutMs < 1) {
    throw new TypeError(`${task.name} timeoutMs must be a positive integer`);
  }
  if (
    !Array.isArray(task.acceptedExitCodes) ||
    task.acceptedExitCodes.some((status) => !Number.isInteger(status) || status < 0)
  ) {
    throw new TypeError(`${task.name} acceptedExitCodes must be non-negative integers`);
  }
  validateTaskInvocation(task);
}

function validateOptionalTaskFields(task) {
  if (
    task.concurrencyGroup !== undefined &&
    (typeof task.concurrencyGroup !== 'string' || task.concurrencyGroup.length === 0)
  ) {
    throw new TypeError(`${task.name} concurrencyGroup must be a non-empty string`);
  }
  if (
    task.executionPriority !== undefined &&
    (!Number.isSafeInteger(task.executionPriority) || task.executionPriority < 0)
  ) {
    throw new TypeError(`${task.name} executionPriority must be a non-negative safe integer`);
  }
}

function validateTaskInvocation(task) {
  if (
    typeof task.invocation !== 'object' ||
    task.invocation === null ||
    typeof task.invocation.command !== 'string' ||
    !Array.isArray(task.invocation.args) ||
    task.invocation.args.some((argument) => typeof argument !== 'string')
  ) {
    throw new TypeError(`${task.name} invocation is invalid`);
  }
}

export function byDescendingExecutionPriority(tasks) {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort(
      (left, right) =>
        (right.task.executionPriority ?? 0) - (left.task.executionPriority ?? 0) ||
        left.index - right.index,
    )
    .map(({ task }) => task);
}

export function indexTasks(tasks) {
  if (!Array.isArray(tasks)) {
    throw new TypeError('Analyzer tasks must be an array');
  }
  const tasksByName = new Map();
  for (const task of tasks) {
    validateTask(task);
    if (tasksByName.has(task.name)) {
      throw new Error(`Duplicate analyzer task: ${task.name}`);
    }
    tasksByName.set(task.name, task);
  }
  return tasksByName;
}

function visitTaskFrame(frame, state) {
  if (state.visited.has(frame.task.name)) return;
  if (frame.exiting) {
    state.visiting.pop();
    state.visited.add(frame.task.name);
    state.ordered.push(frame.task);
    return;
  }
  const cycleStart = state.visiting.indexOf(frame.task.name);
  if (cycleStart !== -1)
    throw new Error(
      `Analyzer dependency cycle: ${[...state.visiting.slice(cycleStart), frame.task.name].join(' -> ')}`,
    );
  state.visiting.push(frame.task.name);
}

export function dependencyOrder(tasks, tasksByName) {
  const state = { visited: new Set(), visiting: [], ordered: [] };
  function children(frame) {
    if (frame.exiting || state.visited.has(frame.task.name)) return [];
    const dependencies = frame.task.dependencies
      .map((name) => tasksByName.get(name))
      .filter(Boolean);
    return [
      ...dependencies.map((task) => ({ task, exiting: false })),
      { task: frame.task, exiting: true },
    ];
  }
  for (const task of tasks) {
    for (const frame of depthFirst({ task, exiting: false }, children))
      visitTaskFrame(frame, state);
  }
  return state.ordered;
}
