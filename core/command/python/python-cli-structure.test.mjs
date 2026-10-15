import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { commit } from '../../diff/git/test-support/git-repository.mjs';
import { newFindings, usePythonFixtures } from './test-support/python-cli-harness.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';

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
    const metric = (name, parameters) => ({
      file: 'src/demo/a.py',
      name,
      start: 4,
      end: 5,
      lines: 2,
      statements: 1,
      maxControlNesting: 0,
      parameters,
    });
    const lizardRow = (name, ccn) =>
      `2,${ccn},9,0,2,"${name}@4-5@src/demo/a.py","src/demo/a.py","${name}","${name}( )",4,5\n`;
    const coverageOf = (...names) =>
      JSON.stringify({
        files: {
          'src/demo/a.py': {
            functions: Object.fromEntries(
              names.map((name) => [
                name,
                {
                  executed_lines: [],
                  missing_lines: [5],
                  summary: {
                    num_statements: 1,
                    covered_lines: 0,
                    num_branches: 0,
                    covered_branches: 0,
                  },
                },
              ]),
            ),
          },
        },
      });
    const enforceable = (result) =>
      result
        .json('new-findings.json')
        .filter(({ classification }) => classification === 'enforceable')
        .map(({ tool, rule, symbol, message }) => ({ tool, rule, symbol, message }));
    it('gates new structure and CRAP findings, and holds a touched legacy function at its limit unless it grows', () => {
      const root = pythonRepository({
        'structure-data.json': JSON.stringify([metric('value', 4)]),
      });
      writeFiles(root, {
        'src/demo/a.py': 'import os\n\n\ndef value():\n    return 2\n',
        'structure-data.json': JSON.stringify([metric('value', 4), metric('fresh', 4)]),
        'lizard-data.csv': lizardRow('value', 5) + lizardRow('ghost', 1),
        'coverage-data.json': coverageOf('value'),
      });
      commit(root, 'add new functions, touch the legacy one');
      const added = run(root);

      writeFiles(root, {
        'nitpicker.config.json': '{ "preset": "python", "thresholds": { "crapLimit": 40 } }\n',
        'structure-data.json': JSON.stringify([metric('value', 5)]),
        'lizard-data.csv': lizardRow('value', 5),
      });
      commit(root, 'raise the CRAP limit, grow the legacy function');
      const grown = run(root, ['--accept-policy-change']);

      expect(added.exitCode, added.text).toBe(1);
      expect(enforceable(added)).toEqual([
        {
          tool: 'crap',
          rule: 'crap-coverage-unknown',
          symbol: 'ghost',
          message:
            'ghost has unknown coverage and no CRAP score: no test runs it. Add a test that calls it; for inline composition-root wiring, move it to a named function in adapters/ and test that.',
        },
        {
          tool: 'crap',
          rule: 'crap-score-limit',
          symbol: 'value',
          message:
            'value has CRAP 30.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function.',
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
          'This code repeats src/demo/b.py:1 (10 lines). Keep one copy and call it from both places. If the repetition is intended, add src/demo/a.py to "exclude" in nitpicker.config.json.',
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
