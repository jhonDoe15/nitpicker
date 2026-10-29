import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commitBranch,
  fixtureRepository,
  gate,
  pythonE2eEnabled,
  removeRepositories,
} from '../test-support/python-e2e-support.mjs';

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

const findingsOf = (result, rule) =>
  result
    .json('new-findings.json')
    .filter((finding) => finding.rule === rule)
    .map(({ tool, path: file, identity, classification, message }) => [
      tool,
      file,
      identity,
      classification,
      message,
    ]);

const slowTests = (result) => findingsOf(result, 'slow-test').map((row) => row.slice(0, 4));

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
    commitBranch(project, 'slow-no-junit', {
      'nitpicker.config.json': CONFIG,
      'pytest.ini': '[pytest]\naddopts = -p no:junitxml\n',
      'tests/test_slow.py': SLOW_PYTEST,
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
      ['test-runtime', 'tests/test_slow.py', 'test:tests/test_slow.py::::test_slow', 'enforceable'],
    ]);
    const [message] = findingsOf(result, 'slow-test').map((row) => row[4]);
    expect(message).toMatch(/^test_slow took (?:1\.[5-9]|[2-9]\.\d) s;/u);
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
        'test:tests/test_slow.py::TestSlow::test_slow',
        'enforceable',
      ],
    ]);
  });

  it('still times a project whose pytest options turn the JUnit plugin off', () => {
    const result = gate(project, 'slow-no-junit');

    expect(slowTests(result)).toEqual([
      ['test-runtime', 'tests/test_slow.py', 'test:tests/test_slow.py::::test_slow', 'enforceable'],
    ]);
    expect(findingsOf(result, 'slow-test-not-timed')).toEqual([]);
  });

  it('lets a top-level exception for slow-test lift the finding', () => {
    const result = gate(project, 'slow-excepted');

    expect(slowTests(result)).toEqual([]);
  });
});
