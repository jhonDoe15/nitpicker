import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('nitpicker bin', () => {
  it('runs when launched through a symlinked bin', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-cli-bin-'));
    temporaryRoots.push(root);
    const binPath = path.join(root, 'nitpicker');
    symlinkSync(path.join(import.meta.dirname, 'cli.mjs'), binPath);

    const stdout = execFileSync(process.execPath, [binPath, '--help'], { encoding: 'utf8' });

    expect(stdout.startsWith('Usage: nitpicker')).toBe(true);
  });
});
