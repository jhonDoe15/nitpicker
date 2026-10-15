import { spawn } from 'node:child_process';

import { once } from 'node:events';

import { existsSync, mkdtempSync, rmSync, watch } from 'node:fs';

import { tmpdir } from 'node:os';

import path from 'node:path';

import { describe, expect, it } from 'vitest';

const schedulerPath = new URL('./analyzer-scheduler.mjs', import.meta.url).pathname;

function task(
  name,
  { dependencies = [], concurrencyWeight = 1, concurrencyGroup, executionPriority } = {},
) {
  return {
    name,
    dependencies,
    concurrencyWeight,
    concurrencyGroup,
    executionPriority,
    timeoutMs: 1_000,
    acceptedExitCodes: [0],
    invocation: {
      command: process.execPath,
      args: ['--version'],
      cwd: new URL('../', import.meta.url).pathname,
    },
  };
}

function waitForFile(filePath) {
  if (existsSync(filePath)) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const watcher = watch(path.dirname(filePath), () => {
      if (existsSync(filePath)) {
        watcher.close();
        resolve();
      }
    });
    if (existsSync(filePath)) {
      watcher.close();
      resolve();
    }
  });
}

describe('analyzer scheduler', () => {
  it.each(['SIGINT', 'SIGTERM'])(
    'does not start queued analyzers after %s',
    async (shutdownSignal) => {
      const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'analyzer-scheduler-cancellation-'));
      const activeMarker = path.join(fixtureRoot, 'active');
      const queuedMarker = path.join(fixtureRoot, 'queued');
      const scheduler = spawn(process.execPath, [schedulerPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const tasks = [
        {
          ...task('active'),
          timeoutMs: 10_000,
          invocation: {
            command: process.execPath,
            args: [
              '--input-type=module',
              '-e',
              `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(activeMarker)}, ''); setInterval(() => {}, 1_000);`,
            ],
            cwd: fixtureRoot,
          },
        },
        {
          ...task('queued'),
          timeoutMs: 10_000,
          invocation: {
            command: process.execPath,
            args: [
              '--input-type=module',
              '-e',
              `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(queuedMarker)}, ''); process.stdout.write('{"findings":[]}');`,
            ],
            cwd: fixtureRoot,
          },
        },
      ];

      try {
        scheduler.stdin.end(JSON.stringify({ tasks }));
        await waitForFile(activeMarker);
        scheduler.kill(shutdownSignal);
        const [status] = await once(scheduler, 'close');

        expect(status).toBe(2);
        expect(existsSync(queuedMarker)).toBe(false);
      } finally {
        if (scheduler.exitCode === null && scheduler.signalCode === null) {
          scheduler.kill('SIGKILL');
        }
        rmSync(fixtureRoot, { recursive: true, force: true });
      }
    },
  );
});
