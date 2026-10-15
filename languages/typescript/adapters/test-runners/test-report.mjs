import path from 'node:path';

const MAX_LISTED_FAILURES = 5;
const MAX_ASSERTION_LINE_LENGTH = 200;
const ESCAPE_CHARACTER = String.fromCodePoint(0x1b);
const ANSI_PATTERN = new RegExp(`${ESCAPE_CHARACTER}\\[[0-9;]*m`, 'gu');

export function testFailures(report, projectRoot) {
  const failures = [];
  const testResults = Array.isArray(report?.testResults) ? report.testResults : [];
  for (const testResult of testResults) {
    const file = projectFile(projectRoot, testResult?.name);
    const failedAssertions = Array.isArray(testResult?.assertionResults)
      ? testResult.assertionResults.filter((assertion) => assertion?.status === 'failed')
      : [];
    for (const assertion of failedAssertions) {
      failures.push({
        file,
        name: assertionName(assertion),
        assertion: firstLine(
          assertion.failureMessages?.find((message) => typeof message === 'string'),
        ),
      });
    }
    if (failedAssertions.length === 0 && testResult?.status === 'failed') {
      failures.push({ file, name: 'could not run', assertion: firstLine(testResult.message) });
    }
  }
  return failures;
}

function projectFile(projectRoot, name) {
  if (typeof name !== 'string') {
    return '<unknown test file>';
  }
  const relativePath = path.relative(projectRoot, name).replaceAll('\\', '/');
  return relativePath.startsWith('..') || path.isAbsolute(relativePath) ? name : relativePath;
}

export function findingPath(file) {
  return file.startsWith('<') || file.startsWith('..') || path.isAbsolute(file) ? '.' : file;
}

function firstLine(message) {
  const line =
    typeof message === 'string'
      ? message
          .replaceAll(ANSI_PATTERN, '')
          .split('\n')
          .map((candidate) => candidate.trim())
          .find((candidate) => candidate.length > 0)
      : undefined;
  if (line === undefined) {
    return '';
  }
  return line.length > MAX_ASSERTION_LINE_LENGTH
    ? `${line.slice(0, MAX_ASSERTION_LINE_LENGTH)}…`
    : line;
}

export function formatTestFailures(report, projectRoot) {
  const failures = testFailures(report, projectRoot);
  const failedCount = Number.isInteger(report?.numFailedTests)
    ? Math.max(report.numFailedTests, failures.length)
    : failures.length;
  const headline = `${String(failedCount)} ${failedCount === 1 ? 'test fails' : 'tests fail'}, so coverage, CRAP and mutation were skipped. Fix the tests and rerun`;
  if (failures.length === 0) {
    return `${headline}; the report named no test.`;
  }
  const listed = failures
    .slice(0, MAX_LISTED_FAILURES)
    .map(
      ({ file, name, assertion }) =>
        `  ${file} > ${name}${assertion === '' ? '' : `: ${assertion}`}`,
    );
  const omitted = failures.length - listed.length;
  return [
    `${headline}:`,
    ...listed,
    ...(omitted > 0 ? [`  … and ${String(omitted)} more`] : []),
  ].join('\n');
}

function assertionName(assertion) {
  if (typeof assertion.fullName === 'string') {
    return assertion.fullName;
  }
  if (typeof assertion.title === 'string') {
    return assertion.title;
  }
  return '<unknown test>';
}
