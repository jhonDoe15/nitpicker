import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commitBranch,
  gate,
  initializeRepository,
  installPackages,
  pythonE2eEnabled,
  removeRepositories,
  repository,
  summarize,
  write,
} from '../test-support/python-e2e-support.mjs';

const IGNORED = '.venv/\n__pycache__/\nmutants/\n';
const SURVIVOR = 'mutmut mutant-survived sign.py';
const UNCOVERED_FINDINGS = [
  'coverage-py changed-branch-coverage sign.py',
  SURVIVOR,
  SURVIVOR,
  SURVIVOR,
];
const WEAK_FINDINGS = [SURVIVOR, SURVIVOR];
const SIGN = 'def sign(x: int) -> int:\n    if x > 0:\n        return 1\n    return -1\n';

function enforceable(result) {
  return summarize(
    result
      .json('new-findings.json')
      .filter(({ classification }) => classification === 'enforceable'),
  );
}

function project(files, packages) {
  const root = repository();
  write(root, { '.gitignore': IGNORED, 'calc/__init__.py': '', ...files });
  initializeRepository(root, 'base');
  installPackages(root, packages);
  return root;
}

function signTests(...cases) {
  const tests = cases.map(
    ([name, value, expected]) =>
      `def test_${name}():\n    assert sign(${String(value)}) == ${String(expected)}\n`,
  );
  return `from calc.sign import sign\n\n\n${tests.join('\n\n')}`;
}

describe.skipIf(!pythonE2eEnabled)('Python preset on a nose2 project', () => {
  let nose2;
  afterAll(removeRepositories);
  beforeAll(() => {
    nose2 = project(
      {
        'nitpicker.config.json': '{ "preset": "python" }\n',
        'nose2.cfg': '[unittest]\nstart-dir = tests\n',
        'tests/__init__.py': '',
      },
      ['coverage', 'nose2', 'pytest', 'mutmut'],
    );
    const branch = (name, ...cases) => {
      commitBranch(nose2, name, {
        'calc/sign.py': SIGN,
        'tests/test_sign.py': signTests(...cases),
      });
    };
    branch('tested', ['positive', 1, 1], ['zero', 0, -1]);
    branch('uncovered', ['positive', 1, 1]);
    branch('weak', ['positive', 2, 1], ['negative', -2, -1]);
  });
  it('runs the test functions with nose2 under coverage and mutmut', () => {
    const result = gate(nose2, 'tested');

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('summary.json').tools[0].version).toMatch(
      /^ruff@[\d.]+;(?:mypy|pyright)@[\d.]+;coverage@[\d.]+;nose2@[\d.]+;jscpd@[\d.]+$/,
    );
  });
  it('fails a branch no nose2 test takes', () => {
    const result = gate(nose2, 'uncovered');

    expect(result.exitCode, result.text).toBe(1);
    expect(enforceable(result)).toEqual(UNCOVERED_FINDINGS);
  });
  it('fails the survivors that weak nose2 tests leave', () => {
    const result = gate(nose2, 'weak');

    expect(result.exitCode, result.text).toBe(1);
    expect(enforceable(result)).toEqual(WEAK_FINDINGS);
  });
});

describe.skipIf(!pythonE2eEnabled)(
  'Python preset mutating a unittest project whose tests pytest does not collect by default',
  () => {
    let plain;
    afterAll(removeRepositories);
    beforeAll(() => {
      plain = project({ 'nitpicker.config.json': '{ "preset": "python" }\n' }, [
        'coverage',
        'pytest',
        'mutmut',
      ]);
      commitBranch(plain, 'weak', {
        'calc/sign.py': SIGN,
        'tests.py':
          'import unittest\n\nfrom calc.sign import sign\n\n\nclass SignTest(unittest.TestCase):\n    def test_signs(self):\n        self.assertEqual([sign(1), sign(-2)], [1, -1])\n',
      });
    });
    it('runs the mutants against the tests.py of unittest and fails a survivor', () => {
      const result = gate(plain, 'weak');

      expect(result.exitCode, result.text).toBe(1);
      expect(enforceable(result)).toEqual(['mutmut mutant-survived sign.py']);
    });
  },
);

describe.skipIf(!pythonE2eEnabled)(
  'Python preset on a project that measures its subprocesses with coverage.py',
  () => {
    let processes;
    afterAll(removeRepositories);
    beforeAll(() => {
      processes = project(
        {
          'nitpicker.config.json': '{ "preset": "python", "disable": ["mutation"] }\n',
          '.coveragerc': '[run]\nconcurrency = multiprocessing\n',
        },
        ['coverage'],
      );
      commitBranch(processes, 'child', {
        'calc/child.py':
          'import multiprocessing\n\n\ndef check(value: int) -> str:\n    if value > 0:\n        return "positive"\n    return "other"\n\n\ndef run_in_child(value: int) -> int | None:\n    process = multiprocessing.get_context("spawn").Process(target=check, args=(value,))\n    process.start()\n    process.join()\n    return process.exitcode\n',
        'tests/test_child.py':
          'import unittest\n\nfrom calc.child import run_in_child\n\n\nclass ChildTest(unittest.TestCase):\n    def test_both_values(self):\n        self.assertEqual([run_in_child(1), run_in_child(-1)], [0, 0])\n',
      });
    });
    it('measures the code that only a child process runs', () => {
      const result = gate(processes, 'child');

      expect(result.exitCode, result.text).toBe(0);
      expect(enforceable(result)).toEqual([]);
    });
  },
);
