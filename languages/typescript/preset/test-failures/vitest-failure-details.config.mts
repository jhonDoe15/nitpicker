import { writeFileSync } from 'node:fs';

export type FailureSuite = {
  readonly type: 'suite';
  readonly name: string;
  readonly parent?: FailureSuite | { readonly type: 'module' } | undefined;
};

export type FailureTestCase = {
  readonly name: string;
  readonly parent?: FailureSuite | { readonly type: 'module' } | undefined;
  readonly result: () =>
    { readonly state?: string; readonly errors?: readonly object[] } | undefined;
};

export type FailureTestModule = {
  readonly moduleId: string;
  readonly children: { readonly allTests: () => Iterable<FailureTestCase> };
};

export const FAILURE_DETAILS_VARIABLE = 'NITPICKER_TEST_FAILURE_DETAILS';

function reportedName(testCase: FailureTestCase): string {
  const names: string[] = [];
  const pending: (FailureTestCase | FailureSuite)[] = [testCase];
  for (const entity of pending) {
    names.unshift(entity.name);
    if (entity.parent?.type === 'suite') {
      pending.push(entity.parent);
    }
  }
  return names.join(' ');
}

function valuesOf(error: object | undefined): { expected?: string; actual?: string } {
  return error !== undefined && 'expected' in error && 'actual' in error
    ? { expected: String(error.expected), actual: String(error.actual) }
    : {};
}

function detailOf(testModule: FailureTestModule, testCase: FailureTestCase): object[] {
  const result = testCase.result();
  if (result?.state !== 'failed') {
    return [];
  }
  return [
    { file: testModule.moduleId, name: reportedName(testCase), ...valuesOf(result.errors?.[0]) },
  ];
}

export default function failureDetailsReporter(): {
  readonly onTestRunEnd: (testModules?: readonly FailureTestModule[]) => void;
} {
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
