import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const runner = path.join(import.meta.dirname, 'run.mjs');

function run(...args) {
  const result = spawnSync('node', [runner, 'run', '--agent', 'true', '--tier', 't', ...args], {
    encoding: 'utf8',
  });
  return { status: result.status, stderr: result.stderr, stdout: result.stdout };
}

describe('run.mjs arguments', () => {
  it('fails on an unknown --case and names the known cases', () => {
    const result = run('--case', 'nope');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unknown --case nope; known cases: ');
    expect(result.stderr).toContain('add-shout-feature');
    expect(result.stdout).toBe('');
  });

  it('fails on an unknown --case even when known ones are listed beside it', () => {
    const result = run('--case', 'trivial', '--case', 'nope');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unknown --case nope');
  });

  it.each(['0', '+1', '1.5', 'abc', ''])('rejects --run %j without selecting a case', (value) => {
    const result = run('--run', value);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--run and --runs take whole numbers of 1 or more');
  });

  it('rejects --runs 0', () => {
    expect(run('--runs', '0').status).toBe(1);
  });
});
