import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { Layout } from '../../adapters/typed/head-policy.mts';
import {
  resolveLayout as untypedResolveLayout,
  resolveLayoutFor as untypedResolveLayoutFor,
} from '../layout.mjs';
import { layoutJscpdConfig as untypedLayoutJscpdConfig } from '../tool-configs.mjs';
import {
  fieldOf,
  listOf,
  numberOr,
  parseJson,
  textOf,
} from '../../../../shared/values/readers.mts';

const resolveLayout: () => Layout = untypedResolveLayout;
const resolveLayoutFor: (config: Readonly<Record<string, unknown>>) => Layout =
  untypedResolveLayoutFor;
const layoutJscpdConfig: (base: unknown, layout: Layout) => { readonly ignore: string[] } =
  untypedLayoutJscpdConfig;

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const jscpd = path.join(projectRoot, 'node_modules/.bin/jscpd');
const fixtureRoot = path.join(projectRoot, 'languages/typescript/preset/duplicates/fixtures');
const defaultConfig: unknown = parseJson(
  readFileSync(path.join(import.meta.dirname, '../defaults/jscpd.json'), 'utf8'),
);
const productionIgnore: string[] = layoutJscpdConfig(defaultConfig, resolveLayout()).ignore;
const shippedFormats: string[] = listOf(fieldOf(defaultConfig, 'format')).map(textOf);
const temporaryDirectories: string[] = [];

type FileName = { readonly name: string };

type JscpdReport = {
  readonly duplicates: { readonly firstFile: FileName; readonly secondFile: FileName }[];
  readonly statistics: { readonly total: { readonly clones: number } };
};

function fileName(value: unknown): FileName {
  return { name: textOf(fieldOf(value, 'name')) };
}

function readReport(reportPath: string): JscpdReport {
  const raw = parseJson(readFileSync(reportPath, 'utf8'));
  return {
    duplicates: listOf(fieldOf(raw, 'duplicates')).map((duplicate) => ({
      firstFile: fileName(fieldOf(duplicate, 'firstFile')),
      secondFile: fileName(fieldOf(duplicate, 'secondFile')),
    })),
    statistics: {
      total: {
        clones: numberOr(fieldOf(fieldOf(fieldOf(raw, 'statistics'), 'total'), 'clones'), 0),
      },
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function analyzeFixture(
  name: string,
  extraArguments: string[] = [],
  formats: string[] = ['typescript'],
) {
  const output = mkdtempSync(path.join(tmpdir(), 'nitpicker-jscpd-'));
  temporaryDirectories.push(output);
  const result = spawnSync(
    jscpd,
    [
      path.join(fixtureRoot, name),
      '--format',
      formats.join(','),
      '--reporters',
      'json',
      '--output',
      output,
      ...extraArguments,
    ],
    { cwd: projectRoot, encoding: 'utf8', timeout: 120_000 },
  );
  const reportPath = path.join(output, 'jscpd-report.json');
  const report = result.status === 0 ? readReport(reportPath) : undefined;
  return { result, report };
}

describe('duplicate-code report', () => {
  it('reports a copied production-sized token block', () => {
    const { result, report } = analyzeFixture('clones');

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(report?.duplicates.length).toBeGreaterThan(0);
    expect(report?.statistics.total.clones).toBeGreaterThan(0);
  });

  it('reports a component copied between two tsx files in the shipped formats', () => {
    const { result, report } = analyzeFixture('tsx-clones', [], shippedFormats);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(report?.duplicates.map(({ firstFile }) => path.basename(firstFile.name))).toEqual([
      'first.tsx',
    ]);
  });

  it('reports a helper copied between two test files', () => {
    const { result, report } = analyzeFixture('test-clones', [
      '--ignore',
      productionIgnore.join(','),
    ]);

    expect(result.status).toBe(0);
    expect(report?.duplicates.map(({ firstFile }) => path.basename(firstFile.name))).toEqual([
      'first.test.ts',
    ]);
  });

  it('does not invent a clone for distinct small modules', () => {
    const { result, report } = analyzeFixture('low-signal');

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(report?.duplicates).toEqual([]);
    expect(report?.statistics.total.clones).toBe(0);
  });

  it('excludes dist, build, and generated paths', () => {
    const { result, report } = analyzeFixture('excluded', ['--ignore', productionIgnore.join(',')]);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(report?.duplicates).toEqual([]);
  });

  it('analyses the folders the project takes off the skipped list', () => {
    const ignore = layoutJscpdConfig(
      defaultConfig,
      resolveLayoutFor({ duplicates: { skippedFolders: ['dist'] } }),
    ).ignore;
    const { result, report } = analyzeFixture('excluded', ['--ignore', ignore.join(',')]);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(
      report?.duplicates.map(({ firstFile, secondFile }) =>
        [firstFile, secondFile].map(({ name }) => path.basename(name)).sort(),
      ),
    ).toEqual([['fifth.ts', 'fourth.ts']]);
  });

  it.each(['first.ts', 'second.ts'])(
    'finds no clone when an exclude takes out %s of the pair',
    (excluded) => {
      const { result, report } = analyzeFixture('clones', ['--ignore', `**/${excluded}`]);

      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(report?.duplicates).toEqual([]);
    },
  );

  it('keeps analyzer configuration failures visible', () => {
    const result = spawnSync(
      jscpd,
      ['--config', 'languages/typescript/preset/duplicates/fixtures/missing.json'],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        timeout: 120_000,
      },
    );

    expect(result.status).not.toBe(0);
  });
});
