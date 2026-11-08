import { spawnSync } from 'node:child_process';
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

const PLUGINS = ['pytest', 'pytest-rerunfailures', 'flaky', 'pytest-retry'];
const FAILS_ONCE = (decorator, needed = 1) => `import pytest
from flaky import flaky

attempts = []


${decorator}
def test_total():
    attempts.append(1)
    assert len(attempts) >= ${String(needed)}
`;

let root;

beforeAll(() => {
  if (pythonE2eEnabled) {
    root = repository();
    installPackages(root, PLUGINS);
  }
}, 180_000);

afterAll(removeRepositories);

function run(plugin, decorator, needed = 2) {
  write(root, { 'tests/test_orders.py': FAILS_ONCE(decorator, needed) });
  const result = spawnSync(
    path.join(root, '.venv', 'bin', 'python'),
    [PYTEST_SCRIPT, '-q', '-p', 'no:cacheprovider', '-p', plugin, 'tests'],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, PYTEST_DISABLE_PLUGIN_AUTOLOAD: '1', PYTHONDONTWRITEBYTECODE: '1' },
      timeout: 60_000,
    },
  );
  return { status: result.status, output: result.stdout };
}

describe.skipIf(!pythonE2eEnabled)('a test that passes only on a retry', () => {
  it.each([
    ['pytest-rerunfailures', 'pytest_rerunfailures', '@pytest.mark.flaky(reruns=2)', true],
    ['flaky', 'flaky.flaky_pytest_plugin', '@flaky(max_runs=3)', false],
    ['pytest-retry', 'pytest_retry.retry_plugin', '@pytest.mark.flaky(retries=2)', true],
  ])('counts as failed under %s', (_name, plugin, decorator, firstFailureShown) => {
    const { status, output } = run(plugin, decorator);

    expect(status).toBe(1);
    expect(output).toContain('FAILED tests/test_orders.py::test_total');
    expect(output).toContain('Passed only on a later attempt, so it counts as failed');
    expect(output.includes('First failure:')).toBe(firstFailureShown);
  });

  it('passes a test that passes on its first attempt', () => {
    const { status, output } = run('pytest_rerunfailures', '@pytest.mark.flaky(reruns=2)', 1);

    expect(status).toBe(0);
    expect(output).toContain('1 passed');
  });

  it('reports a failure without a retry as it is', () => {
    const { status, output } = run('pytest_rerunfailures', '@pytest.mark.flaky(reruns=0)');

    expect(status).toBe(1);
    expect(output).not.toContain('Passed only on a later attempt');
    expect(output).toContain('assert 1 >= 2');
  });
});
