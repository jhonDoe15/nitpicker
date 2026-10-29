import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createScratch } from '../test-support/scratch.mjs';
import { readPythonCrapFindings } from './python-crap.mjs';

const scratch = createScratch();

afterEach(scratch.cleanup);

const project = () => scratch.project({ files: { 'src/demo/a.py': 'def f():\n    return 1\n' } });

describe('reading the CRAP inputs', () => {
  const FUNCTIONS = [
    {
      file: 'src/demo/a.py',
      name: 'f',
      start: 1,
      definition: 1,
      bodyStart: 2,
      end: 2,
      complexity: 3,
    },
  ];
  const coverage = (coveredLines) =>
    JSON.stringify({
      files: {
        'src/demo/a.py': {
          functions: {
            f: {
              executed_lines: coveredLines === 0 ? [] : [2],
              missing_lines: coveredLines === 0 ? [2] : [],
              summary: {
                num_statements: 1,
                covered_lines: coveredLines,
                num_branches: 0,
                covered_branches: 0,
              },
            },
          },
        },
      },
    });

  it('flags an untested complex function, and honours the configured limit', () => {
    const { root } = project();
    const read = (crapLimit, covered = 0) =>
      readPythonCrapFindings({
        functions: FUNCTIONS,
        coverage: coverage(covered),
        projectRoot: root,
        roots: [root],
        crapLimit,
      });

    expect(read(undefined)).toEqual([
      {
        tool: 'crap',
        rule: 'crap-score-limit',
        path: 'src/demo/a.py',
        symbol: 'f',
        identity: expect.any(String),
        message:
          'f has CRAP 12.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function. If this is intended, add {"rule":"crap-score-limit","paths":["src/demo/a.py"],"function":"f","reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        location: { line: 1, endLine: 2 },
        ratchet: {
          key: 'function:f:crap',
          value: 12,
          worseMessage:
            'f CRAP rose from {base} to 12 (limit 9). Put new code in a new function and cover it with tests. If this is intended, add {"rule":"crap-score-limit","paths":["src/demo/a.py"],"function":"f","reason":"..."} to "exceptions" in nitpicker.config.json.',
          heldMessage:
            'f: CRAP 12.00 (limit 9), allowed because base was {base}; any increase fails.',
        },
      },
    ]);
    expect(read(13)).toEqual([]);
    expect(read(undefined, 1)).toEqual([]);
  });

  it('scores no function of a test file, which coverage does not measure', () => {
    const { root } = project();
    const testFunctions = ['src/polls/tests.py', 'src/demo/tests/test_a.py', 'test_b.py'].map(
      (file) => ({ ...FUNCTIONS[0], file }),
    );

    expect(
      readPythonCrapFindings({
        functions: testFunctions,
        coverage: coverage(0),
        projectRoot: root,
        roots: [root],
      }),
    ).toEqual([]);
  });

  it('keys the identity on the function text', () => {
    const { root } = project();
    const identityOf = () =>
      readPythonCrapFindings({
        functions: FUNCTIONS,
        coverage: coverage(0),
        projectRoot: root,
        roots: [root],
      })[0].identity;
    const before = identityOf();
    writeFileSync(path.join(root, 'src/demo/a.py'), 'def f():\n    return 2\n');

    expect(identityOf()).not.toBe(before);
  });
});
