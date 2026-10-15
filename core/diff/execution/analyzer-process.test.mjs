import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { executeAnalyzerTask, reportFromAnalyzerOutput } from './process.mjs';
import { task, waitForFile } from './test-support/analyzer-task.mjs';
import { fileURLToPath } from 'node:url';

const schedulerPath = fileURLToPath(new URL('./analyzer-scheduler.mjs', import.meta.url));

describe('analyzer process execution', () => {
  it('accepts findings of declared wrapped tools and rejects any other tool', () => {
    const finding = {
      tool: 'inner',
      rule: 'r',
      path: 'a',
      identity: 'i',
      message: 'm',
      classification: 'enforceable',
    };
    const outputOf = (reportedTools) => [
      { ...task('wrapper'), reportedTools },
      {
        status: 0,
        signal: null,
        stdoutText: JSON.stringify({ findings: [finding] }),
        stderrText: '',
      },
    ];

    expect(reportFromAnalyzerOutput(...outputOf(['inner']))).toEqual({ findings: [finding] });
    expect(() => reportFromAnalyzerOutput(...outputOf([]))).toThrow(
      'wrapper emitted a finding for unexpected tool inner',
    );
  });
  it('hides the CI job summary path from analyzers and keeps the rest of the environment', async () => {
    const probe = {
      ...task('probe'),
      invocation: {
        command: process.execPath,
        args: [
          '-e',
          "process.stdout.write(JSON.stringify({findings:[{tool:'probe',rule:'r',path:'a',identity:'i',message:`${process.env.GITHUB_STEP_SUMMARY ?? 'unset'} ${process.env.KEPT}`,classification:'enforceable'}]}))",
        ],
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        env: { ...process.env, GITHUB_STEP_SUMMARY: '/tmp/summary.md', KEPT: 'kept' },
      },
    };

    await expect(executeAnalyzerTask(probe)).resolves.toEqual({
      findings: [
        {
          tool: 'probe',
          rule: 'r',
          path: 'a',
          identity: 'i',
          message: 'unset kept',
          classification: 'enforceable',
        },
      ],
    });
  });
  it('force-kills an analyzer that ignores timeout termination', async () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'analyzer-scheduler-force-kill-'));
    const readyMarker = path.join(fixtureRoot, 'ready');
    const analyzerTask = task('stuck');
    analyzerTask.timeoutMs = 500;
    analyzerTask.invocation.args = [
      '--input-type=module',
      '-e',
      `import { writeFileSync } from 'node:fs'; process.on('SIGTERM', () => {}); writeFileSync(${JSON.stringify(readyMarker)}, ''); setInterval(() => {}, 1_000);`,
    ];

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const outcome = executeAnalyzerTask(analyzerTask);
      await waitForFile(readyMarker);
      vi.advanceTimersByTime(500);
      vi.advanceTimersByTime(1_000);
      await expect(outcome).rejects.toThrow('stuck timed out after 500 ms');
    } finally {
      vi.useRealTimers();
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
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
