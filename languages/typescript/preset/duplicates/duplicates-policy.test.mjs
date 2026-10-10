import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const jscpd = path.join(projectRoot, 'node_modules/.bin/jscpd');
const fixtureRoot = path.join(projectRoot, 'languages/typescript/preset/duplicates/fixtures');
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function analyzeFixture(name, extraArguments = []) {
  const output = mkdtempSync(path.join(tmpdir(), 'nitpicker-jscpd-'));
  temporaryDirectories.push(output);
  const result = spawnSync(
    jscpd,
    [
      path.join(fixtureRoot, name),
      '--format',
      'typescript',
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

  it('does not invent a clone for distinct small modules', () => {
    const { result, report } = analyzeFixture('low-signal');

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(report.duplicates).toEqual([]);
    expect(report.statistics.total.clones).toBe(0);
  });

  it('excludes dist, build, and generated paths', () => {
    const { result, report } = analyzeFixture('excluded', [
      '--ignore',
      '**/dist/**,**/build/**,**/generated/**',
    ]);

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
