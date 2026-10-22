import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openOutputFile, spawnSyncWithOutputFile } from './output-file.mjs';

const REPORT_BYTES = 3 * 1024 * 1024;
const GIT_ENVIRONMENT = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

describe('reading a child report through a file instead of a pipe', () => {
  const report = `${JSON.stringify({ findings: 'x'.repeat(REPORT_BYTES) })}\n`;
  let repository;
  let blob;

  function catBlob(options) {
    return spawnSyncWithOutputFile('git', ['cat-file', 'blob', blob], {
      cwd: repository,
      env: GIT_ENVIRONMENT,
      ...options,
    });
  }

  beforeAll(() => {
    repository = mkdtempSync(path.join(tmpdir(), 'nitpicker-output-file-test-'));
    execFileSync('git', ['init', '-q'], { cwd: repository, env: GIT_ENVIRONMENT });
    writeFileSync(path.join(repository, 'report.json'), report);
    blob = execFileSync('git', ['hash-object', '-w', 'report.json'], {
      cwd: repository,
      env: GIT_ENVIRONMENT,
      encoding: 'utf8',
    }).trim();
  });

  afterAll(() => {
    rmSync(repository, { recursive: true, force: true });
  });

  it('returns the whole stdout of a multi-megabyte report as spawnSync would', () => {
    const result = catBlob({ encoding: 'utf8' });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(report);
    expect(result.output[1]).toBe(report);
    expect(result.stderr).toBe('');
  });

  it('returns a Buffer without an encoding', () => {
    const result = catBlob({});

    expect(Buffer.isBuffer(result.stdout)).toBe(true);
    expect(result.stdout.length).toBe(Buffer.byteLength(report));
  });

  it('reports ENOBUFS and no output when the report is larger than maxBuffer', () => {
    const result = catBlob({ encoding: 'utf8', maxBuffer: 1024 });

    expect(result.error.code).toBe('ENOBUFS');
    expect(result.stdout).toBe('');
  });

  it('keeps the other streams, so input still reaches the child', () => {
    const result = spawnSyncWithOutputFile('git', ['hash-object', '--stdin'], {
      cwd: repository,
      env: GIT_ENVIRONMENT,
      input: report,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    expect(result.stdout.trim()).toBe(blob);
  });

  it('removes the temporary file once it is read', () => {
    const file = openOutputFile();
    writeFileSync(file.descriptor, 'written');

    expect(file.read('utf8')).toBe('written');
    expect(file.size()).toBe('written'.length);
    file.remove();
    expect(() => file.size()).toThrow(/ENOENT/u);
  });
});
