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

describe.skipIf(!pythonE2eEnabled)('Python preset on a nose2 project', () => {
  let nose2;
  afterAll(removeRepositories);
  beforeAll(() => {
    nose2 = project(
      {
        'nitpicker.config.json': '{ "preset": "python", "disable": ["mutation"] }\n',
        'nose2.cfg': '[unittest]\nstart-dir = tests\n',
        'tests/__init__.py': '',
      },
      ['coverage', 'nose2'],
    );
    commitBranch(nose2, 'tested', {
      'calc/sign.py': SIGN,
      'tests/test_sign.py':
        'from calc.sign import sign\n\n\ndef test_positive():\n    assert sign(2) == 1\n\n\ndef test_negative():\n    assert sign(-2) == -1\n',
    });
  });
  it('runs the test functions with nose2 under coverage', () => {
    const result = gate(nose2, 'tested');

    expect(result.exitCode, result.text).toBe(0);
    expect(result.json('summary.json').tools[0].version).toMatch(
      /^ruff@[\d.]+;(?:mypy|pyright)@[\d.]+;coverage@[\d.]+;nose2@[\d.]+;jscpd@[\d.]+$/,
    );
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
