import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PACKAGE_ROOT } from '../../../core/tooling/tool-resolution.mjs';
import { installStrykerTsconfig, mutationSkipFor } from './quality-areas/runners/mutation.mjs';
import { normalizeStructure } from './quality-areas/reporting/repository.mjs';
import { normalizeCrap } from './quality-areas/reporting/tests.mjs';
import { parseArguments } from './quality-areas/arguments.mjs';
import { runQualityArea } from './quality-areas-runner.mjs';

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

function optionsFor(kind, projectRoot, extra = []) {
  return parseArguments([
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
    ...extra,
  ]);
}

function runKind(kind, projectRoot, extra) {
  return runQualityArea(optionsFor(kind, projectRoot, extra));
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
      {
        tool: 'crap',
        rule: 'tests-failed-skipped',
        path: '.',
        identity: 'tests-failed-skipped',
        message: 'CRAP did not run: there is no coverage report, because the project tests fail.',
        classification: 'tool-error',
      },
    ]);
  });
});

describe('test-console runner without a console report', () => {
  it('says the coverage run left no report instead of blaming the tests', async () => {
    const projectRoot = snapshotWith({
      'package.json': '{"name":"p","type":"module"}\n',
      'src/main/a.ts': 'export function a(): number {\n  return 1;\n}\n',
      'test/a.test.ts': "import { it } from 'vitest';\nit('x', () => {});\n",
    });

    const findings = await runKind('test-console', projectRoot);

    expect(findings).toEqual([
      {
        tool: 'test-console',
        rule: 'test-console-report-missing',
        path: '.',
        identity: 'test-console-report-missing',
        message:
          'Test console output was not checked: the coverage run left no reports/quality/test-console/report.json.',
        classification: 'tool-error',
      },
    ]);
  });
});

describe('coverage runner invoked as a script', () => {
  const originalArguments = process.argv;
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.argv = originalArguments;
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it('lists the failing tests instead of crashing on module initialization', async () => {
    const projectRoot = snapshotWith({
      'package.json': '{"name":"p","type":"module"}\n',
      'src/main/a.ts': 'export function a(): number {\n  return 1;\n}\n',
      'test/a.test.ts':
        "import { expect, it } from 'vitest';\nimport { a } from '../src/main/a';\nit('returns two', () => {\n  expect(a()).toBe(2);\n});\n",
    });
    symlinkSync(
      path.join(PACKAGE_ROOT, 'node_modules'),
      path.join(projectRoot, 'node_modules'),
      'dir',
    );
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    process.argv = [
      originalArguments[0],
      path.join(import.meta.dirname, 'quality-areas-runner.mjs'),
      '--analyzer-name',
      'coverage',
      '--kind',
      'coverage',
      '--project-root',
      projectRoot,
      '--policy-root',
      PACKAGE_ROOT,
      '--tool-root',
      PACKAGE_ROOT,
      '--snapshot',
      'head',
    ];
    vi.resetModules();

    await import('./quality-areas-runner.mjs');

    expect(stderr).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(originalExitCode);
    const { findings } = JSON.parse(stdout.mock.calls[0][0]);
    expect(findings.map(({ rule, classification }) => ({ rule, classification }))).toEqual([
      { rule: 'tests-failed', classification: 'tool-error' },
    ]);
    expect(findings[0].message).toMatch(/returns two/u);
  });
});

