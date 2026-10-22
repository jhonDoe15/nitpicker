import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeGradle, spawnFakeGradle } from '../test-support/in-process-gradle.mjs';
import { runGradle } from './gradle-process.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-fake-gradle-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function run(root, args, maxBuffer = 1024 * 1024) {
  return runGradle(fakeGradle, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer,
    shell: false,
    timeout: 1000,
    spawn: spawnFakeGradle,
  });
}

describe('the in-process answer of the fake Gradle', () => {
  it('answers like the supervisor does for a failing run', () => {
    const root = project({ GRADLE_FAIL: 'boom\n', GRADLE_STDOUT: 'building\n' });

    const result = run(root, ['-Pnitpicker.reportDir=reports']);

    expect(result).toEqual({
      status: 1,
      signal: undefined,
      stdout: 'building\n',
      stderr: 'boom\n\n',
      error: undefined,
    });
  });

  it('reports output past the buffer limit as ENOBUFS', () => {
    const root = project({ GRADLE_FAIL: 'x'.repeat(100) });

    const result = run(root, [], 10);

    expect(result.error).toEqual(
      Object.assign(new Error('Gradle output exceeded maxBuffer (ENOBUFS)'), { code: 'ENOBUFS' }),
    );
    expect([result.stdout, result.stderr]).toEqual(['', '']);
  });

  it('turns an exception of the fake into a failed Gradle run', () => {
    const root = project();

    const result = run(root, []);

    expect(result).toEqual({
      status: 1,
      signal: undefined,
      stdout: '',
      stderr: 'The "paths[1]" argument must be of type string. Received undefined\n',
      error: undefined,
    });
  });
});
