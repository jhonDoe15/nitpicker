import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { FORCE_KILL_DELAY_MS, executeAnalyzerTask } from './process.mts';
import { type AnalyzerReport, reportFromAnalyzerOutput } from './report/analyzer-report.mts';
import { task, waitForFile } from './test-support/analyzer-task.mts';
import { fileURLToPath } from 'node:url';
import { fieldOf } from '../../../shared/values/readers.mts';

const schedulerPath = fileURLToPath(new URL('./analyzer-scheduler.mts', import.meta.url));

function wrapperReport(reportedTools: readonly string[], finding: object): AnalyzerReport {
  return reportFromAnalyzerOutput(
    { ...task('wrapper'), reportedTools },
    {
      status: 0,
      signal: null,
      stdoutText: JSON.stringify({ findings: [finding] }),
      stderrText: '',
    },
  );
}

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

    expect(wrapperReport(['inner'], finding)).toEqual({ findings: [finding] });
    expect(() => wrapperReport([], finding)).toThrow(
      'wrapper emitted a finding for unexpected tool inner',
    );
  });
  it.each([
    [true, '60000'],
    [false, 'unset'],
  ])('passes a configured deadline (%s) to the analyzer process', async (configured, seen) => {
    const probe = {
      ...task('probe'),
      timeoutMs: 60_000,
      configuredTimeout: configured,
      invocation: {
        command: process.execPath,
        args: [
          '-e',
          "process.stdout.write(JSON.stringify({findings:[{tool:'probe',rule:'r',path:'a',identity:'i',message:process.env.NITPICKER_ANALYZER_TIMEOUT_MS ?? 'unset',classification:'enforceable'}]}))",
        ],
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        env: { PATH: process.env['PATH'] },
      },
    };

    const report = await executeAnalyzerTask(probe);

    expect(report.findings.map((finding) => fieldOf(finding, 'message'))).toEqual([seen]);
  });
  it('hides the CI job summary path from analyzers and keeps the rest of the environment', async () => {
    const probe = {
      ...task('probe'),
      invocation: {
        command: process.execPath,
        args: [
          '-e',
          `process.stdout.write(JSON.stringify({findings:[{tool:'probe',rule:'r',path:'a',identity:'i',message:\`\${process.env.GITHUB_STEP_SUMMARY ?? 'unset'} \${process.env.KEPT}\`,classification:'enforceable'}]}))`,
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
  it('stops an analyzer that keeps writing to stdout past the output limit', async () => {
    const base = task('runaway');
    const runaway = {
      ...base,
      timeoutMs: 60_000,
      invocation: {
        ...base.invocation,
        args: [
          '-e',
          "const chunk = Buffer.alloc(1024 * 1024, 120); for (;;) require('node:fs').writeSync(1, chunk);",
        ],
      },
    };

    await expect(executeAnalyzerTask(runaway)).rejects.toThrow(
      'runaway exceeded the analyzer output limit',
    );
  });
  it('force-kills an analyzer that ignores timeout termination', async () => {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'analyzer-scheduler-force-kill-'));
    const readyMarker = path.join(fixtureRoot, 'ready');
    const stuck = task('stuck');
    const analyzerTask = {
      ...stuck,
      timeoutMs: 500,
      invocation: {
        ...stuck.invocation,
        args: [
          '--input-type=module',
          '-e',
          `import { writeFileSync } from 'node:fs'; process.on('SIGTERM', () => {}); writeFileSync(${JSON.stringify(readyMarker)}, ''); setInterval(() => {}, 1_000);`,
        ],
      },
    };

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const outcome = executeAnalyzerTask(analyzerTask);
      await waitForFile(readyMarker);
      vi.advanceTimersByTime(500);
      vi.advanceTimersByTime(FORCE_KILL_DELAY_MS);
      await expect(outcome).rejects.toThrow('stuck timed out after 500 ms');
    } finally {
      vi.useRealTimers();
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
  it.each(['SIGINT', 'SIGTERM'] as const)(
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
        const closed: unknown[] = await once(scheduler, 'close');
        const [status] = closed;

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