describe('structure runner with a base checkout', () => {
  const copy = (tail) =>
    [
      'export function total(items: number[], tax: number): number {',
      '  const sum = items.reduce((a, b) => a + b, 0);',
      '  const taxed = sum * (1 + tax);',
      '  const rounded = Math.round(taxed * 100) / 100;',
      `  ${tail}`,
      '}',
      '',
    ].join('\n');
  const files = (cart) => ({
    'package.json': '{"name":"p","type":"module"}\n',
    'src/cart/total.ts': copy(cart),
    'src/checkout/total.ts': copy('return rounded;'),
  });

  it('reports the edit of one of two near-identical copies against the base side', async () => {
    const baseRoot = snapshotWith(files('return rounded;'));
    const headRoot = snapshotWith(files('return Math.max(rounded, 0);'));

    const findings = await runKind('structure', headRoot, ['--baseline-root', baseRoot]);

    expect(
      findings
        .filter(({ rule }) => rule === 'sibling-copy-edit')
        .map(({ path: file, identity }) => [file, identity]),
    ).toEqual([['src/cart/total.ts', 'sibling-copy:total']]);
  });

  it('reports nothing without a base checkout', async () => {
    const headRoot = snapshotWith(files('return Math.max(rounded, 0);'));

    const findings = await runKind('structure', headRoot);

    expect(findings.filter(({ rule }) => rule === 'sibling-copy-edit')).toEqual([]);
  });
});

