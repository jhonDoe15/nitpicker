import { rmSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import {
  copyFixtureRepository,
  runInitThenAll,
} from '../../../../../core/init/test-support/init-then-all.mjs';
import { fixture, installPackages, pythonE2eEnabled } from '../test-support/python-e2e-support.mjs';

const roots = [];

describe.skipIf(!pythonE2eEnabled)('nitpicker init then --all on a Python project', () => {
  afterAll(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('runs a pyproject project without a setup error', () => {
    const root = copyFixtureRepository({
      fixtureRoot: fixture,
      prefix: 'nitpicker-init-python-',
      ignored: ['.venv/', '__pycache__/', 'mutants/', 'reports/'],
    });
    roots.push(root);
    installPackages(root, ['-e', '.', 'coverage', 'mutmut', 'pytest', 'mypy']);
    const result = runInitThenAll(root);

    expect(result.init.exitCode, result.init.text).toBe(0);
    expect(result.init.text.split('\n').slice(0, 5)).toEqual([
      'nitpicker init: Python, pip, pytest, mypy, ruff (preset "python")',
      '',
      'Nothing to install: every peer nitpicker needs is already there.',
      '',
      'created nitpicker.config.json',
    ]);
    expect(result.config).toBe('{ "preset": "python" }\n');
    expect(result.all.exitCode, result.all.text).not.toBe(2);
    expect(result.toolErrors).toEqual([]);
    expect(result.summary.overallStatus).not.toBe('tool-error');
  });
});
