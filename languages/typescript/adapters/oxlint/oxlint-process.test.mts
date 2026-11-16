import { describe, expect, it } from 'vitest';
import { spawnCollected, withEngineHint } from './oxlint-process.mts';
import { textOf } from '../../../../shared/values/readers.mts';
import { linkSentence } from '../../../../shared/messages/test-support/link-sentence.mjs';

describe('the engine hint on an oxlint failure', () => {
  it('suggests the ESLint engine when the failure may be the engine', () => {
    expect(withEngineHint('oxlint crashed')).toBe(
      'oxlint crashed\nSet "tools": { "eslint": { "engine": "eslint" } } in nitpicker.config.json to lint with ESLint instead.\n' +
        textOf(linkSentence('engineUnavailable')),
    );
  });

  it('leaves a failure that names the config file alone, since switching engines cannot fix it', () => {
    const detail =
      'oxlint planning failed: nitpicker.config.json "exceptions" name unknown rules: formatjs/enforce-id';

    expect(withEngineHint(detail)).toBe(detail);
  });
});

describe('a collected subprocess', () => {
  const run = (script: string, limits: { readonly timeoutMs?: number } = {}) =>
    spawnCollected(process.execPath, ['-e', script], {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 1024,
      timeoutMs: 10_000,
      ...limits,
    });

  it('returns the exit status and both output streams', async () => {
    expect(
      await run('process.stdout.write("out"); process.stderr.write("err"); process.exitCode = 1;'),
    ).toEqual({ status: 1, signal: undefined, error: undefined, stdout: 'out', stderr: 'err' });
  });

  it.skipIf(process.platform === 'win32')('reports the signal that ended a process', async () => {
    const result = await run("process.kill(process.pid, 'SIGKILL')");

    expect([result.status, result.signal]).toEqual([null, 'SIGKILL']);
  });

  it('stops a process that runs past its deadline and reports ETIMEDOUT', async () => {
    const result = await run('setTimeout(() => {}, 60_000);', { timeoutMs: 200 });

    expect(result.error?.code).toBe('ETIMEDOUT');
  });

  it('stops a process that writes more than the output limit and reports ENOBUFS', async () => {
    const result = await run('process.stdout.write("x".repeat(4096));');

    expect(result.error?.code).toBe('ENOBUFS');
  });
});