describe('coverage run in a project that configures its own reporters', () => {
  it('writes the test report where nitpicker reads it', async () => {
    const projectRoot = snapshotWith({
      'package.json': '{"name":"p","type":"module"}\n',
      'vitest.config.ts':
        "export default { test: { reporters: [['json', { outputFile: 'mine.json' }]], outputFile: { json: 'mine.json' } } };\n",
      'src/main/a.ts': 'export function a(): number {\n  return 1;\n}\n',
      'test/a.test.ts':
        "import { expect, it } from 'vitest';\nimport { a } from '../src/main/a';\nit('returns one', () => {\n  expect(a()).toBe(1);\n});\n",
    });
    symlinkSync(
      path.join(PACKAGE_ROOT, 'node_modules'),
      path.join(projectRoot, 'node_modules'),
      'dir',
    );

    const findings = await runKind('coverage', projectRoot);

    expect(findings.filter(({ classification }) => classification === 'tool-error')).toEqual([]);
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
      'big has 60 lines; limit is 50. Nested functions count: move inner functions to module level, passing what they close over as one object. If this is intended, add {"rule":"function-lines-limit","paths":["src/a.ts"],"function":"big","reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });

  it('tells the author how to split a function with too many statements', () => {
    expect(violations({ statements: 16 })).toEqual([
      'big has 16 statements; limit is 15. Split by responsibility and name each part for what it checks or does. If this is intended, add {"rule":"function-statements-limit","paths":["src/a.ts"],"function":"big","reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
  });
});

describe('numbering of functions that share a name', () => {
  const site = (start, sourceHash) => ({
    source: 'src/a.ts',
    function: 'handler',
    start,
    end: start + 1,
    lines: { start, end: start + 1 },
    sourceHash,
    complexity: 1,
    crap: 30,
  });
  const identities = (starts) =>
    normalizeCrap({ functions: starts.map(([start, hash]) => site(start, hash)) }, 'crap')
      .filter(({ classification }) => classification === 'enforceable')
      .map(({ identity }) => identity);
  const structureIdentities = (starts) =>
    normalizeStructure(
      {
        functions: starts.map(([start, hash]) => ({
          source: 'src/a.ts',
          function: 'handler',
          start,
          end: start + 1,
          sourceHash: hash,
          parameters: 9,
        })),
      },
      'structure',
    )
      .filter(({ classification }) => classification === 'enforceable')
      .map(({ identity }) => identity);

  it('keeps the identity of a CRAP finding when a function of the same name is added above it', () => {
    expect(identities([[20, 'b']])).toEqual(['function:handler:occurrence:1:source:b']);
    expect(
      identities([
        [5, 'a'],
        [20, 'b'],
      ]),
    ).toEqual(['function:handler:occurrence:1:source:a', 'function:handler:occurrence:1:source:b']);
  });

  it('keeps the identity of a structure finding when a function of the same name is added above it', () => {
    expect(structureIdentities([[20, 'b']])).toEqual(['function:handler:occurrence:1:source:b']);
    expect(
      structureIdentities([
        [5, 'a'],
        [20, 'b'],
      ]),
    ).toEqual(['function:handler:occurrence:1:source:a', 'function:handler:occurrence:1:source:b']);
  });
});

describe('mutation testing that cannot start', () => {
  it('says the change does not type-check instead of repeating the Stryker initialization error', () => {
    const strykerMessage =
      "Error: An error occurred during initialization of the \"typescript\" checker. Inner error: Error: Typescript error(s) found in dry run compilation: test/billing.test.ts(60,57): error TS2365: Operator '+' cannot be applied to types 'Share' and 'number'.";

    expect(mutationSkipFor(strykerMessage)).toEqual({
      rule: 'typecheck-failed-skipped',
      message:
        'mutation skipped: the project does not type-check under the mutation checker configuration (see differential typescript-typecheck findings)',
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

  it('names the base commit when the base snapshot cannot start mutation', () => {
    const strykerMessage =
      "Error: Typescript error(s) found in dry run compilation: error TS2688: Cannot find type definition file for 'node'.";

    expect(mutationSkipFor(strykerMessage, 'base')).toEqual({
      rule: 'typecheck-failed-skipped',
      message:
        'mutation skipped: the base commit does not type-check, so its mutants cannot be compared. Fix the base first; a missing @types/node is the usual cause.',
    });
  });

  it('leaves any other Stryker failure to be reported as it is', () => {
    expect(mutationSkipFor('Error: Stryker crashed')).toBeUndefined();
  });
});

function strictFlags({
  skipLibCheck,
  strict,
  noImplicitReturns,
  noFallthroughCasesInSwitch,
  noUncheckedIndexedAccess,
}) {
  return {
    skipLibCheck,
    strict,
    noImplicitReturns,
    noFallthroughCasesInSwitch,
    noUncheckedIndexedAccess,
  };
}

describe('mutation type-check config', () => {
  const projectTsconfig = `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      lib: ['ES2022'],
      types: [],
    },
    include: ['src'],
  })}\n`;
  const stryker = (projectRoot) => {
    const created = [];
    const { tsconfigPath, baselineErrors } = installStrykerTsconfig(
      optionsFor('mutation', projectRoot),
      'tsconfig.stryker.json',
      created,
    );
    return { config: JSON.parse(readFileSync(tsconfigPath, 'utf8')), baselineErrors };
  };

  it('adds the policy compiler options when the project type-checks with them', () => {
    const projectRoot = snapshotWith({
      'package.json': '{"name":"p","type":"module"}\n',
      'tsconfig.json': projectTsconfig,
      'src/first.ts': 'export const first = (rows: string[]): string | undefined => rows[0];\n',
    });

    const prepared = stryker(projectRoot);
    expect(prepared.baselineErrors).toBe(false);
    expect(strictFlags(prepared.config.compilerOptions)).toEqual({
      skipLibCheck: true,
      strict: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      noUncheckedIndexedAccess: true,
    });
  });

  it('keeps the project options when the project does not type-check with them yet', () => {
    const projectRoot = snapshotWith({
      'package.json': '{"name":"p","type":"module"}\n',
      'tsconfig.json': projectTsconfig,
      'src/first.ts': 'export const first = (rows: string[]): string => rows[0].toUpperCase();\n',
    });

    expect(stryker(projectRoot)).toEqual({
      config: { extends: './tsconfig.json', compilerOptions: { skipLibCheck: true } },
      baselineErrors: false,
    });
  });

  it('selects baseline-aware checking when errors remain with the project compiler options', () => {
    const projectRoot = snapshotWith({
      'package.json': '{"name":"p","type":"module"}\n',
      'tsconfig.json': projectTsconfig,
      'src/first.ts': "export const legacy: number = 'oops';\n",
    });
    expect(stryker(projectRoot)).toEqual({
      config: { extends: './tsconfig.json', compilerOptions: { skipLibCheck: true } },
      baselineErrors: true,
    });
  });
});
