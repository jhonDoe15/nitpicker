import { describe, expect, it } from 'vitest';
import { installCommand } from './commands.mjs';

describe('frozen install commands', () => {
  it.each([
    [
      { name: 'npm' },
      {
        command: 'npm',
        args: ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'],
        installHint: 'Install Node.js, which includes npm.',
      },
    ],
    [
      { name: 'pnpm' },
      {
        command: 'pnpm',
        args: ['install', '--frozen-lockfile', '--ignore-scripts', '--prefer-offline'],
        installHint:
          'Run `corepack enable pnpm` (Corepack ships with Node.js) or `npm install --global pnpm`.',
      },
    ],
    [
      { name: 'yarn', flavor: 'classic' },
      {
        command: 'yarn',
        args: [
          'install',
          '--frozen-lockfile',
          '--ignore-scripts',
          '--non-interactive',
          '--prefer-offline',
        ],
        installHint:
          'Run `corepack enable yarn` (Corepack ships with Node.js) or `npm install --global yarn`.',
      },
    ],
    [
      { name: 'yarn', flavor: 'berry' },
      {
        command: 'yarn',
        args: ['install', '--immutable', '--mode=skip-build'],
        installHint: 'Run `corepack enable yarn` (Corepack ships with Node.js).',
      },
    ],
    [
      { name: 'bun' },
      {
        command: 'bun',
        args: ['install', '--frozen-lockfile', '--ignore-scripts'],
        installHint: 'Run `npm install --global bun` or see https://bun.sh/docs/installation.',
      },
    ],
  ])('builds the install for %j', (packageManager, expected) => {
    expect(installCommand(packageManager, 'linux')).toEqual(expected);
  });

  it('uses the .cmd shims on Windows except for bun', () => {
    expect([
      installCommand({ name: 'npm' }, 'win32').command,
      installCommand({ name: 'pnpm' }, 'win32').command,
      installCommand({ name: 'yarn', flavor: 'berry' }, 'win32').command,
      installCommand({ name: 'bun' }, 'win32').command,
    ]).toEqual(['npm.cmd', 'pnpm.cmd', 'yarn.cmd', 'bun']);
  });
});
