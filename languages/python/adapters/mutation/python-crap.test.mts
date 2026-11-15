import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createScratch } from '../test-support/scratch.mts';
import type { PythonFunctionEntry } from '../../ingest/typed/coverage-types.mts';
import { readPythonCrapFindings } from './python-crap.mts';

const scratch = createScratch();
const ANY_STRING: unknown = expect.any(String);

afterEach(scratch.cleanup);

const project = () => scratch.project({ files: { 'src/demo/a.py': 'def f():\n    return 1\n' } });

describe('reading the CRAP inputs', () => {
  const FUNCTION: PythonFunctionEntry = {
    file: 'src/demo/a.py',
    name: 'f',
    start: 1,
    definition: 1,
    bodyStart: 2,
    end: 2,
    complexity: 3,
    statementLine: 2,
  };
  const FUNCTIONS = [FUNCTION];
  const coverage = (coveredLines: number): string =>
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
    const read = (crapLimit: number | undefined, covered = 0) =>
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
        identity: ANY_STRING,
        message:
          'f has CRAP 12.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function. If this is intended, add {"rule":"crap-score-limit","paths":["src/demo/a.py"],"function":"f","reason":"..."} to "exceptions" in nitpicker.config.json.',
        allowedForm: 'Test its uncovered branches, or split a branchy part into its own function.',
        classification: 'enforceable',
        anchor: { key: 'function:crap:text:15a68d14db1abd87a016d9fe' },
        location: { line: 1, endLine: 2 },
        ratchet: {
          key: 'function:f:crap',
          declarationKey: 'function:f:declaration:e3568148b125be1a657be1d3:crap',
          value: 12,
          worseMessage:
            'f CRAP rose from {base} to 12 (limit 9). Put new code in a new function and cover it with tests. If this is intended, add {"rule":"crap-score-limit","paths":["src/demo/a.py"],"function":"f","reason":"..."} to "exceptions" in nitpicker.config.json.',
          worseAllowedForm: 'Put new code in a new function and cover it with tests.',
          heldMessage:
            'f: CRAP 12.00 (limit 9), allowed because base was {base}; any increase fails.',
        },
      },
    ]);
    expect(read(13)).toEqual([]);
    expect(read(undefined, 1)).toEqual([]);
  });

  it('scores no function of a test file, which coverage does not measure', () => {
    const { root } = scratch.project({
      files: {
        'manage.py': '',
        'pytest.ini': '[pytest]\npython_files = check_*.py test_*.py\n',
      },
    });
    const testFunctions = [
      'src/polls/tests.py',
      'src/demo/tests/test_a.py',
      'test_b.py',
      'src/demo/check_c.py',
    ].map((file) => ({ ...FUNCTION, file }));

    expect(
      readPythonCrapFindings({
        functions: testFunctions,
        coverage: coverage(0),
        projectRoot: root,
        roots: [root],
      }),
    ).toEqual([]);
  });

  it('scores a tests.py outside a Django project, which pytest does not collect', () => {
    const { root } = scratch.project({
      files: { 'src/demo/tests.py': 'def f():\n    return 1\n' },
    });

    expect(
      readPythonCrapFindings({
        functions: [{ ...FUNCTION, file: 'src/demo/tests.py' }],
        coverage: coverage(0).replace('src/demo/a.py', 'src/demo/tests.py'),
        projectRoot: root,
        roots: [root],
      }).map(({ path: file }) => file),
    ).toEqual(['src/demo/tests.py']);
  });

  it('keys the identity on the function text', () => {
    const { root } = project();
    const identityOf = () =>
      readPythonCrapFindings({
        functions: FUNCTIONS,
        coverage: coverage(0),
        projectRoot: root,
        roots: [root],
      })[0]?.identity;
    const before = identityOf();
    writeFileSync(path.join(root, 'src/demo/a.py'), 'def f():\n    return 2\n');

    expect(identityOf()).not.toBe(before);
  });
});
