import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../../core/tooling/tool-resolution.mjs';
import { installStrykerTsconfig, parseArguments, runQualityArea } from './quality-areas-runner.mjs';

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

function optionsFor(kind, projectRoot) {
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
  ]);
}

function runKind(kind, projectRoot) {
  return runQualityArea(optionsFor(kind, projectRoot));
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
    const tsconfigPath = installStrykerTsconfig(
      optionsFor('mutation', projectRoot),
      'tsconfig.stryker.json',
      created,
    );
    return JSON.parse(readFileSync(tsconfigPath, 'utf8'));
  };

  it('adds the policy compiler options when the project type-checks with them', () => {
    const projectRoot = snapshotWith({
      'package.json': '{"name":"p","type":"module"}\n',
      'tsconfig.json': projectTsconfig,
      'src/first.ts': 'export const first = (rows: string[]): string | undefined => rows[0];\n',
    });

    expect(stryker(projectRoot).compilerOptions).toMatchObject({
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
      extends: './tsconfig.json',
      compilerOptions: { skipLibCheck: true },
    });
  });
});
