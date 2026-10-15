const ERROR_LINE = /^\w*Error\b/u;

function fileEntry(files, file) {
  if (!files.has(file)) {
    files.set(file, { name: file, status: 'passed', assertionResults: [], stderr: [] });
  }
  return files.get(file);
}

function failureMessage(error) {
  const cause = error?.cause;
  const message = cause instanceof Error ? cause.message : error?.message;
  return typeof message === 'string' ? message : '';
}

function statusOf({ type, skip, todo }) {
  if (type === 'test:fail') return 'failed';
  if (skip) return 'pending';
  return todo ? 'todo' : 'passed';
}

function isCounted({ type, data }) {
  return (
    data.details?.type !== 'suite' &&
    !(type === 'test:fail' && data.details?.error?.failureType === 'subtestsFailed')
  );
}

function recordTest(files, event) {
  const { data } = event;
  const entry = fileEntry(files, data.file);
  const status = statusOf({ type: event.type, skip: data.skip, todo: data.todo });
  if (status === 'failed' && isFileLevelFailure(data)) {
    entry.status = 'failed';
    return;
  }
  entry.assertionResults.push({
    fullName: data.name,
    title: data.name,
    status,
    failureMessages: status === 'failed' ? [failureMessage(data.details?.error)] : [],
  });
}

function isFileLevelFailure({ name, file, nesting }) {
  return nesting === 0 && file.replaceAll('\\', '/').endsWith(`/${name.replaceAll('\\', '/')}`);
}

function recordStderr(files, data) {
  if (typeof data.file === 'string') {
    fileEntry(files, data.file).stderr.push(data.message);
  }
}

function loadFailureMessage(stderr) {
  const lines = stderr
    .join('')
    .split('\n')
    .map((line) => line.trim());
  return lines.find((line) => ERROR_LINE.test(line)) ?? lines.find((line) => line.length > 0) ?? '';
}

function finishFile({ stderr, ...entry }) {
  const failed = entry.assertionResults.some(({ status }) => status === 'failed');
  const crashed = entry.status === 'failed' && !failed;
  return {
    ...entry,
    status: failed || crashed ? 'failed' : 'passed',
    message: crashed ? loadFailureMessage(stderr) : '',
  };
}

export function buildReport(files) {
  const testResults = [...files.values()].map(finishFile);
  const results = testResults.flatMap(({ assertionResults }) => assertionResults);
  return {
    numTotalTests: results.length,
    numFailedTests: results.filter(({ status }) => status === 'failed').length,
    testResults,
  };
}

function recordEvent(files, event) {
  if ((event.type === 'test:pass' || event.type === 'test:fail') && isCounted(event)) {
    recordTest(files, event);
    return;
  }
  if (event.type === 'test:stderr') {
    recordStderr(files, event.data);
  }
}

async function* nitpickerTestReport(source) {
  const files = new Map();
  for await (const event of source) {
    recordEvent(files, event);
  }
  yield `${JSON.stringify(buildReport(files))}\n`;
}

export { nitpickerTestReport as default };
