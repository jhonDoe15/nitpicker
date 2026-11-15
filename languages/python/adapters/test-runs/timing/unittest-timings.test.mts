import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pythonUsable } from '../../../metrics/python-helpers.mts';
import { UNITTEST_SCRIPT } from '../../execution/python-test-runner.mjs';
import { JUNIT_REPORT, RERUN_REPORT } from '../junit-results.mjs';
import { readJunit } from '../../test-support/views/test-views.mts';
import { readSlowTestFindings } from '../../typed/report/report-views.mts';
import { retimeSlowTests } from './slow-retime.mjs';
import { useGitFixtures } from '../../../../../core/diff/git/test-support/git-repository.mts';

const { temporaryRoot } = useGitFixtures();

const CASES = `import unittest

class Outcomes(unittest.TestCase):
    def test_pass(self):
        pass
    def test_fail(self):
        self.fail('failure')
    def test_error(self):
        raise ValueError('error')
    @unittest.skip('skip')
    def test_skip(self):
        pass
    @unittest.expectedFailure
    def test_expected(self):
        self.fail('expected')
    @unittest.expectedFailure
    def test_unexpected(self):
        pass
    def test_subtest_failure(self):
        with self.subTest(value=1):
            self.fail('subtest')
    def test_subtest_error(self):
        with self.subTest(value=1):
            raise ValueError('subtest')
`;

function setup(source = CASES) {
  const projectRoot = temporaryRoot('nitpicker-unittest-timing-');
  const reportRoot = path.join(projectRoot, 'reports');
  mkdirSync(reportRoot);
  mkdirSync(path.join(projectRoot, 'tests'));
  writeFileSync(path.join(projectRoot, 'tests/test_outcomes.py'), source);
  const result = spawnSync(
    'python3',
    [UNITTEST_SCRIPT, path.join(reportRoot, JUNIT_REPORT), 'discover', '-s', 'tests'],
    { cwd: projectRoot, encoding: 'utf8', timeout: 120_000 },
  );
  return { projectRoot, reportRoot, result };
}

describe.skipIf(!pythonUsable())('unittest timing outcomes and runtime selection', () => {
  it('leaves failed, errored, skipped and unsuccessful subtests out of slow findings', () => {
    const options = setup();
    expect(options.result.status).toBe(1);
    expect(
      Object.fromEntries(readJunit(options.reportRoot).map(({ name, outcome }) => [name, outcome])),
    ).toEqual({
      test_pass: 'passed',
      test_fail: 'failed',
      test_error: 'failed',
      test_skip: 'skipped',
      test_expected: 'skipped',
      test_unexpected: 'failed',
      test_subtest_failure: 'failed',
      test_subtest_error: 'failed',
    });
    expect(
      readSlowTestFindings({ ...options, limits: { unitTestSeconds: -1 } }).map(
        ({ identity }) => identity,
      ),
    ).toEqual(['test:tests/test_outcomes.py::Outcomes::test_pass']);
  });

  it('reruns a test discovered in a directory without __init__.py using its runtime id', () => {
    const options = setup(
      'import unittest\n\nclass Outcomes(unittest.TestCase):\n    def test_pass(self):\n        pass\n',
    );
    const original = readJunit(options.reportRoot)[0];
    expect(original?.runtimeId).toBe('test_outcomes.Outcomes.test_pass');
    retimeSlowTests(
      {
        ...options,
        snapshot: 'head',
        project: { testRunner: 'unittest' },
        testSeconds: { unitTestSeconds: -1 },
        launcher: {
          launch: (_tool: string, args: readonly string[]) => ({
            command: 'python3',
            args,
            env: {},
          }),
        },
        env: {},
      },
      { testsRan: true },
    );
    const rerun = readJunit(options.reportRoot, RERUN_REPORT);
    expect(rerun.map(({ id, runtimeId }) => [id, runtimeId])).toEqual([
      [original?.id, original?.runtimeId],
    ]);
  });
});
