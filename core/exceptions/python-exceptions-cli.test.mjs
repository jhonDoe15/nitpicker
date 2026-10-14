import { describe, expect, it } from 'vitest';
import { PYTHON_ANALYZER_NAME } from '../../languages/python/adapters/python-analyzer.mjs';
import { RULE_IDS } from '../../shared/policy.mjs';
import {
  commit,
  pythonRepository,
  run,
  usePythonCli,
  write,
} from '../diff/fixtures/python-cli.mjs';

usePythonCli();

describe('exceptions with "preset": "python"', () => {
  describe('exceptions for the rules nitpicker adds', () => {
    const exceptions = (...entries) =>
      `${JSON.stringify({ preset: 'python', exceptions: entries })}\n`;
    const entry = (rule, functionName) => ({
      rule,
      paths: ['src/demo/a.py'],
      ...(functionName === undefined ? {} : { function: functionName }),
      reason: 'A reviewed reason.',
    });
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
    const change = (config) => {
      const root = pythonRepository();
      write(root, {
        'nitpicker.config.json': config,
        'src/demo/a.py': 'import os\n\n\ndef value():\n    return 2\n',
        'structure-data.json': JSON.stringify([wide]),
      });
      commit(root, 'add a wide method');
      return run(root);
    };

    it('fails the wide method and names it', () => {
      const failing = change('{ "preset": "python" }\n');

      expect(failing.exitCode, failing.text).toBe(1);
      expect(failing.json('summary.json').tools[0].name).toBe(PYTHON_ANALYZER_NAME);
      expect(failing.json('new-findings.json').map(({ symbol }) => symbol)).toEqual([
        'Service.wide',
      ]);
    });

    it.each([
      ['the function name', entry(RULE_IDS.functionParameters, 'wide'), 0],
      ['the whole path', entry(RULE_IDS.functionParameters), 0],
      ['another function', entry(RULE_IDS.functionParameters, 'narrow'), 1],
    ])('lifts the finding by %s only as far as the entry reaches', (_, lifted, exitCode) => {
      const result = change(exceptions(lifted));

      expect(result.exitCode, result.text).toBe(exitCode);
    });
  });
});
