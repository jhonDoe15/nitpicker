import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  installPackages,
  pythonE2eEnabled,
  removeRepositories,
  repository,
  write,
} from '../../e2e/test-support/python-e2e-support.mjs';
import { PYTEST_SCRIPT } from '../../execution/python-test-runner.mjs';

const PLUGINS = ['pytest', 'pytest-rerunfailures', 'flaky', 'pytest-retry', 'pytest-xdist'];
const RETRIED =
  'Passed only on a later attempt, so it counts as failed: a retry (a flaky mark, a retry plugin or a retry decorator) hides a flaky or racy test. Remove the retry and fix the cause.';
const FAILS_ONCE = (decorator, needed) => `import pytest
from flaky import flaky

attempts = []


${decorator}
def test_total():
    attempts.append(1)
    assert len(attempts) >= ${String(needed)}
`;
const SUBTESTS = `import unittest


def test_totals(subtests):
    for total in [1, 2, 3]:
        with subtests.test(total=total):
            assert total > 0


class TotalsTest(unittest.TestCase):
    def test_totals(self):
        for total in [1, 2, 3]:
            with self.subTest(total=total):
                self.assertGreater(total, 0)
`;
const TEST_CASE = /<testcase classname="([^"]+)" name="([^"]+)"[^>]*>([\s\S]*?)<\/testcase>/gu;
const FAILURE = /<failure message="([^"]*)"/u;
const FIRST_FAILURE = '\n\nFirst failure:\n';

let root;

beforeAll(() => {
  if (pythonE2eEnabled) {
    root = repository();
    installPackages(root, PLUGINS);
  }
});

afterAll(removeRepositories);

function unescaped(text) {
  return text
    .replaceAll('&#10;', '\n')
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

function failuresIn(report) {
  const cases = [...readFileSync(report, 'utf8').matchAll(TEST_CASE)];
  return cases.flatMap(([, classname, name, body]) => {
    const text = FAILURE.exec(body)?.[1];
    if (text === undefined) {
      return [];
    }
    const message = unescaped(text);
    return [
      {
        test: `${classname}.${name}`,
        message: message.split(FIRST_FAILURE)[0],
        firstFailureShown: message.includes(FIRST_FAILURE),
      },
    ];
  });
}

function run(plugins, code, extra = []) {
  write(root, { 'tests/test_orders.py': code });
  const report = path.join(root, 'report.xml');
  const loaded = plugins.flatMap((plugin) => ['-p', plugin]);
  const result = spawnSync(
    path.join(root, '.venv', 'bin', 'python'),
    [
      PYTEST_SCRIPT,
      '-q',
      '-p',
      'no:cacheprovider',
      ...loaded,
      ...extra,
      `--junitxml=${report}`,
      'tests',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PYTEST_DISABLE_PLUGIN_AUTOLOAD: '1', PYTHONDONTWRITEBYTECODE: '1' },
      timeout: 60_000,
    },
  );
  return { status: result.status, failures: failuresIn(report) };
}

describe.skipIf(!pythonE2eEnabled)('a test that passes only on a retry', () => {
  it.each([
    ['pytest-rerunfailures', ['pytest_rerunfailures'], [], '@pytest.mark.flaky(reruns=2)', true],
    ['flaky', ['flaky.flaky_pytest_plugin'], [], '@flaky(max_runs=3)', false],
    ['pytest-retry', ['pytest_retry.retry_plugin'], [], '@pytest.mark.flaky(retries=2)', true],
    [
      'pytest-rerunfailures under xdist',
      ['pytest_rerunfailures', 'xdist'],
      ['-n', '2'],
      '@pytest.mark.flaky(reruns=2)',
      true,
    ],
  ])('counts as failed under %s', (_name, plugins, extra, decorator, firstFailureShown) => {
    const outcome = run(plugins, FAILS_ONCE(decorator, 2), extra);

    expect(outcome).toEqual({
      status: 1,
      failures: [{ test: 'tests.test_orders.test_total', message: RETRIED, firstFailureShown }],
    });
  });

  it('passes a test that passes on its first attempt', () => {
    const outcome = run(['pytest_rerunfailures'], FAILS_ONCE('@pytest.mark.flaky(reruns=2)', 1));

    expect(outcome).toEqual({ status: 0, failures: [] });
  });

  it('passes subtests, which report several times for one test', () => {
    expect(run(['pytest_rerunfailures'], SUBTESTS)).toEqual({ status: 0, failures: [] });
  });

  it('reports a failure without a retry as it is', () => {
    const outcome = run(['pytest_rerunfailures'], FAILS_ONCE('@pytest.mark.flaky(reruns=0)', 2));

    expect(outcome.status).toBe(1);
    expect(
      outcome.failures.map(({ test, firstFailureShown }) => ({ test, firstFailureShown })),
    ).toEqual([{ test: 'tests.test_orders.test_total', firstFailureShown: false }]);
    expect(outcome.failures[0].message).toMatch(/^assert 1 >= 2\n/u);
  });
});
