import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cruiseWithConfig } from '../fixtures/strict-cruise.mjs';
import { createQualityChecks } from '../../quality-checks.mjs';
import {
  NO_IMPORT_OUTSIDE_ROOTS,
  architectureMessage,
  outsideRootsRule,
} from './outside-roots.mjs';

const tsConfig = path.resolve(import.meta.dirname, '../fixtures/tsconfig.fixture.json');
const created = [];

afterEach(() => {
  for (const directory of created.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function project(files) {
  const directory = mkdtempSync(path.join(tmpdir(), 'outside-roots-'));
  created.push(directory);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    writeFileSync(path.join(directory, name), content);
  }
  return directory;
}

async function cruise(files, options = {}) {
  const baseDir = project(files);
  const rule = outsideRootsRule({
    productionSource: '^src/',
    roots: ['src'],
    ...options,
  });
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
    expect(result.output).toContain(NO_IMPORT_OUTSIDE_ROOTS);
  });

  it('accepts imports inside the source roots, packages and json files', async () => {
    const result = await cruise({
      'src/a.ts':
        "import { b } from './b';\nimport data from '../data.json';\nimport fs from 'node:fs';\nexport const a = [b, data, fs];\n",
      'src/b.ts': 'export const b = 1;\n',
      'data.json': '{}',
    });

    expect(result.exitCode, result.output).toBe(0);
  });

  it('accepts an import of a folder the project excludes', async () => {
    const result = await cruise(
      {
        'src/a.ts': "import { b } from '../lib/b';\nexport const a = b;\n",
        'lib/b.ts': 'export const b = 1;\n',
      },
      { excludePattern: '^lib/' },
    );

    expect(result.exitCode, result.output).toBe(0);
  });

  it('fails an import of build output the architecture check sees, and accepts generated code', async () => {
    const { exclude } = createQualityChecks().staticChecks.find(
      ({ name }) => name === 'dependency-architecture',
    );
    const result = await cruiseWithConfig(
      {
        forbidden: [outsideRootsRule({ productionSource: '^src/', roots: ['src'] })],
        options: { tsConfig: { fileName: tsConfig }, exclude: { path: exclude } },
      },
      {
        baseDir: project({
          'src/a.ts':
            "import { b } from '../dist/b';\nimport { c } from '../generated/c';\nexport const a = [b, c];\n",
          'dist/b.ts': 'export const b = 1;\n',
          'generated/c.ts': 'export const c = 1;\n',
        }),
        paths: ['src'],
        outputType: 'json',
      },
    );
    const violations = JSON.parse(result.output).summary.violations.map(({ from, to, rule }) => [
      from,
      to,
      rule.name,
    ]);

    expect(violations).toEqual([['src/a.ts', 'dist/b.ts', NO_IMPORT_OUTSIDE_ROOTS]]);
  });

  it('does not apply to files outside production source', async () => {
    const baseDir = project({
      'src/a.ts': 'export const a = 1;\n',
      'tests/a.test.ts': "import { b } from '../lib/b';\nexport const a = b;\n",
      'lib/b.ts': 'export const b = 1;\n',
    });
    const result = await cruiseWithConfig(
      {
        forbidden: [outsideRootsRule({ productionSource: '^src/', roots: ['src'] })],
        options: { tsConfig: { fileName: tsConfig } },
      },
      { baseDir, paths: ['tests'], outputType: 'err-long' },
    );

    expect(result.exitCode, result.output).toBe(0);
  });
});

describe('architectureMessage', () => {
  it('names the exception route for the outside-roots rule', () => {
    const message = architectureMessage(NO_IMPORT_OUTSIDE_ROOTS, {
      from: 'src/a.ts',
      to: 'lib/b.ts',
    });

    expect(message).toBe(
      'src/a.ts must not depend on lib/b.ts: production code imports only from layout.sourceRoots. ' +
        'Move it under a source root or add its folder to layout.sourceRoots; to leave it unchecked, list it in "exclude" in nitpicker.config.json.',
    );
  });

  it('keeps other rules short', () => {
    expect(architectureMessage('other', { from: 'a', to: 'b' })).toBe('a must not depend on b');
  });

  it('describes a cycle', () => {
    expect(architectureMessage('x', { cycle: ['a', 'b'] })).toBe('Dependency cycle: a -> b -> a');
  });
});
