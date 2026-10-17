import { cpSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptedDigest } from '../../../../core/command/test-support/accepted-digest.mjs';
import { GREETER_HI, GREETER_HI_TEST, VIOLATION } from './test-support/python-preset-data.mjs';
import {
  command,
  commitBranch,
  fixture,
  git,
  gate,
  initializeRepository,
  installPackages,
  pythonE2eEnabled,
  removeRepositories,
  repository,
  summarize,
  write,
} from './test-support/python-e2e-support.mjs';

describe.skipIf(!pythonE2eEnabled)(
  'Python preset on a unittest project formatted with black, using tools from the PATH',
  () => {
    let plain;
    afterAll(removeRepositories);
    beforeAll(() => {
      plain = repository();
      write(plain, {
        'nitpicker.config.json': '{ "preset": "python", "python": { "testRunner": "unittest" } }\n',
        '.gitignore': '.venv/\n__pycache__/\nmutants/\n',
        'pyproject.toml': '[tool.black]\nline-length = 88\n',
        'pkg/__init__.py': '',
        'pkg/shape.py': 'def area(side):\n    return side * side\n',
        'tests/test_shape.py':
          'import unittest\n\nfrom pkg.shape import area\n\n\nclass AreaTest(unittest.TestCase):\n    def test_area(self):\n        self.assertEqual(area(3), 9)\n',
      });
      initializeRepository(plain, 'base');
      installPackages(plain, ['coverage', 'mutmut', 'pytest']);
      commitBranch(plain, 'clean', {
        'pkg/shape.py': 'def area(side):\n    return side**2\n',
      });
      commitBranch(plain, 'unformatted', { 'pkg/extra.py': 'x = {"a":1}\n' });
      commitBranch(plain, 'slow', {
        'tests/test_shape.py':
          'import time\nimport unittest\n\nfrom pkg.shape import area\n\n\nclass AreaTest(unittest.TestCase):\n    def test_area(self):\n        self.assertEqual(area(3), 9)\n\n    def test_area_slow(self):\n        time.sleep(5.2)\n        self.assertEqual(area(2), 4)\n',
      });
    });
    it('runs unittest under coverage and passes a clean change', () => {
      const result = gate(plain, 'clean');

      expect(result.exitCode, result.text).toBe(0);
      expect(result.json('summary.json').tools[0].version).toMatch(
        /^ruff@[\d.]+;black@[\d.]+;(?:mypy|pyright)@[\d.]+;coverage@[\d.]+;unittest;jscpd@[\d.]+$/,
      );
    });
    it('times the unittest tests and fails a new slow one', () => {
      const result = gate(plain, 'slow');

      expect(result.exitCode, result.text).toBe(1);
      expect(
        result
          .json('new-findings.json')
          .filter(({ rule }) => rule === 'slow-test')
          .map(({ path, message }) => [path, message.split(';')[0]]),
      ).toEqual([['tests/test_shape.py', 'AreaTest.test_area_slow took 5.2 s']]);
    });
    it('checks formatting with black', () => {
      const result = gate(plain, 'unformatted');

      expect(result.exitCode, result.text).toBe(1);
      expect(
        summarize(
          result
            .json('new-findings.json')
            .filter(({ classification }) => classification === 'enforceable'),
        ),
      ).toEqual(['black format extra.py']);
    });
  },
);
const LEGACY_SOURCE = 'print "old"\n';
const EXCLUSION = 'exclude added: legacy/**';
const EXCLUDING_CONFIG = '{ "preset": "python", "exclude": ["legacy/**"] }\n';

