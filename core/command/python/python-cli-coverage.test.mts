import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mts';
import { commit } from '../../diff/git/test-support/git-repository.mts';
import type { PresetRun } from '../test-support/fixture-types.mts';
import { fieldAt } from '../../../scripts/json/fields.mts';
import { fieldOf, listOf } from '../../../shared/values/readers.mts';
import { usePythonFixtures } from './test-support/python-cli-harness.mts';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mts';
import { EDITED_LINE_SENTENCE } from '../../diff/comparison/positions/touched-lines.mjs';

const { pythonRepository, run } = usePythonFixtures(nitpickerCli);

describe('changed-branch-coverage with "preset": "python"', () => {
  const BRANCHY = [
    'import os',
    '',
    '',
    'def value(x):',
    '    if x:',
    '        return 1',
    '    return 2',
    '',
  ].join('\n');
  const coverageData = (
    executed: readonly (readonly number[])[],
    missing: readonly (readonly number[])[],
  ) =>
    JSON.stringify({
      files: { 'src/demo/a.py': { executed_branches: executed, missing_branches: missing } },
    });
  const GAP = coverageData([[5, 6]], [[5, 7]]);
  const branchyRepository = () =>
    pythonRepository({ 'src/demo/a.py': BRANCHY, 'coverage-data.json': GAP });
  const newBranchFindings = (result: Pick<PresetRun, 'json'>) =>
    listOf(result.json('new-findings.json')).map((entry) => ({
      tool: fieldOf(entry, 'tool'),
      rule: fieldOf(entry, 'rule'),
      path: fieldOf(entry, 'path'),
      line: fieldAt(entry, 'location', 'line'),
      message: fieldOf(entry, 'message'),
    }));
  it('fails an uncovered branch whose line the change touches', () => {
    const root = branchyRepository();
    writeFiles(root, { 'src/demo/a.py': BRANCHY.replace('if x:', 'if x:  # checked') });
    commit(root, 'touch the branch line');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(newBranchFindings(result)).toEqual([
      {
        tool: 'coverage-py',
        rule: 'changed-branch-coverage',
        path: 'src/demo/a.py',
        line: 5,
        message: [
          'Branch coverage is 50.00%; minimum is 95%. Not taken: the branch to line 7.',
          "Test it, or remove it if it can't happen.",
          'To accept the file, add it to "exclude" in nitpicker.config.json.',
          EDITED_LINE_SENTENCE,
        ].join(' '),
      },
    ]);
  });
  it('fails a new branch that no test takes and passes once a test covers it', () => {
    const root = branchyRepository();
    writeFiles(root, {
      'src/demo/a.py': `${BRANCHY}\n\ndef sign(y):\n    if y < 0:\n        return -1\n    return 1\n`,
      'coverage-data.json': coverageData(
        [[5, 6]],
        [
          [5, 7],
          [11, 12],
          [11, 13],
        ],
      ),
    });
    commit(root, 'add an untested branch');

    const failing = run(root);

    expect(failing.exitCode, failing.text).toBe(1);
    expect(newBranchFindings(failing).map((entry) => entry.line)).toEqual([11]);

    writeFiles(root, {
      'coverage-data.json': coverageData(
        [
          [5, 6],
          [11, 12],
          [11, 13],
        ],
        [[5, 7]],
      ),
    });
    commit(root, 'test it');

    expect(run(root).exitCode).toBe(0);
  });
});
