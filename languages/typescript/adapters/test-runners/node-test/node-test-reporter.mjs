import path from 'node:path';

const RESULT_EVENTS = new Set(['test:pass', 'test:fail']);
const CANCELLED_BY_PARENT = 'cancelledByParent';
const HOOK_FAILED = 'hookFailed';
const MAX_STDERR_LENGTH = 2000;

function fileState(files, file) {
  const known = files.get(file);
  if (known !== undefined) {
    return known;
  }
  const created = { pending: [], loadFailures: [], stderr: '' };
  files.set(file, created);
  return created;
}

function failureMessage(error) {
  const cause = error?.cause;
  const message = cause instanceof Error ? cause.stack : (cause?.message ?? error?.message);
  return typeof message === 'string' ? message : String(cause ?? error ?? 'failed');
}

function statusOf(failed, data) {
  if (data.skip !== undefined || data.todo !== undefined) {
    return 'pending';
  }
  return failed ? 'failed' : 'passed';
}

function entryFor(type, data) {
  const details = data.details ?? {};
  const failed = type === 'test:fail';
  return {
    fullName: data.name,
    title: data.name,
    status: statusOf(failed, data),
    failureMessages: failed ? [failureMessage(details.error)] : [],
    duration: details.duration_ms,
    location: { line: data.line, column: data.column },
  };
}

function prefixed(name, children) {
  return children.map((child) => ({
    ...child,
    entry: { ...child.entry, fullName: `${name} ${child.entry.fullName}` },
  }));
}

function withHookFailure(children, error) {
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

function isFileItself(data) {
  return (
    data.nesting === 0 &&
    data.file !== undefined &&
    path.resolve(data.name) === path.resolve(data.file)
  );
}

function record(state, type, data) {
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

const ERROR_LINE = /^(?:\w+)?Error\b/u;

function loadFailureMessage(state) {
  const errorLine = state.stderr
    .split('\n')
    .map((line) => line.trim())
    .find((line) => ERROR_LINE.test(line));
  return [errorLine, ...state.loadFailures, state.stderr]
    .filter((part) => part !== undefined && part !== '')
    .join('\n');
}

function testResult(file, state) {
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

export function reportFromEvents(events) {
  const files = new Map();
  for (const { type, data } of events) {
    if (data?.file === undefined) {
      continue;
    }
    const state = fileState(files, path.resolve(data.file));
    if (type === 'test:stderr' && state.stderr.length < MAX_STDERR_LENGTH) {
      state.stderr = `${state.stderr}${String(data.message)}`.slice(0, MAX_STDERR_LENGTH);
    }
    if (RESULT_EVENTS.has(type)) {
      record(state, type, data);
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

export default async function* nodeTestReporter(source) {
  const events = [];
  for await (const event of source) {
    events.push(event);
  }
  yield `${JSON.stringify(reportFromEvents(events))}\n`;
}
