import { describe, expect, it } from 'vitest';
import { validateConfig } from '../configuration/validate.mjs';
import { RULE_IDS } from '../../shared/policy.mjs';
import {
  commit,
  LEGACY_VIOLATION,
  pythonRepository,
  run,
  usePythonCli,
  write,
} from './test-support/python-cli.mjs';

usePythonCli();

describe('exceptions with "preset": "python"', () => {
  const config = (...entries) =>
    `${JSON.stringify(validateConfig({ preset: 'python', exceptions: entries }))}\n`;
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
      .map(({ rule, symbol }) => [rule, symbol]);

  it('fails the same wide method without the exception', () => {
    const root = pythonRepository();
    write(root, { 'src/demo/a.py': SOURCE, 'structure-data.json': JSON.stringify([wide]) });
    commit(root, 'add a wide method');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(1);
    expect(enforceable(result)).toEqual([['function-parameters-limit', 'Service.wide']]);
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

  it('keeps a legacy print unchanged when the change removes the python.exceptions entry that lifted it', () => {
    const lintedConfig = (...entries) =>
      `${JSON.stringify(validateConfig({ preset: 'python', python: { exceptions: entries } }))}\n`;
    const root = pythonRepository({
      'nitpicker.config.json': lintedConfig({
        rule: 'T201',
        paths: ['scripts/**'],
        reason: 'A reviewed reason.',
      }),
      'violations.txt': `${LEGACY_VIOLATION}T201|scripts/run.py|\`print\` found\n`,
    });
    write(root, { 'nitpicker.config.json': lintedConfig(), 'src/demo/b.py': 'VALUE = 1\n' });
    commit(root, 'drop the exception');

    const result = run(root);

    expect(result.exitCode, result.text).toBe(0);
    expect(enforceable(result)).toEqual([]);
  });
});
