import { createHash } from 'node:crypto';
import type { Finding } from '../values/findings.mts';
import { fieldOf, optionalText } from '../values/readers.mts';

export const TESTS_FAILED_RULE = 'tests-failed';
export const TESTS_NOT_RUN_RULE = 'tests-not-run';
export const TESTS_FAILED_SKIPPED_RULE = 'tests-failed-skipped';
export const TESTS_TIMED_OUT_RULE = 'tests-timed-out';
export const TESTS_BASE_NOT_RUN_RULE = 'tests-not-run-on-base';
export const TESTS_UNMEASURED_RULES: string[] = [
  TESTS_FAILED_RULE,
  TESTS_TIMED_OUT_RULE,
  TESTS_BASE_NOT_RUN_RULE,
];
export const TESTS_FAILED_RULES: string[] = [...TESTS_UNMEASURED_RULES, TESTS_FAILED_SKIPPED_RULE];
export const TOOL_SKIPPED_RULE = 'tool-skipped';
export const MODULE_BUILD_FAILED_RULE = 'module-build-failed';
export const TESTS_FAILED_SCOPE_SEPARATOR = ',';
export const MUTATION_FAILED_PART_RULE = 'pit-failure';
export const TYPECHECK_FAILED_SKIPPED_RULE = 'typecheck-failed-skipped';
export const COMPILE_ERROR_TOOL = 'build';
export const COMPILE_ERROR_RULE = 'compile-error';
export const COMPILE_FAILED_SKIPPED_RULE = 'compile-failed-skipped';
const COMPILE_ERROR_HINT = 'The code does not compile; fix it before anything else is checked.';

export function compileErrorMessage(compilerText: string): string {
  return `${compilerText.trim().replace(/\.$/u, '')}. ${COMPILE_ERROR_HINT}`;
}

const MAX_LISTED_TESTS = 5;

export function testsFailHeadline(count: number, consequence: string, where = ''): string {
  const verb = count === 1 ? 'test fails' : 'tests fail';
  return `${String(count)} ${verb}${where}; ${consequence}. Fix the tests and rerun:`;
}

export function testsFailOnBase(tests: readonly string[], where = ''): string {
  const listed = tests.slice(0, MAX_LISTED_TESTS).map((test) => `  ${test}`);
  const omitted = tests.length - listed.length;
  return [
    `Tests fail on the base${where}:`,
    ...listed,
    ...(omitted > 0 ? [`  and ${String(omitted)} more`] : []),
  ].join('\n');
}

const HASH_LENGTH = 24;

export function hash(value: unknown): string {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, HASH_LENGTH);
}

const NAME_PART = /[\p{L}_$][\p{L}\p{N}_$]*/gu;
const NAME_PLACEHOLDER = '\0';

export function nameFreeHash(text: unknown, name: unknown): string {
  const parts = new Set(String(name).match(NAME_PART) ?? []);
  const masked = String(text).replaceAll(/[\p{L}\p{N}_$]+/gu, (word) =>
    parts.has(word) ? NAME_PLACEHOLDER : word,
  );
  return hash(masked);
}

export function declarationLine(text: unknown): string {
  return (
    String(text)
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line !== '' && !line.startsWith('@')) ?? ''
  );
}

export type OccurrenceCounter = (key: string) => number;

export function occurrenceCounter(): OccurrenceCounter {
  const occurrences = new Map<string, number>();
  return (key) => {
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    return occurrence;
  };
}

const REPEATING_UNIT_NAME = /<(?:init|clinit|lambda)>$/u;

export function repeatsInSource(name: string): boolean {
  return REPEATING_UNIT_NAME.test(name);
}

export function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

type MetricInput = {
  readonly analyzerName: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly metricName: string;
  readonly value: unknown;
  readonly symbol?: unknown;
  readonly line?: unknown;
};

export function metricFindings({
  analyzerName,
  rule,
  path: findingPath,
  identity,
  message,
  metricName,
  value,
  symbol,
  line,
}: MetricInput): Finding[] {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return [];
  }
  const lineNumber = positiveInteger(line);
  return [
    {
      tool: analyzerName,
      rule,
      path: findingPath,
      identity,
      message,
      classification: 'descriptive',
      metric: { name: metricName, value },
      ...(typeof symbol === 'string' && symbol.length > 0 ? { symbol } : {}),
      ...(lineNumber === undefined ? {} : { location: { line: lineNumber } }),
    },
  ];
}

type Located = { location?: { line: number; column?: number; endLine?: number } };

export function locationFrom(line: unknown, extra: unknown, key: 'column' | 'endLine'): Located {
  const lineNumber = positiveInteger(line);
  if (lineNumber === undefined) {
    return {};
  }
  const extraNumber = positiveInteger(extra);
  return {
    location: { line: lineNumber, ...(extraNumber === undefined ? {} : { [key]: extraNumber }) },
  };
}

export function summaryMetrics(
  analyzerName: string,
  summary: Readonly<Record<string, unknown>> = {},
  rule: string,
): Finding[] {
  return Object.entries(summary).flatMap(([metricName, value]) =>
    metricFindings({
      analyzerName,
      rule,
      path: '.',
      identity: `summary:${metricName}`,
      message: `${metricName} summary`,
      metricName,
      value,
    }),
  );
}

type FunctionSpan = {
  readonly file: unknown;
  readonly name?: unknown;
  readonly start: number;
  readonly end: number;
};

function isSpan(value: unknown): value is FunctionSpan {
  return typeof fieldOf(value, 'start') === 'number' && typeof fieldOf(value, 'end') === 'number';
}

export function enclosingFunctionName(
  functions: readonly unknown[],
  file: unknown,
  line: number,
): string | undefined {
  return optionalText(enclosingFunction(functions, file, line)?.name);
}

export function enclosingFunction<Unit extends FunctionSpan>(
  functions: readonly Unit[],
  file: unknown,
  line: number,
): Unit | undefined;
export function enclosingFunction(
  functions: readonly unknown[],
  file: unknown,
  line: number,
): FunctionSpan | undefined;
export function enclosingFunction(
  functions: readonly unknown[],
  file: unknown,
  line: number,
): FunctionSpan | undefined {
  let found: FunctionSpan | undefined;
  for (const candidate of functions.filter(isSpan)) {
    const holds = candidate.file === file && candidate.start <= line && line <= candidate.end;
    if (
      holds &&
      (found === undefined || candidate.end - candidate.start < found.end - found.start)
    ) {
      found = candidate;
    }
  }
  return found;
}

export function lazy<Value>(read: () => Value): () => Value {
  let value: Value | undefined;
  return () => {
    value ??= read();
    return value;
  };
}
