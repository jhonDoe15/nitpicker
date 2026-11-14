import { fieldOf } from '../../../../shared/values/readers.mts';
import { analyzerNameOf as nameOf } from '../../../../shared/values/analyzers.mts';

export type Invocation = {
  readonly command: string;
  readonly args: readonly string[];
  readonly [field: string]: unknown;
};

export type ValidAnalyzer = {
  readonly name: string;
  version: string;
  configurationHash: string;
  readonly exclusions: readonly string[];
  readonly createInvocation: (context: object) => unknown;
  readonly dependencies?: readonly string[];
  readonly concurrencyWeight?: number;
  readonly concurrencyGroup?: string;
  readonly executionPriority?: number;
  readonly findingExitCodes?: readonly number[];
  readonly reportedTools?: readonly string[];
  readonly toleratedDependencyErrors?: readonly string[];
  readonly timeoutMs?: number;
  readonly [field: string]: unknown;
};

function isTextList(value: unknown, accepts: (text: string) => boolean): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && accepts(item));
}

export function validateInvocation(
  analyzerName: string,
  invocation: unknown,
): asserts invocation is Invocation {
  if (
    typeof fieldOf(invocation, 'command') !== 'string' ||
    !isTextList(fieldOf(invocation, 'args'), () => true)
  ) {
    throw new TypeError(`${analyzerName} produced an invalid process invocation`);
  }
}

export function validateAnalyzer(analyzer: unknown): asserts analyzer is ValidAnalyzer {
  validateAnalyzerIdentity(analyzer);
  validateAnalyzerDependencies(analyzer);
  validateAnalyzerCapacity(analyzer);
  validateAnalyzerReports(analyzer);
  validateAnalyzerTimeout(analyzer);
}

function validateAnalyzerIdentity(analyzer: unknown): void {
  if (typeof analyzer !== 'object' || analyzer === null) {
    throw new TypeError('Analyzer configuration must be an object');
  }
  for (const property of ['name', 'version', 'configurationHash']) {
    const value = fieldOf(analyzer, property);
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`Analyzer ${property} must be a non-empty string`);
    }
  }
  if (!isTextList(fieldOf(analyzer, 'exclusions'), () => true)) {
    throw new TypeError(`${nameOf(analyzer)} exclusions must be an array of strings`);
  }
  if (typeof fieldOf(analyzer, 'createInvocation') !== 'function') {
    throw new TypeError(`${nameOf(analyzer)} must define createInvocation`);
  }
}

function isPresentText(text: string): boolean {
  return text.length > 0;
}

function validateAnalyzerDependencies(analyzer: unknown): void {
  const dependencies = fieldOf(analyzer, 'dependencies');
  if (dependencies !== undefined && !isTextList(dependencies, isPresentText)) {
    throw new TypeError(`${nameOf(analyzer)} dependencies must contain non-empty strings`);
  }
}

function isIntegerAtLeast(value: unknown, minimum: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum;
}

function validateAnalyzerCapacity(analyzer: unknown): void {
  const weight = fieldOf(analyzer, 'concurrencyWeight');
  if (weight !== undefined && !isIntegerAtLeast(weight, 1)) {
    throw new TypeError(`${nameOf(analyzer)} concurrencyWeight must be a positive integer`);
  }
  const group = fieldOf(analyzer, 'concurrencyGroup');
  if (group !== undefined && (typeof group !== 'string' || group.length === 0)) {
    throw new TypeError(`${nameOf(analyzer)} concurrencyGroup must be a non-empty string`);
  }
  const priority = fieldOf(analyzer, 'executionPriority');
  if (
    priority !== undefined &&
    (typeof priority !== 'number' || !Number.isSafeInteger(priority) || priority < 0)
  ) {
    throw new TypeError(
      `${nameOf(analyzer)} executionPriority must be a non-negative safe integer`,
    );
  }
}

function validateAnalyzerReports(analyzer: unknown): void {
  const exitCodes = fieldOf(analyzer, 'findingExitCodes');
  if (
    exitCodes !== undefined &&
    (!Array.isArray(exitCodes) || exitCodes.some((exitCode) => !isIntegerAtLeast(exitCode, 1)))
  ) {
    throw new TypeError(`${nameOf(analyzer)} findingExitCodes must contain positive integers`);
  }
  for (const key of ['reportedTools', 'toleratedDependencyErrors']) {
    validateToolNames(analyzer, key);
  }
}

function validateToolNames(analyzer: unknown, key: string): void {
  const tools = fieldOf(analyzer, key);
  if (tools !== undefined && !isTextList(tools, isPresentText)) {
    throw new TypeError(`${nameOf(analyzer)} ${key} must contain non-empty strings`);
  }
}

function validateAnalyzerTimeout(analyzer: unknown): void {
  const timeoutMs = fieldOf(analyzer, 'timeoutMs');
  if (timeoutMs !== undefined && !isIntegerAtLeast(timeoutMs, 1)) {
    throw new TypeError(`${nameOf(analyzer)} timeoutMs must be a positive integer`);
  }
}
