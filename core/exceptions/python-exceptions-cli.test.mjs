import { describe, expect, it } from 'vitest';
import { RULE_IDS } from '../../shared/policy.mjs';
import { commit, pythonRepository, run, usePythonCli, write } from '../diff/fixtures/python-cli.mjs';

usePythonCli();

describe('exceptions with "preset": "python"', () => {
  const config = (...entries) => `${JSON.stringify({ preset: 'python', exceptions: entries })}\n`;
  const lifted = {
    rule: RULE_IDS.functionParameters,
    paths: ['src/demo/a.py'],
    function: 'Service.wide',
    reason: 'A reviewed reason.',
  };
  const wide = {
    file: 'src/demo/a.py',
    name: 'Service.wide',
    start: 4,
    end: 5,
    lines: 2,
    statements: 1,
    maxControlNesting: 0,
    parameters: 4,
  };
  const SOURCE = 'import os\n\n\ndef value():\n    return 2\n';
  const enforceable = (result) =>
    result
      .json('new-findings.json')
      .filter(({ classification }) => classification === 'enforceable')
      .map(({ symbol, message }) => [symbol, message]);

  it('fails a wide method and names the entry that accepts it', () => {
    const root = pythonRepository();
    write(root, { 'src/demo/a.py': SOURCE, 'structure-data.json': JSON.stringify([wide]) });
    commit(root, 'add a wide method');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(enforceable(result)).toEqual([
      [
        'Service.wide',
        'Service.wide has 4 parameters; limit is 3. If a reviewer agrees this is intended, add {"rule":"function-parameters-limit","paths":["src/demo/a.py"],"function":"Service.wide","reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
      ],
    ]);
  });

  it('accepts a wide method with the exception added in the same change', () => {
    const root = pythonRepository();
    write(root, {
      'nitpicker.config.json': config(lifted),
      'src/demo/a.py': SOURCE,
      'structure-data.json': JSON.stringify([wide]),
    });
    commit(root, 'add a wide method and its exception');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(enforceable(result)).toEqual([]);
  });

  it('keeps a legacy wide method unchanged when the change removes the exception', () => {
    const root = pythonRepository({
      'nitpicker.config.json': config(lifted),
      'src/demo/a.py': SOURCE,
      'structure-data.json': JSON.stringify([wide]),
    });
    write(root, { 'nitpicker.config.json': config(), 'src/demo/b.py': 'VALUE = 1\n' });
    commit(root, 'drop the exception');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(enforceable(result)).toEqual([]);
  });
});
