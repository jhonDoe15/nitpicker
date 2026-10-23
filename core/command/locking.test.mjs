import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../cli.mjs';
import { policy } from '../diff/execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../diff/reporting/test-support/output-capture.mjs';
import { fakeAnalyzer, useCliFixtures } from './test-support/cli-harness.mjs';
import { resolveRunLockPath } from './run-lock.mjs';
import { linkSentence } from '../../shared/messages/test-support/link-sentence.mjs';

const { createRepository, makeOutputRoot, makeTemporaryRoot, runCli } =
  useCliFixtures(nitpickerCli);

describe('nitpicker progress and run lock', () => {
  function setup() {
    const repository = createRepository({
      'quality-policy.json': policy(),
      'src/main/clean.ts': 'export const clean = true;\n',
    });
    const cacheDirectory = makeTemporaryRoot('nitpicker-cli-cache-');
    const run = (extra = {}) => {
      const output = captureOutput();
      const exitCode = runCli({
        arguments_: ['--base', repository.baseRef, '--output', makeOutputRoot()],
        environment: { NITPICKER_CACHE_DIR: cacheDirectory },
        currentProjectRoot: repository.root,
        analyzers: [fakeAnalyzer()],
        stdout: output.stdout,
        stderr: output.stderr,
        progress: output.stderr,
        ...extra,
      });
      return { exitCode, output };
    };
    return { repository, run, lockPath: resolveRunLockPath(repository.root) };
  }
  it('prints a start line per phase to stderr and leaves out quick successful analyzers', () => {
    const { run } = setup();

    const { exitCode, output } = run();

    expect(exitCode).toBe(0);
    expect(output.stderrText.split('\n').filter(Boolean)).toEqual([
      'nitpicker: base: running 1 analyzer',
      'nitpicker: head: running 1 analyzer',
    ]);
    expect(output.stdoutText).not.toContain('nitpicker: head');
  });
  it('says the base was cached instead of running it again', () => {
    const { run } = setup();
    run();

    const { output } = run();

    expect(output.stderrText.split('\n').filter(Boolean)).toEqual([
      'nitpicker: base 1 analyzer cached',
      'nitpicker: head: running 1 analyzer',
    ]);
  });
  it('labels the single snapshot of --all as head', () => {
    const { run } = setup();

    const { output } = run({ arguments_: ['--all', '--output', makeOutputRoot()] });

    expect(output.stderrText.split('\n').filter(Boolean)).toEqual([
      'nitpicker: head: running 1 analyzer',
    ]);
  });
  it('refuses to start while a live process holds the run lock', () => {
    const { run, lockPath } = setup();
    writeFileSync(lockPath, `${String(process.ppid)}\n`);

    const { exitCode, output } = run();

    expect(exitCode).toBe(2);
    expect(output.stderrText).toBe(
      `nitpicker: another run is in progress in this project (pid ${String(process.ppid)}); wait for it to finish. ${linkSentence('anotherRun')}\n`,
    );
    expect(output.stdoutText).toBe('');
    expect(readFileSync(lockPath, 'utf8')).toBe(`${String(process.ppid)}\n`);
  });
  it('takes over a lock whose process is gone and removes it after the run', () => {
    const { run, lockPath } = setup();
    writeFileSync(lockPath, '2147483646\n');

    const { exitCode } = run();

    expect(exitCode).toBe(0);
    expect(existsSync(lockPath)).toBe(false);
  });
  it('removes the lock after a run that fails', () => {
    const { run, lockPath } = setup();

    const { exitCode } = run({ arguments_: ['--analyzer', 'unknown'] });

    expect(exitCode).toBe(2);
    expect(existsSync(lockPath)).toBe(false);
  });
});
