import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptedDigest } from '../../../../../core/command/test-support/accepted-digest.mjs';
import { NO_MUTATION } from '../test-support/python-preset-data.mjs';
import {
  commitBranch,
  fixture,
  fixtureRepository,
  gate,
  pythonE2eEnabled,
  removeRepositories,
  summarize,
} from '../test-support/python-e2e-support.mjs';

const PYPROJECT = readFileSync(path.join(fixture, 'pyproject.toml'), 'utf8');
const TYPE_ERROR = 'def double(value: int) -> str:\n    return value * 2\n';
const MUTATION_DISABLED = {
  environment: {
    CI: 'true',
    NITPICKER_ACCEPT_POLICY_CHANGE: acceptedDigest(['analyzer disabled: mutation'], NO_MUTATION),
  },
};
const CONFIGURED = `${PYPROJECT}\n[tool.basedpyright]\nreportMissingImports = true\n`;
const WEAKENED = `${PYPROJECT}\n[tool.basedpyright]\ntypeCheckingMode = "off"\nignore = ["src/demo/typed.py"]\nexclude = ["src/demo/typed.py"]\nexecutionEnvironments = [{ root = "src", reportReturnType = "none" }]\n`;

const enforceable = (result) =>
  summarize(
    result
      .json('new-findings.json')
      .filter(({ classification }) => classification === 'enforceable'),
  );

describe.skipIf(!pythonE2eEnabled)('Python preset with basedpyright end to end', () => {
  let project;

  beforeAll(() => {
    project = fixtureRepository(['coverage', 'pytest']);
    commitBranch(project, 'configured', {
      'src/demo/typed.py': TYPE_ERROR,
      'pyproject.toml': CONFIGURED,
      ...NO_MUTATION,
    });
    commitBranch(project, 'weakened', {
      'src/demo/typed.py': TYPE_ERROR,
      'pyproject.toml': WEAKENED,
      ...NO_MUTATION,
    });
  });

  afterAll(removeRepositories);

  it('runs basedpyright when the project configures it, in the same strict mode', () => {
    const result = gate(project, 'configured', MUTATION_DISABLED);

    expect(result.exitCode, result.text).toBe(1);
    expect(result.json('summary.json').tools[0].version).toMatch(
      /^ruff@[\d.]+;basedpyright@[\d.]+;coverage@[\d.]+;pytest@[\d.]+;jscpd@[\d.]+$/,
    );
    expect(enforceable(result)).toEqual(['basedpyright reportReturnType typed.py']);
  });

  it('keeps checking when the project config switches basedpyright off for the file', () => {
    const result = gate(project, 'weakened', MUTATION_DISABLED);

    expect(result.exitCode, result.text).toBe(1);
    expect(enforceable(result)).toEqual(['basedpyright reportReturnType typed.py']);
  });
});
