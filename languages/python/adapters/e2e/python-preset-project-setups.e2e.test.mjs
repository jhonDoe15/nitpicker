import { cpSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GREETER_HI, GREETER_HI_TEST, VIOLATION } from './python-preset-data.mjs';
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
} from './python-e2e-support.mjs';

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
    });
    it('runs unittest under coverage and passes a clean change', () => {
      const result = gate(plain, 'clean');

      expect(result.exitCode, result.text).toBe(0);
      expect(result.json('summary.json').tools[0].version).toMatch(
        /^ruff@[\d.]+;black@[\d.]+;(?:mypy|pyright)@[\d.]+;coverage@[\d.]+;unittest;jscpd@[\d.]+$/,
      );
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
        'legacy/old.py': 'print "old"\n',
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
        'nitpicker.config.json': '{ "preset": "python", "exclude": ["legacy/**"] }\n',
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
    it('does not hand excluded files to the formatter', () => {
      const result = gate(configured, 'excluded');

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
