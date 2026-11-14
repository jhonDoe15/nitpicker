import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cruiseWithConfig, outputText } from '../test-support/strict-cruise.mts';
import { outsideRootsRule, type OutsideRootsOptions } from '../test-support/outside-roots-view.mts';
import { fieldOf, listOf, parseJson, textOf } from '../../../../../shared/values/readers.mts';
import { createQualityChecks } from '../../quality-checks.mjs';
import { NO_IMPORT_OUTSIDE_ROOTS } from './outside-roots.mjs';

const tsConfig = path.resolve(import.meta.dirname, '../fixtures/tsconfig.fixture.json');
const created: string[] = [];
const createQualityChecksTyped: () => {
  readonly staticChecks: readonly { readonly name: string; readonly exclude?: string }[];
} = createQualityChecks;

type Violation = readonly [string, string, string];

function violationsOf(output: string): Violation[] {
  return listOf(fieldOf(fieldOf(parseJson(output), 'summary'), 'violations')).map((violation) => [
    textOf(fieldOf(violation, 'from')),
    textOf(fieldOf(violation, 'to')),
    textOf(fieldOf(fieldOf(violation, 'rule'), 'name')),
  ]);
}

function dependencyArchitectureExclude(): string | undefined {
  return createQualityChecksTyped().staticChecks.find(
    ({ name }) => name === 'dependency-architecture',
  )?.exclude;
}

afterEach(() => {
  for (const directory of created.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function project(files: Readonly<Record<string, string>>): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'outside-roots-'));
  created.push(directory);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    writeFileSync(path.join(directory, name), content);
  }
  return directory;
}

async function cruise(files: Readonly<Record<string, string>>, options: OutsideRootsOptions = {}) {
  const baseDir = project(files);
  const rule = outsideRootsRule('^src/', ['src'], options);
  const result = await cruiseWithConfig(
    { forbidden: [rule], options: { tsConfig: { fileName: tsConfig } } },
    { baseDir, paths: ['src'], outputType: 'err-long' },
  );
  return result;
}

describe('outsideRootsRule', () => {
  it('fails production code importing a file outside the source roots', async () => {
    const result = await cruise({
      'src/a.ts': "import { b } from '../lib/b';\nexport const a = b;\n",
      'lib/b.ts': 'export const b = 1;\n',
    });

    expect(result.exitCode).not.toBe(0);
    expect(outputText(result)).toContain(NO_IMPORT_OUTSIDE_ROOTS);
  });

  it('accepts imports inside the source roots, packages and json files', async () => {
    const result = await cruise({
      'src/a.ts':
        "import { b } from './b';\nimport data from '../data.json';\nimport fs from 'node:fs';\nexport const a = [b, data, fs];\n",
      'src/b.ts': 'export const b = 1;\n',
      'data.json': '{}',
    });

    expect(result.exitCode, outputText(result)).toBe(0);
  });

  it('accepts an import of a folder the project excludes', async () => {
    const result = await cruise(
      {
        'src/a.ts': "import { b } from '../lib/b';\nexport const a = b;\n",
        'lib/b.ts': 'export const b = 1;\n',
      },
      { excludePattern: '^lib/' },
    );

    expect(result.exitCode, outputText(result)).toBe(0);
  });

  it('fails an import of build output or unmarked generated code, and accepts marked generated code', async () => {
    const exclude = dependencyArchitectureExclude();
    const rule = outsideRootsRule('^src/', ['src'], {
      generatedFilePattern: '^(?:generated/marked\\.ts)$',
    });
    const result = await cruiseWithConfig(
      {
        forbidden: [rule],
        options: { tsConfig: { fileName: tsConfig }, exclude: { path: exclude } },
      },
      {
        baseDir: project({
          'src/a.ts':
            "import { b } from '../dist/b';\nimport { c } from '../generated/c';\nimport { d } from '../generated/marked';\nexport const a = [b, c, d];\n",
          'dist/b.ts': 'export const b = 1;\n',
          'generated/c.ts': 'export const c = 1;\n',
          'generated/marked.ts': '// @generated\nexport const d = 1;\n',
        }),
        paths: ['src'],
        outputType: 'json',
      },
    );
    const violations = violationsOf(outputText(result));

    expect(violations).toEqual([
      ['src/a.ts', 'dist/b.ts', NO_IMPORT_OUTSIDE_ROOTS],
      ['src/a.ts', 'generated/c.ts', NO_IMPORT_OUTSIDE_ROOTS],
    ]);
  });

  it('does not apply to files outside production source', async () => {
    const baseDir = project({
      'src/a.ts': 'export const a = 1;\n',
      'tests/a.test.ts': "import { b } from '../lib/b';\nexport const a = b;\n",
      'lib/b.ts': 'export const b = 1;\n',
    });
    const result = await cruiseWithConfig(
      {
        forbidden: [outsideRootsRule('^src/', ['src'])],
        options: { tsConfig: { fileName: tsConfig } },
      },
      { baseDir, paths: ['tests'], outputType: 'err-long' },
    );

    expect(result.exitCode, outputText(result)).toBe(0);
  });
});

describe('the outside-roots message', () => {
  it('names moving the code under a source root first and the loosening route second', () => {
    expect(outsideRootsRule('^src/', ['src']).comment).toBe(
      'Production code imports only from layout.sourceRoots: move the imported code under a source root, or add its folder to layout.sourceRoots so the gate checks it. Excluding the imported file instead is a policy loosening that fails until a person accepts it.',
    );
  });
});
