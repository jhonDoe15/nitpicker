import { describe, expect, it } from 'vitest';
import {
  coverageOf,
  enforceable,
  fn,
} from '../../../languages/python/adapters/test-support/structure-data.mjs';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { commit } from '../../diff/git/test-support/git-repository.mjs';
import { newFindings, usePythonFixtures } from './test-support/python-cli-harness.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { acceptedDigest } from '../test-support/accepted-digest.mjs';

const { pythonRepository, run } = usePythonFixtures(nitpickerCli);

const CLONE_SOURCE = [
  'def order_total(lines, discount):',
  '    total = 0',
  '    for line in lines:',
  '        if line.price > 0 and line.quantity > 0:',
  '            total += line.price * line.quantity',
  '        else:',
  '            total -= discount',
  '    if total < 0 and discount > 0:',
  '        total = 0',
  '    return total',
  '',
].join('\n');

describe('nitpicker with "preset": "python" and function structure', () => {
  describe('function structure and CRAP', () => {
    it('gates new structure and CRAP findings, and holds a touched legacy function at its limit unless it grows', () => {
      const root = pythonRepository({
        'structure-data.json': JSON.stringify([fn('value', 4, { complexity: 5 })]),
      });
      writeFiles(root, {
        'src/demo/a.py': 'import os\n\n\ndef value():\n    return 2\n',
        'src/demo/b.py': 'def ghost():\n    return 1\n',
        'structure-data.json': JSON.stringify([
          fn('value', 4, { complexity: 5 }),
          fn('fresh', 4),
          fn('ghost', 0, { file: 'src/demo/b.py' }),
        ]),
        'coverage-data.json': coverageOf('value', 'fresh'),
      });
      commit(root, 'add new functions, touch the legacy one');
      const added = run(root);

      writeFiles(root, {
        'nitpicker.config.json': '{ "preset": "python", "thresholds": { "crapLimit": 40 } }\n',
        'structure-data.json': JSON.stringify([fn('value', 5, { complexity: 5 })]),
      });
      commit(root, 'raise the CRAP limit, grow the legacy function');
      const digest = acceptedDigest(['threshold crapLimit raised from 9 to 40'], {
        'nitpicker.config.json': '{ "preset": "python", "thresholds": { "crapLimit": 40 } }\n',
      });
      const grown = run(root, [`--accept-policy-change=${digest}`], { interactive: true });

      expect(added.exitCode, added.text).toBe(1);
      expect(enforceable(added)).toEqual([
        {
          tool: 'crap',
          rule: 'crap-score-limit',
          symbol: 'value',
          message:
            'value has CRAP 30.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function.',
        },
        {
          tool: 'crap',
          rule: 'crap-coverage-unknown',
          symbol: 'ghost',
          message:
            'ghost has unknown coverage and no CRAP score: no test runs it. Add a test that calls it; for inline composition-root wiring, move it to a named function in adapters/ and test that.',
        },
        {
          tool: 'structure',
          rule: 'function-parameters-limit',
          symbol: 'fresh',
          message: 'fresh has 4 parameters; limit is 3',
        },
      ]);
      expect(grown.exitCode, grown.text).toBe(1);
      expect(enforceable(grown)).toEqual([
        {
          tool: 'structure',
          rule: 'function-parameters-limit',
          symbol: 'value',
          message:
            'value grew from 4 to 5 parameters (limit 3). Group related parameters into one object instead of adding another.',
        },
      ]);
    });
  });
  it('fails on a new duplicate and keeps a moved legacy duplicate baselined', () => {
    const root = pythonRepository({ 'src/demo/a.py': CLONE_SOURCE });
    writeFiles(root, { 'src/demo/b.py': CLONE_SOURCE });
    commit(root, 'copy a module');

    const failed = run(root);

    expect(failed.exitCode, failed.text).toBe(1);
    expect(newFindings(failed, 'duplicate-clone')).toEqual([
      {
        tool: 'duplicates',
        rule: 'duplicate-clone',
        path: 'src/demo/a.py',
        identity: 'pair:src/demo/a.py|src/demo/b.py:fragment:8e33a9ff56a22a94c8efc96f:occurrence:1',
        message:
          'This code repeats src/demo/b.py:1 (10 lines). Keep one copy and call it from both places. If the repetition is intended, add src/demo/a.py or src/demo/b.py to "exclude" in nitpicker.config.json. To allow it for some paths, add a "python.exceptions" entry for duplicate-clone in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 1 },
      },
    ]);

    const legacy = pythonRepository({
      'src/demo/a.py': CLONE_SOURCE,
      'src/demo/b.py': CLONE_SOURCE,
    });
    writeFiles(legacy, { 'src/demo/a.py': `import os\n\n\n${CLONE_SOURCE}` });
    commit(legacy, 'move the legacy duplicate');

    expect(run(legacy).exitCode).toBe(0);
  });
});
