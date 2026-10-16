import path from 'node:path';

function errorMessage(error) {
  if (error === undefined || Object.keys(error).length === 0) return undefined;
  return typeof error.stack === 'string' ? error.stack : String(error.message ?? 'failed');
}

function assertionFor(test, failed) {
  return {
    fullName: test.fullTitle,
    title: test.title,
    status: failed ? 'failed' : 'passed',
    failureMessages: failed ? [errorMessage(test.err) ?? 'failed'] : [],
    duration: test.duration,
  };
}

function isHook(test) {
  return /^"(?:before|after) (?:all|each)" hook/u.test(test.title ?? '');
}

export function reportFromMocha(mochaReport, projectRoot) {
  const failures = new Set((mochaReport.failures ?? []).map((test) => test.fullTitle));
  const pending = new Set((mochaReport.pending ?? []).map((test) => test.fullTitle));
  const tests = [...(mochaReport.tests ?? []), ...(mochaReport.failures ?? []).filter(isHook)];
  const byFile = Map.groupBy(tests, (test) => path.resolve(projectRoot, test.file ?? '.'));
  const testResults = [...byFile].map(([file, fileTests]) => {
    const assertionResults = fileTests.map((test) => ({
      ...assertionFor(test, failures.has(test.fullTitle)),
      ...(pending.has(test.fullTitle) ? { status: 'pending' } : {}),
    }));
    return {
      name: file,
      status: assertionResults.some(({ status }) => status === 'failed') ? 'failed' : 'passed',
      message: '',
      assertionResults,
    };
  });
  const assertions = testResults.flatMap(({ assertionResults }) => assertionResults);
  return {
    numTotalTests: assertions.length,
    numFailedTests: assertions.filter(({ status }) => status === 'failed').length,
    testResults,
  };
}
