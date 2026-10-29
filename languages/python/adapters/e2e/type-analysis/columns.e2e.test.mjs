import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptedDigest } from '../../../../../core/command/test-support/accepted-digest.mjs';
import {
  commitBranch,
  fixtureRepository,
  gate,
  pythonE2eEnabled,
  removeRepositories,
} from '../test-support/python-e2e-support.mjs';

const RULES = new Set(['ruff/F821', 'mypy/name-defined']);
const LINE = 'LABEL = "é😀"; VALUE: int = undefined_name';
const ASCII_LINE = 'COUNT: int = missing_name';
const MYPY_CONFIG = {
  'nitpicker.config.json':
    '{ "preset": "python", "disable": ["mutation"], "python": { "typeChecker": "mypy" } }\n',
};
const MUTATION_DISABLED = {
  environment: {
    CI: 'true',
    NITPICKER_ACCEPT_POLICY_CHANGE: acceptedDigest(['analyzer disabled: mutation'], MYPY_CONFIG),
  },
};

describe.skipIf(!pythonE2eEnabled)('Python finding columns end to end', () => {
  let project;

  beforeAll(() => {
    project = fixtureRepository(['coverage', 'pytest', 'mypy']);
    commitBranch(project, 'non-ascii', {
      'src/demo/labels.py': `${LINE}\n${ASCII_LINE}\n`,
      ...MYPY_CONFIG,
    });
  });

  afterAll(removeRepositories);

  it('reports columns in UTF-16 code units, and none for mypy after non-ASCII text', () => {
    const result = gate(project, 'non-ascii', MUTATION_DISABLED);
    const columns = result
      .json('new-findings.json')
      .filter(({ tool, rule }) => RULES.has(`${tool}/${rule}`))
      .map(({ tool, location }) => `${tool} ${String(location.line)}:${String(location.column)}`)
      .sort();

    expect(columns, result.text).toEqual([
      'mypy 1:undefined',
      'mypy 2:14',
      'ruff 1:29',
      'ruff 2:14',
    ]);
    expect(LINE.indexOf('undefined_name') + 1).toBe(29);
    expect(ASCII_LINE.indexOf('missing_name') + 1).toBe(14);
  });
});
