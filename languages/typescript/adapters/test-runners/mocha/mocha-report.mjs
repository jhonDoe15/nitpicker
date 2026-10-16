import path from 'node:path';

const LOAD_FAILURE_MARKER = 'Exception during run:';

function errorMessage(error) {
  return typeof error.stack === 'string' ? error.stack : String(error.message ?? 'failed');
}

function hasError(test) {
  return Object.keys(test.err ?? {}).length > 0;
}

function testKey(test) {
  return `${String(test.file)}\0${String(test.fullTitle)}`;
}

function testStatus(test, pending) {
  if (hasError(test)) {
    return 'failed';
  }
  return pending.has(testKey(test)) ? 'pending' : 'passed';
}

function assertionFor(test, pending) {
  const status = testStatus(test, pending);
  return {
    fullName: test.fullTitle,
    title: test.title,
    status,
    failureMessages: status === 'failed' ? [errorMessage(test.err)] : [],
    duration: test.duration,
  };
}

function isHook(test) {
  return /^"(?:before|after) (?:all|each)" hook/u.test(test.title ?? '');
}

function testFile(test, projectRoot) {
  return test.file === undefined ? undefined : path.resolve(projectRoot, test.file);
}

function reportOf(testResults) {
  const assertions = testResults.flatMap(({ assertionResults }) => assertionResults);
  return {
    numTotalTests: assertions.length,
    numFailedTests: assertions.filter(({ status }) => status === 'failed').length,
    testResults,
  };
}

export function reportFromMocha(mochaReport, projectRoot) {
  const pending = new Set((mochaReport.pending ?? []).map(testKey));
  const tests = [...(mochaReport.tests ?? []), ...(mochaReport.failures ?? []).filter(isHook)];
  const byFile = Map.groupBy(tests, (test) => testFile(test, projectRoot));
  return reportOf(
    [...byFile].map(([file, fileTests]) => {
      const assertionResults = fileTests.map((test) => assertionFor(test, pending));
      return {
        name: file,
        status: assertionResults.some(({ status }) => status === 'failed') ? 'failed' : 'passed',
        message: '',
        assertionResults,
      };
    }),
  );
}

function failedFile(output, testFiles) {
  const positions = testFiles
    .map((file) => ({ file, index: output.indexOf(file) }))
    .filter(({ index }) => index !== -1)
    .toSorted((left, right) => left.index - right.index);
  return positions[0]?.file ?? testFiles[0];
}

export function loadFailureReport(stderr, testFiles) {
  const start = stderr.indexOf(LOAD_FAILURE_MARKER);
  if (start === -1) {
    return undefined;
  }
  const output = stderr.slice(start + LOAD_FAILURE_MARKER.length).trim();
  return {
    numTotalTests: 0,
    numFailedTests: 0,
    testResults: [
      {
        name: failedFile(output, testFiles),
        status: 'failed',
        message: output,
        assertionResults: [],
      },
    ],
  };
}
