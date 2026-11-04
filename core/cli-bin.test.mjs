import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { USAGE_TEXT } from './command/arguments.mjs';

const temporaryRoots = [];
const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');
const SHIPPED = ['core', 'shared', 'languages', 'package.json', 'CHANGELOG.md'];
const NOT_SHIPPED = /[\\/](?:node_modules|fixtures)(?:[\\/]|$)/u;

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

  it('prints a changelog entry from a checkout without installed packages', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-no-packages-'));
    temporaryRoots.push(root);
    for (const entry of SHIPPED) {
      cpSync(path.join(PACKAGE_ROOT, entry), path.join(root, entry), {
        recursive: true,
        filter: (source) => !NOT_SHIPPED.test(source),
      });
    }
    const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

    const result = spawnSync(
      process.execPath,
      [path.join(root, 'core/cli.mjs'), 'changelog', version],
      {
        encoding: 'utf8',
        env: { ...process.env, NODE_PATH: '' },
        timeout: 60_000,
      },
    );

    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
  });
});
