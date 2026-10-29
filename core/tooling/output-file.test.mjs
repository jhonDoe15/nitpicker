import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openOutputFile, spawnSyncWithOutputFile } from './output-file.mjs';
import { removeTrackedTemporaryPaths } from './temporary-files.mjs';

const REPORT_BYTES = 3 * 1024 * 1024;
const GIT_TIMEOUT_MS = 30_000;
const LARGE_BUFFER = 16 * 1024 * 1024;
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
    execFileSync('git', ['init', '-q'], {
      cwd: repository,
      env: GIT_ENVIRONMENT,
      timeout: GIT_TIMEOUT_MS,
    });
    writeFileSync(path.join(repository, 'report.json'), report);
    blob = execFileSync('git', ['hash-object', '-w', 'report.json'], {
      cwd: repository,
      env: GIT_ENVIRONMENT,
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
    }).trim();
  });

  afterAll(() => {
    rmSync(repository, { recursive: true, force: true });
  });

  it('returns the whole stdout of a multi-megabyte report as spawnSync would', () => {
    const result = catBlob({ encoding: 'utf8', maxBuffer: LARGE_BUFFER });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(report);
    expect(result.stderr).toBe('');
    expect(result.output).toEqual([null, report, '']);
  });

  it('returns a Buffer without an encoding', () => {
    const result = catBlob({ maxBuffer: LARGE_BUFFER });

    expect(Buffer.isBuffer(result.stdout)).toBe(true);
    expect(result.stdout.length).toBe(Buffer.byteLength(report));
  });

  it('reports ENOBUFS with the stdout cut at maxBuffer, as spawnSync does', () => {
    const result = catBlob({ encoding: 'utf8', maxBuffer: 1024 });

    expect(result.error).toMatchObject({
      code: 'ENOBUFS',
      syscall: 'spawnSync git',
      path: 'git',
    });
    expect(result.error.errno).toBeLessThan(0);
    expect(result.stdout).toBe(report.slice(0, 1024));
  });

  it('applies the 1 MiB maxBuffer of spawnSync when none is given', () => {
    const result = catBlob({ encoding: 'utf8' });

    expect(result.error.code).toBe('ENOBUFS');
    expect(result.stdout.length).toBe(1024 * 1024);
  });

  it('returns the spawnSync result unchanged when the command cannot start', () => {
    const missing = 'nitpicker-missing-command';
    const native = spawnSync(missing, [], { encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
    const result = spawnSyncWithOutputFile(missing, [], {
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
    });

    expect(result.error.code).toBe('ENOENT');
    expect([result.stdout, result.output]).toEqual([native.stdout, native.output]);
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

  it('removes the temporary directory once it is read', () => {
    const file = openOutputFile();
    writeFileSync(file.descriptor, 'written');

    expect(file.read('utf8')).toBe('written');
    expect(file.size()).toBe('written'.length);
    file.remove();
    expect(existsSync(file.directory)).toBe(false);
  });

  it('leaves no directory behind when the process ends before the file is removed', () => {
    const file = openOutputFile();

    removeTrackedTemporaryPaths();

    expect(existsSync(file.directory)).toBe(false);
    file.remove();
  });
});
