import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  HIDDEN_ERROR,
  TYPE_ERROR,
  WEAKENED_MYPY,
  WEAKENED_PYRIGHT,
} from '../test-support/python-preset-data.mjs';
import {
  commitBranch,
  fixtureRepository,
  gate,
  pythonE2eEnabled,
  removeRepositories,
} from '../test-support/python-e2e-support.mjs';
import {
  GATE_PACKAGES,
  enforceable,
  pythonExceptionRoute,
  reportedFindings,
  withoutMutants,
} from '../test-support/python-gate-support.mjs';

describe.skipIf(!pythonE2eEnabled)('Python preset type checker configuration end to end', () => {
  let project;
  beforeAll(() => {
    project = fixtureRepository(GATE_PACKAGES);
    commitBranch(project, 'pyright', {
      'src/demo/typed.py': TYPE_ERROR,
      'pyrightconfig.json': '{}\n',
    });
    commitBranch(project, 'weakened-mypy', {
      'src/demo/typed.py': TYPE_ERROR,
      'pyproject.toml': WEAKENED_MYPY,
    });
    commitBranch(project, 'weakened-pyright', {
      'src/demo/typed.py': TYPE_ERROR,
      'pyrightconfig.json': `${WEAKENED_PYRIGHT}\n`,
    });
    commitBranch(project, 'hidden-from-types', { 'src/demo/hidden.py': HIDDEN_ERROR });
  });
  afterAll(removeRepositories);
  it('runs pyright when the project has a pyright config, in its strict mode', () => {
    const result = gate(project, 'pyright');

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('summary.json').tools[0].version).toMatch(
      /^ruff@[\d.]+;pyright@[\d.]+;coverage@[\d.]+;pytest@[\d.]+;jscpd@[\d.]+$/,
    );
    expect(withoutMutants(enforceable(result))).toEqual(['pyright reportReturnType typed.py']);
  });
  it('keeps checking when the project config switches mypy off for the file', () => {
    const result = gate(project, 'weakened-mypy');

    expect(result.exitCode, result.text).toBe(1);
    expect(withoutMutants(enforceable(result))).toEqual(['mypy return-value typed.py']);
  });
  it('keeps checking when the project config ignores or excludes the file in pyright', () => {
    const result = gate(project, 'weakened-pyright');

    expect(result.exitCode, result.text).toBe(1);
    expect(withoutMutants(enforceable(result))).toEqual(['pyright reportReturnType typed.py']);
  });
  it('fails code hidden from the checkers with @no_type_check', () => {
    const result = gate(project, 'hidden-from-types');

    expect(result.exitCode, result.text).toBe(1);
    expect(withoutMutants(enforceable(result))).toEqual(['python-rules no-type-check hidden.py']);
    expect(reportedFindings(result.text)).toEqual([
      'python-rules/no-type-check src/demo/hidden.py:5: ' +
        '`hidden` is excluded from type checking by `@no_type_check`. ' +
        'Remove the decorator and annotate the code so the checker can verify it. ' +
        pythonExceptionRoute('no-type-check', 'src/demo/hidden.py'),
    ]);
  });
});
