import { writeFileSync } from 'node:fs';

export const FAILURE_DETAILS_VARIABLE = 'NITPICKER_TEST_FAILURE_DETAILS';

function reportedName(testCase) {
  const names = [];
  const pending = [testCase];
  for (const entity of pending) {
    names.unshift(entity.name);
    if (entity.parent?.type === 'suite') {
      pending.push(entity.parent);
    }
  }
  return names.join(' ');
}

function valuesOf(error) {
  return error !== undefined && 'expected' in error && 'actual' in error
    ? { expected: String(error.expected), actual: String(error.actual) }
    : {};
}

function detailOf(testModule, testCase) {
  const result = testCase.result();
  if (result?.state !== 'failed') {
    return [];
  }
  return [
    { file: testModule.moduleId, name: reportedName(testCase), ...valuesOf(result.errors?.[0]) },
  ];
}

export default function failureDetailsReporter() {
  return {
    onTestRunEnd(testModules = []) {
      const reportPath = process.env[FAILURE_DETAILS_VARIABLE];
      if (reportPath === undefined || reportPath === '') {
        return;
      }
      const details = testModules.flatMap((testModule) =>
        [...testModule.children.allTests()].flatMap((testCase) => detailOf(testModule, testCase)),
      );
      writeFileSync(reportPath, JSON.stringify(details));
    },
  };
}
