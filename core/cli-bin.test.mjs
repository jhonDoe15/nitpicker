import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { USAGE_TEXT } from './command/arguments.mjs';

const temporaryRoots = [];
const binEntry = path.join(import.meta.dirname, 'bin.mjs');
const manifest = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '../package.json'), 'utf8'),
);

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fakedNodeVersion(version) {
  const script = `Object.defineProperty(process.versions, 'node', { value: ${JSON.stringify(version)} });`;
  return `--import=data:text/javascript,${encodeURIComponent(script)}`;
}

describe('nitpicker bin', () => {
  it('is the bin entry of the package', () => {
    expect(manifest.bin.nitpicker).toBe('core/bin.mjs');
  });

  it('runs through its shebang when launched as a symlinked bin', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-cli-bin-'));
    temporaryRoots.push(root);
    const binPath = path.join(root, 'nitpicker');
    symlinkSync(binEntry, binPath);

    const stdout = execFileSync(binPath, ['--help'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: [path.dirname(process.execPath), process.env.PATH].join(path.delimiter),
      },
    });

    expect(stdout).toBe(USAGE_TEXT);
  });

  it('names the required Node.js version and exits 2 on an older Node.js', () => {
    const result = spawnSync(process.execPath, [fakedNodeVersion('20.18.0'), binEntry, '--help'], {
      encoding: 'utf8',
      timeout: 30_000,
    });

    expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toEqual({
      status: 2,
      stdout: '',
      stderr:
        'nitpicker needs Node.js 22.14 or newer, and this is Node.js 20.18.0. Install a newer Node.js (for example with nvm install 22).\n',
    });
  });

  it('runs the CLI on the minimum Node.js version', () => {
    const result = spawnSync(process.execPath, [fakedNodeVersion('22.14.0'), binEntry, '--help'], {
      encoding: 'utf8',
      timeout: 30_000,
    });

    expect({ status: result.status, stdout: result.stdout }).toEqual({
      status: 0,
      stdout: USAGE_TEXT,
    });
  });
});
