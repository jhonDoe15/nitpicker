import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import {
  commit,
  pythonRepository,
  run,
  usePythonFixtures,
  write,
} from '../../diff/fixtures/python-cli-harness.mjs';

usePythonFixtures(nitpickerCli);

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
  const coverageData = (executed, missing) =>
    JSON.stringify({
      files: { 'src/demo/a.py': { executed_branches: executed, missing_branches: missing } },
    });
  const GAP = coverageData([[5, 6]], [[5, 7]]);
  const branchyRepository = () =>
    pythonRepository({ 'src/demo/a.py': BRANCHY, 'coverage-data.json': GAP });
  const newBranchFindings = (result) =>
    result.json('new-findings.json').map(({ tool, rule, path: file, message, location }) => ({
      tool,
      rule,
      path: file,
      line: location?.line,
      message,
    }));
  it('fails an uncovered branch whose line the change touches', () => {
    const root = branchyRepository();
    write(root, { 'src/demo/a.py': BRANCHY.replace('if x:', 'if  x:') });
    commit(root, 'touch the branch line');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(newBranchFindings(result)).toEqual([
      {
        tool: 'coverage-py',
        rule: 'changed-branch-coverage',
        path: 'src/demo/a.py',
        line: 5,
        message:
          "Branch coverage is 50.00%; minimum is 95%. Not taken: the branch to line 7. Test it, or remove it if it can't happen. To exempt a file, add it to exclude in nitpicker.config.json.",
      },
    ]);
  });
  it('fails a new branch that no test takes and passes once a test covers it', () => {
    const root = branchyRepository();
    write(root, {
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
    expect(newBranchFindings(failing).map(({ line }) => line)).toEqual([11]);

    write(root, {
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
