import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runGradle } from './gradle-process.mjs';

const TREE = fileURLToPath(new URL('./test-support/build-tree.mjs', import.meta.url));
const OPTIONS = { cwd: process.cwd(), shell: false, timeout: 800, maxBuffer: 1024 * 1024 };

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    if (process.platform === 'linux') {
      return readFileSync(`/proc/${pid}/stat`, 'utf8').split(' ')[2] !== 'Z';
    }
    return true;
  } catch (error) {
    if (error.code === 'ESRCH' || error.code === 'ENOENT') return false;
    throw error;
  }
}

describe('Gradle process deadline', () => {
  it.each(['ignore', 'exit'])(
    'stops descendants when the launcher handles TERM with %s',
    (mode) => {
      const start = Date.now();
      const result = runGradle(process.execPath, [TREE, '0', mode], OPTIONS);
      const pids = result.stdout.trim().split('\n').map(Number);
      try {
        expect(result.error?.code).toBe('ETIMEDOUT');
        expect(pids).toHaveLength(3);
        expect(pids.every((pid) => !isRunning(pid))).toBe(true);
        expect(Date.now() - start).toBeLessThan(4000);
        expect(isRunning(process.pid)).toBe(true);
      } finally {
        for (const pid of pids) {
          if (isRunning(pid)) process.kill(pid, 'SIGKILL');
        }
      }
    },
  );

  it.each([0, 7])('keeps status %s and both output streams', (status) => {
    const result = runGradle(
      process.execPath,
      [
        '-e',
        `console.log("normal output"); console.error("build failed"); process.exitCode = ${status};`,
      ],
      OPTIONS,
    );
    expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toEqual({
      status,
      stdout: 'normal output\n',
      stderr: 'build failed\n',
    });
    expect(result.error).toBeUndefined();
  });

  it('reports spawn errors with the existing diagnostic', () => {
    const result = runGradle('/nitpicker-missing-gradle', [], OPTIONS);
    expect(result.error?.code).toBe('ENOENT');
    expect(result.error.message).toBe('spawnSync /nitpicker-missing-gradle ENOENT');
  });

  it('bounds output and stops a build that keeps writing', () => {
    const result = runGradle(
      process.execPath,
      ['-e', 'setInterval(() => console.log("x".repeat(1024)), 1);'],
      { ...OPTIONS, maxBuffer: 2048 },
    );
    expect(result.error?.code).toBe('ENOBUFS');
    expect(result.stdout.length).toBeLessThanOrEqual(2048);
  });
});
