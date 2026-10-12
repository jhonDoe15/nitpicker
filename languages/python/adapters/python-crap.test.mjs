import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createScratch } from './fixtures/scratch.mjs';
import {
  crap,
  findLizard,
  LIZARD_REPORT,
  pinnedLizardVersion,
  readPythonCrapFindings,
} from './python-crap.mjs';

const scratch = createScratch();
const { setEnvironment } = scratch;

afterEach(scratch.cleanup);

const project = ({ files = { 'src/demo/a.py': 'def f():\n    return 1\n' }, tools } = {}) =>
  scratch.project({ files, tools });

function script(directory, name, body) {
  const target = path.join(directory, name);
  writeFileSync(target, `#!/bin/sh\n${body}\n`);
  chmodSync(target, 0o755);
  return target;
}

const WITHOUT_LIZARD = ['ruff', 'black', 'coverage', 'python', 'python3'];

describe('the pinned lizard version', () => {
  it('is the one the Java preset pins', () => {
    expect(pinnedLizardVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('finding lizard', () => {
  it('uses the lizard of the project environment when it is the pinned version', () => {
    const { context } = project();

    expect(findLizard(context)).toEqual(['lizard']);
  });

  it('falls back to uvx with the pinned version when the environment has no lizard', () => {
    const tools = scratch.directory();
    script(tools, 'uvx', `echo "${pinnedLizardVersion()}"`);
    setEnvironment('PATH', `${tools}${path.delimiter}${process.env.PATH}`);
    setEnvironment('NITPICKER_LIZARD', undefined);
    const { context } = project({ tools: WITHOUT_LIZARD });

    expect(findLizard(context)).toEqual(['uvx', `lizard==${pinnedLizardVersion()}`]);
  });

  it('uses the executable named by NITPICKER_LIZARD, and only that one', () => {
    const { context } = project();
    const tools = scratch.directory();
    setEnvironment(
      'NITPICKER_LIZARD',
      script(tools, 'my-lizard', `echo "${pinnedLizardVersion()}"`),
    );

    expect(findLizard(context)).toEqual([path.join(tools, 'my-lizard')]);
  });

  it('names every attempt, the pinned version and the way to install it when none matches', () => {
    const { context } = project();
    const tools = scratch.directory();
    setEnvironment('NITPICKER_LIZARD', script(tools, 'old-lizard', 'echo 1.0.0'));

    const failure = () => findLizard(context);

    expect(failure).toThrow(
      expect.objectContaining({
        rule: 'lizard-failed',
        message: expect.stringContaining(`lizard ${pinnedLizardVersion()} is required`),
      }),
    );
    expect(failure).toThrow('old-lizard: 1.0.0');
    expect(failure).toThrow(`pip install lizard==${pinnedLizardVersion()}`);
  });

  it('reports a lizard that cannot run', () => {
    const { context } = project();
    setEnvironment('NITPICKER_LIZARD', path.join(scratch.directory(), 'missing-lizard'));

    expect(() => findLizard(context)).toThrow('missing-lizard: not runnable');
  });
});

describe('the crap step', () => {
  it('writes the lizard csv of the listed source files', () => {
    const csv = '1,1,5,0,1,"f@1-2@src/demo/a.py","src/demo/a.py","f","f( )",1,2\n';
    const { context, reportRoot } = project({
      files: { 'src/demo/a.py': 'def f():\n    return 1\n', 'lizard-data.csv': csv },
    });

    crap(context);

    expect(readFileSync(path.join(reportRoot, LIZARD_REPORT), 'utf8')).toBe(csv);
  });

  it('writes an empty report without running lizard when there are no Python files', () => {
    const { context, reportRoot } = project({ files: {}, tools: WITHOUT_LIZARD });
    setEnvironment('NITPICKER_LIZARD', path.join(scratch.directory(), 'missing-lizard'));

    crap(context);

    expect(readFileSync(path.join(reportRoot, LIZARD_REPORT), 'utf8')).toBe('');
  });

  it('fails with the lizard-failed rule when lizard exits with an error', () => {
    const { context } = project({
      files: { 'src/demo/a.py': 'x = 1\n', 'fail.json': '{ "lizard": "lizard exploded" }' },
    });

    expect(() => {
      crap(context);
    }).toThrow(
      expect.objectContaining({
        rule: 'lizard-failed',
        message: expect.stringContaining('lizard exploded'),
      }),
    );
  });
});

describe('reading the CRAP inputs', () => {
  const LIZARD = '1,3,5,0,1,"f@1-2@src/demo/a.py","src/demo/a.py","f","f( )",1,2\n';
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
        lizard: LIZARD,
        coverage: coverage(covered),
        projectRoot: root,
        roots: [root],
        crapLimit,
      });

    expect(read(undefined)).toEqual([
      expect.objectContaining({ rule: 'crap-score-limit', symbol: 'f', path: 'src/demo/a.py' }),
    ]);
    expect(read(13)).toEqual([]);
    expect(read(undefined, 1)).toEqual([]);
  });

  it('keys the identity on the function text', () => {
    const { root } = project();
    const identityOf = () =>
      readPythonCrapFindings({
        lizard: LIZARD,
        coverage: coverage(0),
        projectRoot: root,
        roots: [root],
      })[0].identity;
    const before = identityOf();
    writeFileSync(path.join(root, 'src/demo/a.py'), 'def f():\n    return 2\n');

    expect(identityOf()).not.toBe(before);
  });
});
