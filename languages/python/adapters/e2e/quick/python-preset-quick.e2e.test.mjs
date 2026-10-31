import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VIOLATION } from '../test-support/python-preset-data.mjs';
import {
  commitBranch,
  fixtureRepository,
  gate,
  pythonE2eEnabled,
  removeRepositories,
} from '../test-support/python-e2e-support.mjs';

const QUICK_LINE =
  'Quick run: skipped mutation, tests, coverage, crap, test-runtime. Run nitpicker without --quick before you finish.';

describe.skipIf(!pythonE2eEnabled)('Python preset quick run end to end', () => {
  let project;
  beforeAll(() => {
    project = fixtureRepository(['coverage', 'mutmut', 'pytest', 'mypy']);
    commitBranch(project, 'failing-test', {
      'tests/test_more.py': 'def test_one():\n    assert 1 == 2\n',
      'src/demo/bad.py': VIOLATION,
    });
  });
  afterAll(removeRepositories);
  it('judges the static findings, skips the tests and the mutation run, and says so', () => {
    const result = gate(project, 'failing-test', { extra: ['--quick'] });

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('tool-errors.json')).toEqual([]);
    expect(
      result
        .json('new-findings.json')
        .filter(({ tool, path: file }) => tool.startsWith('ruff') && file === 'src/demo/bad.py')
        .map(({ tool, rule }) => `${tool} ${rule}`)
        .sort(),
    ).toEqual(['ruff F401', 'ruff-format format']);
    const summary = result.json('summary.json');
    expect(summary.tools.map(({ name }) => name)).toEqual(['python', 'repository-hygiene']);
    expect(summary.quick.message).toBe(QUICK_LINE);
    expect(result.text).toContain(QUICK_LINE);
  });
  it('still reports the failing test in the full run of the same branch', () => {
    const result = gate(project, 'failing-test');

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('tool-errors.json').map(({ rule }) => rule)).toEqual(['tests-failed']);
    expect(result.json('summary.json').quick).toBeUndefined();
  });
});
