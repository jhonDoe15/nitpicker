import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveLayout } from '../layout.mjs';
import { layoutJscpdConfig } from '../tool-configs.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const jscpd = path.join(projectRoot, 'node_modules/.bin/jscpd');
const fixtureRoot = path.join(projectRoot, 'languages/typescript/preset/duplicates/fixtures');
const productionIgnore = layoutJscpdConfig(
  JSON.parse(readFileSync(path.join(import.meta.dirname, '../defaults/jscpd.json'), 'utf8')),
  resolveLayout(),
).ignore;
const shippedFormats = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '../defaults/jscpd.json'), 'utf8'),
).format;
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function analyzeFixture(name, extraArguments = [], formats = ['typescript']) {
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
    { cwd: projectRoot, encoding: 'utf8' },
  );
  const reportPath = path.join(output, 'jscpd-report.json');
  const report = result.status === 0 ? JSON.parse(readFileSync(reportPath, 'utf8')) : undefined;
  return { result, report };
}

describe('duplicate-code report', () => {
  it('reports a copied production-sized token block', () => {
    const { result, report } = analyzeFixture('clones');

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(report.duplicates.length).toBeGreaterThan(0);
    expect(report.statistics.total.clones).toBeGreaterThan(0);
  });

  it('reports a component copied between two tsx files in the shipped formats', () => {
    const { result, report } = analyzeFixture('tsx-clones', [], shippedFormats);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(report.duplicates.map(({ firstFile }) => path.basename(firstFile.name))).toEqual([
      'first.tsx',
    ]);
  });

  it('reports a helper copied between two test files', () => {
    const { result, report } = analyzeFixture('test-clones', [
      '--ignore',
      productionIgnore.join(','),
    ]);

    expect(result.status).toBe(0);
    expect(report.duplicates.map(({ firstFile }) => path.basename(firstFile.name))).toEqual([
      'first.test.ts',
    ]);
  });

  it('does not invent a clone for distinct small modules', () => {
    const { result, report } = analyzeFixture('low-signal');

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(report.duplicates).toEqual([]);
    expect(report.statistics.total.clones).toBe(0);
  });

  it('excludes dist, build, and generated paths', () => {
    const { result, report } = analyzeFixture('excluded', ['--ignore', productionIgnore.join(',')]);

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(report.duplicates).toEqual([]);
  });

  it('keeps analyzer configuration failures visible', () => {
    const result = spawnSync(
      jscpd,
      ['--config', 'languages/typescript/preset/duplicates/fixtures/missing.json'],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      },
    );

    expect(result.status).not.toBe(0);
  });
});