describe.skipIf(!pythonE2eEnabled)(
  'Python preset on a pytest project with coverage and xdist in its addopts and a legacy python 2 file',
  () => {
    let configured;
    afterAll(removeRepositories);
    beforeAll(() => {
      configured = repository();
      write(configured, {
        'nitpicker.config.json': '{ "preset": "python" }\n',
        '.gitignore': '.venv/\n__pycache__/\n',
        'pyproject.toml':
          '[project]\nname = "pkg"\nversion = "0.1.0"\nrequires-python = ">=3.9"\n\n[tool.black]\nline-length = 88\n\n[tool.pytest.ini_options]\naddopts = "--cov=pkg -n 2 --lf"\n\n[tool.mutmut]\nsource_paths = ["pkg"]\n',
        'pkg/__init__.py': '',
        'pkg/shape.py': 'def area(side):\n    return side * side\n',
        'tests/test_shape.py':
          'from pkg.shape import area\n\n\ndef test_area():\n    assert area(3) == 9\n',
        'legacy/old.py': LEGACY_SOURCE,
      });
      initializeRepository(configured, 'base');
      installPackages(configured, [
        'coverage',
        'mutmut',
        'pytest',
        'pytest-cov',
        'pytest-xdist',
        'black',
      ]);
      commitBranch(configured, 'clean', {
        'pkg/shape.py': 'def area(side):\n    return side**2\n',
      });
      commitBranch(configured, 'excluded', {
        'nitpicker.config.json': EXCLUDING_CONFIG,
      });
      git(configured, 'checkout', '-q', '-b', 'no-tests', 'main');
      git(configured, 'rm', '-q', '-r', 'tests');
      git(configured, 'commit', '-q', '-m', 'delete the tests');
    });
    it('keeps the project pytest options working and baselines the file black cannot parse', () => {
      const result = gate(configured, 'clean');

      expect(result.exitCode, result.text).toBe(0);
      expect(result.json('new-findings.json').filter(({ tool }) => tool === 'coverage')).toEqual(
        [],
      );
      expect(result.json('summary.json').tools[0].unchanged).toBeGreaterThan(0);
    });
    it('fails excluding code the base checked until a person accepts exactly that loosening', () => {
      const result = gate(configured, 'excluded');
      const digest = acceptedDigest([EXCLUSION], {
        'nitpicker.config.json': EXCLUDING_CONFIG,
        'legacy/old.py': LEGACY_SOURCE,
      });

      expect(result.exitCode, result.text).toBe(1);
      expect(
        result
          .json('new-findings.json')
          .filter(({ classification }) => classification === 'enforceable'),
      ).toEqual([
        {
          tool: 'nitpicker-config',
          rule: 'policy-loosened',
          path: 'nitpicker.config.json',
          identity: EXCLUSION,
          message: `${EXCLUSION}. Keep the base's policy and change the code until it passes: keep new code under the source roots, where the gate checks it, and fix findings instead of excluding, excepting or reclassifying the code. If the policy change is intended, stop and ask a person reviewing this change: only they accept exactly these loosenings, with --accept-policy-change=${digest} at an interactive terminal or NITPICKER_ACCEPT_POLICY_CHANGE=${digest} in CI.`,
          classification: 'enforceable',
        },
      ]);
    });
    it('does not hand excluded files to the formatter', () => {
      const digest = acceptedDigest([EXCLUSION], {
        'nitpicker.config.json': EXCLUDING_CONFIG,
        'legacy/old.py': LEGACY_SOURCE,
      });
      const result = gate(configured, 'excluded', {
        environment: { CI: 'true', NITPICKER_ACCEPT_POLICY_CHANGE: digest },
      });

      expect(result.exitCode, result.text).toBe(0);
      expect(result.json('resolved-findings.json')).toEqual([
        {
          tool: 'ruff',
          rule: 'invalid-syntax',
          path: 'legacy/old.py',
          identity: expect.any(String),
          message: expect.any(String),
          classification: 'enforceable',
          location: { line: 1, column: 7 },
        },
      ]);
    });
    it('fails a change that deletes every test', () => {
      const result = gate(configured, 'no-tests');

      expect(result.exitCode, result.text).toBe(1);
      expect(
        summarize(
          result
            .json('new-findings.json')
            .filter(({ classification }) => classification === 'enforceable'),
        ),
      ).toEqual(['python no-tests-ran .']);
    });
  },
);
describe.skipIf(!pythonE2eEnabled)('Python preset on a uv project', () => {
  let locked;
  afterAll(removeRepositories);
  beforeAll(() => {
    locked = repository();
    cpSync(fixture, locked, { recursive: true });
    command(locked, 'uv', ['lock', '-q']);
    command(locked, 'uv', ['sync', '-q']);
    initializeRepository(locked, 'base');
    commitBranch(locked, 'clean', {
      'src/demo/greeter.py': GREETER_HI,
      'tests/test_greeter.py': GREETER_HI_TEST,
    });
    commitBranch(locked, 'violation', { 'src/demo/bad.py': VIOLATION });
  });
  it('runs the tools through uv and passes a clean change', () => {
    const result = gate(locked, 'clean');

    expect(result.exitCode, result.text).toBe(0);
  });
  it('fails a new violation', () => {
    const result = gate(locked, 'violation');

    expect(result.exitCode, result.text).toBe(1);
  });
});
