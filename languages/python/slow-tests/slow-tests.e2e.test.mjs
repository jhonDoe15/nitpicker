import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commitBranch,
  fixtureRepository,
  gate,
  pythonE2eEnabled,
  removeRepositories,
} from '../adapters/e2e/test-support/python-e2e-support.mjs';

const CONFIG = JSON.stringify({
  preset: 'python',
  disable: ['mutation'],
  thresholds: { unitTestSeconds: 0.5 },
});
const SLOW_PYTEST = `import time


def test_slow():
    time.sleep(1.5)


def test_quick():
    assert 1 + 1 == 2
`;
const SLOW_UNITTEST = `import time
import unittest


class TestSlow(unittest.TestCase):
    def test_slow(self):
        time.sleep(1.5)

    def test_quick(self):
        self.assertEqual(2, 1 + 1)
`;

const slowTests = (result) =>
  result
    .json('new-findings.json')
    .filter(({ rule }) => rule === 'slow-test')
    .map(({ tool, path: file, identity, classification }) => [
      tool,
      file,
      identity,
      classification,
    ]);

describe.skipIf(!pythonE2eEnabled)('Python slow test gate end to end', () => {
  let project;
  beforeAll(() => {
    project = fixtureRepository(['coverage', 'pytest', 'mypy']);
    commitBranch(project, 'slow-pytest', {
      'nitpicker.config.json': CONFIG,
      'tests/test_slow.py': SLOW_PYTEST,
    });
    commitBranch(project, 'slow-integration', {
      'nitpicker.config.json': CONFIG,
      'tests/integration/test_slow.py': SLOW_PYTEST,
    });
    commitBranch(project, 'slow-unittest', {
      'nitpicker.config.json': JSON.stringify({
        preset: 'python',
        disable: ['mutation'],
        thresholds: { unitTestSeconds: 0.5 },
        python: { testRunner: 'unittest' },
      }),
      'tests/test_slow.py': SLOW_UNITTEST,
    });
    commitBranch(project, 'slow-excepted', {
      'nitpicker.config.json': JSON.stringify({
        preset: 'python',
        disable: ['mutation'],
        thresholds: { unitTestSeconds: 0.5 },
        exceptions: [{ rule: 'slow-test', paths: ['tests/**'], reason: 'real wait' }],
      }),
      'tests/test_slow.py': SLOW_PYTEST,
    });
  });
  afterAll(removeRepositories);

  it('fails a new pytest test over the unit budget and only that test', () => {
    const result = gate(project, 'slow-pytest');

    expect(result.exitCode, result.text).toBe(1);
    expect(slowTests(result)).toEqual([
      ['test-runtime', 'tests/test_slow.py', 'test:tests.test_slow#test_slow', 'enforceable'],
    ]);
    expect(result.text).toMatch(
      /test_slow test_slow took \d+\.\d s; a unit test may take 0\.5 s\./u,
    );
  });

  it('gives a test under an integration folder the integration budget', () => {
    const result = gate(project, 'slow-integration');

    expect(slowTests(result)).toEqual([]);
  });

  it('times unittest tests with the project unittest runner', () => {
    const result = gate(project, 'slow-unittest');

    expect(slowTests(result)).toEqual([
      [
        'test-runtime',
        'tests/test_slow.py',
        'test:test_slow.TestSlow#test_slow',
        'enforceable',
      ],
    ]);
  });

  it('lets a top-level exception for slow-test lift the finding', () => {
    const result = gate(project, 'slow-excepted');

    expect(slowTests(result)).toEqual([]);
  });
});
