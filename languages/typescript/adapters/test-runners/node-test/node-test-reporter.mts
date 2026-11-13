import path from 'node:path';
import { formattedValue } from '../../../../../shared/rules/failing-tests/failing-tests.mjs';

import type {
  FailureDetail,
  AssertionResult,
  PendingEntry,
  FileState,
  TestFailure,
  ResultData,
  ResultEvent,
  StderrEvent,
  ReporterEvent,
  NodeTestReport,
} from './node-test-report-types.mts';

const RESULT_EVENTS = new Set(['test:pass', 'test:fail']);
const CANCELLED_BY_PARENT = 'cancelledByParent';
const HOOK_FAILED = 'hookFailed';
const MAX_STDERR_LENGTH = 2000;

function fileState(files: Map<string, FileState>, file: string): FileState {
  const known = files.get(file);
  if (known !== undefined) {
    return known;
  }
  const created: FileState = { pending: [], loadFailures: [], stderr: '' };
  files.set(file, created);
  return created;
}

function messageOf(value: unknown): unknown {
  return (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    'message' in value
    ? value.message
    : undefined;
}

function failureMessage(error: TestFailure | undefined): string {
  const cause = error?.cause;
  const message = cause instanceof Error ? cause.stack : (messageOf(cause) ?? error?.message);
  const described: unknown = cause ?? error ?? 'failed';
  return typeof message === 'string' ? message : String(described);
}

function statusOf(failed: boolean, data: ResultData): AssertionResult['status'] {
  if (data.skip !== undefined || data.todo !== undefined) {
    return 'pending';
  }
  return failed ? 'failed' : 'passed';
}

function failureValues(error: TestFailure | undefined): {
  failureDetails?: readonly FailureDetail[];
} {
  const cause = error?.cause;
  if (
    cause === null ||
    typeof cause !== 'object' ||
    !('expected' in cause) ||
    !('actual' in cause)
  ) {
    return {};
  }
  const values = { expected: formattedValue(cause.expected), actual: formattedValue(cause.actual) };
  return { failureDetails: [{ ...values, formatted: true }] };
}

function entryFor(type: ResultEvent['type'], data: ResultData): AssertionResult {
  const details = data.details ?? {};
  const failed = type === 'test:fail';
  return {
    fullName: data.name,
    title: data.name,
    status: statusOf(failed, data),
    failureMessages: failed ? [failureMessage(details.error)] : [],
    ...(failed ? failureValues(details.error) : {}),
    duration: details.duration_ms,
    location: { line: data.line, column: data.column },
  };
}

function prefixed(name: string, children: readonly PendingEntry[]): PendingEntry[] {
  return children.map((child) => ({
    ...child,
    entry: { ...child.entry, fullName: `${name} ${child.entry.fullName}` },
  }));
}

function withHookFailure(
  children: readonly PendingEntry[],
  error: TestFailure | undefined,
): readonly PendingEntry[] {
  if (error?.failureType !== HOOK_FAILED) {
    return children;
  }
  const message = `${String(error.message)}: ${failureMessage(error)}`;
  return children.map((child) =>
    child.cancelled
      ? { ...child, cancelled: false, entry: { ...child.entry, failureMessages: [message] } }
      : child,
  );
}

function isFileItself(data: ResultData): boolean {
  return (
    data.nesting === 0 &&
    data.file !== undefined &&
    path.resolve(data.name) === path.resolve(data.file)
  );
}

function record(state: FileState, type: ResultEvent['type'], data: ResultData): void {
  if (isFileItself(data)) {
    if (type === 'test:fail') {
      state.loadFailures.push(failureMessage(data.details?.error));
    }
    return;
  }
  const firstChild = state.pending.findIndex(({ nesting }) => nesting > data.nesting);
  const children = firstChild === -1 ? [] : prefixed(data.name, state.pending.splice(firstChild));
  const lifted = withHookFailure(children, data.details?.error).map((child) => ({
    ...child,
    nesting: data.nesting,
  }));
  const isSuite = data.details?.type === 'suite';
  const subtestsOnly = data.details?.error?.failureType === 'subtestsFailed';
  const own =
    isSuite || (children.length > 0 && (type === 'test:pass' || subtestsOnly))
      ? []
      : [
          {
            nesting: data.nesting,
            entry: entryFor(type, data),
            cancelled: data.details?.error?.failureType === CANCELLED_BY_PARENT,
          },
        ];
  state.pending.push(...lifted, ...own);
}

const ERROR_LINE = /^\w*Error\b/u;

function loadFailureMessage(state: FileState): string {
  const errorLine = state.stderr
    .split('\n')
    .map((line) => line.trim())
    .find((line) => ERROR_LINE.test(line));
  return [errorLine, ...state.loadFailures, state.stderr]
    .filter((part) => part !== undefined && part !== '')
    .join('\n');
}

function testResult(file: string, state: FileState): NodeTestReport['testResults'][number] {
  const assertionResults = state.pending.map(({ entry }) => entry);
  const loadFailed = state.loadFailures.length > 0;
  const failed = loadFailed || assertionResults.some(({ status }) => status === 'failed');
  return {
    name: file,
    status: failed ? 'failed' : 'passed',
    message: loadFailed ? loadFailureMessage(state) : '',
    assertionResults,
  };
}

function isResultEvent(event: ReporterEvent): event is ResultEvent {
  return RESULT_EVENTS.has(event.type) && event.data !== undefined;
}

function isStderrEvent(event: ReporterEvent): event is StderrEvent {
  return event.type === 'test:stderr' && event.data !== undefined;
}

export function reportFromEvents(events: Iterable<ReporterEvent>): NodeTestReport {
  const files = new Map<string, FileState>();
  for (const event of events) {
    const file = event.data?.file;
    if (file === undefined) {
      continue;
    }
    const state = fileState(files, path.resolve(file));
    if (isStderrEvent(event) && state.stderr.length < MAX_STDERR_LENGTH) {
      state.stderr = `${state.stderr}${String(event.data.message)}`.slice(0, MAX_STDERR_LENGTH);
    }
    if (isResultEvent(event)) {
      record(state, event.type, event.data);
    }
  }
  const testResults = [...files].map(([file, state]) => testResult(file, state));
  const assertions = testResults.flatMap(({ assertionResults }) => assertionResults);
  return {
    numTotalTests: assertions.length,
    numFailedTests: assertions.filter(({ status }) => status === 'failed').length,
    testResults,
  };
}

export default async function* nodeTestReporter(
  source: AsyncIterable<ReporterEvent>,
): AsyncGenerator<string> {
  const events: ReporterEvent[] = [];
  for await (const event of source) {
    events.push(event);
  }
  yield `${JSON.stringify(reportFromEvents(events))}\n`;
}
