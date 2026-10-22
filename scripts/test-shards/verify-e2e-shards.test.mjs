import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { main } from './verify-e2e-shards.mjs';

const root = path.resolve(import.meta.dirname, '../..');

function host(argv) {
  const written = { stdout: [], stderr: [] };
  return {
    written,
    argv,
    env: {},
    exitCode: undefined,
    stdout: { write: (text) => written.stdout.push(text) },
    stderr: { write: (text) => written.stderr.push(text) },
  };
}

describe('the shard verifier', () => {
  it('fails with exit code 1 and names the missing workflow of an unknown language', async () => {
    const run = host(['node', 'kotlin-gradle-only']);

    await main(run);

    expect(run.exitCode).toBe(1);
    expect(run.written.stdout).toEqual([]);
    expect(run.written.stderr.join('').split('\n')[0]).toBe(
      `Error: ENOENT: no such file or directory, open '${path.join(root, '.github/workflows/kotlin-gradle-only-e2e.yml')}'`,
    );
  });

  it('refuses a language name that leaves the workflows folder', async () => {
    const run = host(['node', '../../etc/passwd']);

    await main(run);

    expect(run.exitCode).toBe(1);
    expect(run.written.stderr.join('').split('\n')[0]).toBe(
      `Error: ../../etc/passwd-e2e.yml is outside ${path.join(root, '.github/workflows')}`,
    );
  });
});
