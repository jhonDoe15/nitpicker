import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../core/tooling/tool-resolution.mjs';
import {
  mutationSkipFor,
  normalizeStructure,
  parseArguments,
  runQualityArea,
} from './quality-areas-runner.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function snapshotWith(files) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-diff-')));
  temporaryRoots.push(parent);
  const root = path.join(parent, 'head');
  for (const [file, text] of Object.entries(files)) {
    const filePath = path.join(root, file);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, text);
  }
  return root;
}

function runKind(kind, projectRoot) {
  return runQualityArea(
    parseArguments([
      '--analyzer-name',
      kind,
      '--kind',
      kind,
      '--project-root',
      projectRoot,
      '--policy-root',
      PACKAGE_ROOT,
      '--tool-root',
      PACKAGE_ROOT,
      '--snapshot',
      'head',
    ]),
  );
}

describe('crap runner without a coverage report', () => {
  it('reports a skipped tool error instead of an unknown-coverage finding per function', async () => {
    const projectRoot = snapshotWith({
      'package.json': '{"name":"p","type":"module"}\n',
      'src/main/a.ts': 'export function a(): number {\n  return 1;\n}\n',
      'test/a.test.ts': "import { it } from 'vitest';\nit('x', () => {});\n",
    });

    const findings = await runKind('crap', projectRoot);

    expect(findings).toEqual([
      expect.objectContaining({
        tool: 'crap',
        rule: 'tests-failed-skipped',
        classification: 'tool-error',
      }),
    ]);
  });
});

describe('structure limit messages', () => {
  function violations(metrics) {
    return normalizeStructure(
      {
        functions: [
          { source: 'src/a.ts', function: 'big', start: 1, end: 90, sourceHash: 'h', ...metrics },
        ],
      },
      'structure',
    )
      .filter(({ classification }) => classification === 'enforceable')
      .map(({ message }) => message);
  }

  it('tells the author nested functions count and where to move them', () => {
    expect(violations({ lines: 60 })).toEqual([
      'big has 60 lines; limit is 50. Nested functions count: move inner functions to module level, passing what they close over as one object.',
    ]);
  });

  it('tells the author how to split a function with too many statements', () => {
    expect(violations({ statements: 16 })).toEqual([
      'big has 16 statements; limit is 15. Split by responsibility and name each part for what it checks or does.',
    ]);
  });
});

describe('mutation testing that cannot start', () => {
  it('says the change does not type-check instead of repeating the Stryker initialization error', () => {
    const strykerMessage =
      'Error: An error occurred during initialization of the "typescript" checker. Inner error: Error: Typescript error(s) found in dry run compilation: test/billing.test.ts(60,57): error TS2365: Operator \'+\' cannot be applied to types \'Share\' and \'number\'.';

    expect(mutationSkipFor(strykerMessage)).toEqual({
      rule: 'typecheck-failed-skipped',
      message: 'mutation skipped: the change does not type-check (see typescript-typecheck findings)',
    });
  });

  it('says the tests fail when the initial test run fails', () => {
    const strykerMessage =
      'Error: There were failed tests in the initial test run. Fix the tests first.';

    expect(mutationSkipFor(strykerMessage)).toEqual({
      rule: 'tests-failed-skipped',
      message: 'mutation skipped: tests fail (see coverage findings)',
    });
  });

  it('leaves any other Stryker failure to be reported as it is', () => {
    expect(mutationSkipFor('Error: Stryker crashed')).toBeUndefined();
  });
});
