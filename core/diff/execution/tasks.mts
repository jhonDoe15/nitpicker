import { depthFirst } from '../../../shared/traversal.mjs';
import { fieldOf } from '../../../shared/values/readers.mts';

type Invocation = {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
};

export type AnalyzerTask = {
  readonly name: string;
  readonly dependencies: readonly string[];
  readonly concurrencyWeight: number;
  readonly concurrencyGroup?: string | undefined;
  readonly executionPriority?: number | undefined;
  readonly toleratedDependencyErrors?: readonly string[] | undefined;
  readonly timeoutMs: number;
  readonly configuredTimeout?: unknown;
  readonly acceptedExitCodes: readonly number[];
  readonly reportedTools?: readonly string[] | undefined;
  readonly invocation: Invocation;
  readonly progress?: unknown;
};

type Frame = { readonly task: AnalyzerTask; readonly exiting: boolean };

type OrderState = {
  readonly visited: Set<string>;
  readonly visiting: string[];
  readonly ordered: AnalyzerTask[];
};

const walk: (root: Frame, children: (frame: Frame) => readonly Frame[]) => Iterable<Frame> =
  depthFirst;

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isStringList(value: unknown, accepts: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every(accepts);
}

function isString(value: unknown): boolean {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value !== '';
}

function isExitCode(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function validateTask(task: unknown): asserts task is AnalyzerTask {
  const name = fieldOf(task, 'name');
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('Analyzer task name must be a non-empty string');
  }
  if (!isStringList(fieldOf(task, 'dependencies'), isString)) {
    throw new TypeError(`${name} dependencies must be strings`);
  }
  if (!isPositiveInteger(fieldOf(task, 'concurrencyWeight'))) {
    throw new TypeError(`${name} concurrencyWeight must be a positive integer`);
  }
  validateOptionalTaskFields(task, name);
  if (!isPositiveInteger(fieldOf(task, 'timeoutMs'))) {
    throw new TypeError(`${name} timeoutMs must be a positive integer`);
  }
  if (!isStringList(fieldOf(task, 'acceptedExitCodes'), isExitCode)) {
    throw new TypeError(`${name} acceptedExitCodes must be non-negative integers`);
  }
  validateTaskInvocation(task, name);
}

function validateOptionalTaskFields(task: unknown, name: string): void {
  const group = fieldOf(task, 'concurrencyGroup');
  if (group !== undefined && !isNonEmptyString(group)) {
    throw new TypeError(`${name} concurrencyGroup must be a non-empty string`);
  }
  const priority = fieldOf(task, 'executionPriority');
  if (
    priority !== undefined &&
    !(typeof priority === 'number' && Number.isSafeInteger(priority) && priority >= 0)
  ) {
    throw new TypeError(`${name} executionPriority must be a non-negative safe integer`);
  }
  const tolerated = fieldOf(task, 'toleratedDependencyErrors');
  if (tolerated !== undefined && !isStringList(tolerated, isNonEmptyString)) {
    throw new TypeError(`${name} toleratedDependencyErrors must be non-empty strings`);
  }
}

function validateTaskInvocation(task: unknown, name: string): void {
  const invocation = fieldOf(task, 'invocation');
  if (
    typeof invocation !== 'object' ||
    invocation === null ||
    typeof fieldOf(invocation, 'command') !== 'string' ||
    !isStringList(fieldOf(invocation, 'args'), isString)
  ) {
    throw new TypeError(`${name} invocation is invalid`);
  }
}

export function byDescendingExecutionPriority<
  T extends { readonly executionPriority?: number | undefined },
>(tasks: readonly T[]): T[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort(
      (left, right) =>
        (right.task.executionPriority ?? 0) - (left.task.executionPriority ?? 0) ||
        left.index - right.index,
    )
    .map(({ task }) => task);
}

export function indexTasks(tasks: unknown): Map<string, AnalyzerTask> {
  if (!Array.isArray(tasks)) {
    throw new TypeError('Analyzer tasks must be an array');
  }
  const list: readonly unknown[] = tasks;
  const tasksByName = new Map<string, AnalyzerTask>();
  for (const task of list) {
    validateTask(task);
    if (tasksByName.has(task.name)) {
      throw new Error(`Duplicate analyzer task: ${task.name}`);
    }
    tasksByName.set(task.name, task);
  }
  return tasksByName;
}

function visitTaskFrame(frame: Frame, state: OrderState): void {
  if (state.visited.has(frame.task.name)) {
    return;
  }
  if (frame.exiting) {
    state.visiting.pop();
    state.visited.add(frame.task.name);
    state.ordered.push(frame.task);
    return;
  }
  const cycleStart = state.visiting.indexOf(frame.task.name);
  if (cycleStart !== -1) {
    throw new Error(
      `Analyzer dependency cycle: ${[...state.visiting.slice(cycleStart), frame.task.name].join(' -> ')}`,
    );
  }
  state.visiting.push(frame.task.name);
}

export function dependencyOrder(
  tasks: readonly AnalyzerTask[],
  tasksByName: ReadonlyMap<string, AnalyzerTask>,
): AnalyzerTask[] {
  const state: OrderState = { visited: new Set(), visiting: [], ordered: [] };
  function children(frame: Frame): readonly Frame[] {
    if (frame.exiting || state.visited.has(frame.task.name)) {
      return [];
    }
    const dependencies = frame.task.dependencies
      .map((name) => tasksByName.get(name))
      .filter((task) => task !== undefined);
    return [
      ...dependencies.map((task) => ({ task, exiting: false })),
      { task: frame.task, exiting: true },
    ];
  }
  for (const task of tasks) {
    for (const frame of walk({ task, exiting: false }, children)) {
      visitTaskFrame(frame, state);
    }
  }
  return state.ordered;
}
