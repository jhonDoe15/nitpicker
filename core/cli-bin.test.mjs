import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { USAGE_TEXT } from './command/arguments.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('nitpicker bin', () => {
  it('runs through its shebang when launched as a symlinked bin', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-cli-bin-'));
    temporaryRoots.push(root);
    const binPath = path.join(root, 'nitpicker');
    symlinkSync(path.join(import.meta.dirname, 'cli.mjs'), binPath);

    const stdout = execFileSync(binPath, ['--help'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: [path.dirname(process.execPath), process.env.PATH].join(path.delimiter),
      },
    });

    expect(stdout).toBe(USAGE_TEXT);
  });
});
