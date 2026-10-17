import { describe, expect, it } from 'vitest';
import { installInvocation, isBerry } from './commands.mjs';

const YARN_HINT =
  'Run `npm install --global corepack && corepack enable yarn` or `npm install --global yarn`.';

describe('frozen install commands', () => {
  it.each([
    [
      { name: 'npm' },
      {
        command: 'env',
        args: [
          'COREPACK_ENABLE_AUTO_PIN=0',
          'npm',
          'ci',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          '--prefer-offline',
        ],
        installHint: 'Install Node.js, which includes npm.',
      },
    ],
    [
      { name: 'pnpm' },
      {
        command: 'env',
        args: [
          'COREPACK_ENABLE_AUTO_PIN=0',
          'pnpm',
          'install',
          '--frozen-lockfile',
          '--ignore-scripts',
          '--ignore-pnpmfile',
          '--prefer-offline',
        ],
        installHint:
          'Run `npm install --global corepack && corepack enable pnpm` or `npm install --global pnpm`.',
      },
    ],
    [
      { name: 'yarn', major: 1 },
      {
        command: 'env',
        args: [
          'COREPACK_ENABLE_AUTO_PIN=0',
          'YARN_IGNORE_PATH=1',
          'yarn',
          'install',
          '--frozen-lockfile',
          '--ignore-scripts',
          '--non-interactive',
          '--prefer-offline',
        ],
        installHint: YARN_HINT,
      },
    ],
    [
      { name: 'yarn', major: 2 },
      {
        command: 'env',
        args: [
          'COREPACK_ENABLE_AUTO_PIN=0',
          'YARN_IGNORE_PATH=1',
          'yarn',
          'install',
          '--immutable',
          '--skip-builds',
        ],
        installHint: YARN_HINT,
      },
    ],
    [
      { name: 'yarn', major: 4 },
      {
        command: 'env',
        args: [
          'COREPACK_ENABLE_AUTO_PIN=0',
          'YARN_IGNORE_PATH=1',
          'yarn',
          'install',
          '--immutable',
          '--mode=skip-build',
        ],
        installHint: YARN_HINT,
      },
    ],
    [
      { name: 'bun' },
      {
        command: 'env',
        args: [
          'COREPACK_ENABLE_AUTO_PIN=0',
          'bun',
          'install',
          '--frozen-lockfile',
          '--ignore-scripts',
        ],
        installHint: 'Run `npm install --global bun` or see https://bun.sh/docs/installation.',
      },
    ],
  ])('builds the install for %j', (packageManager, expected) => {
    expect(installInvocation(packageManager)).toEqual(expected);
  });

  it('tells Yarn 2 and later from the other managers', () => {
    expect([
      isBerry({ name: 'yarn', major: 1 }),
      isBerry({ name: 'yarn', major: 2 }),
      isBerry({ name: 'yarn', major: 4 }),
      isBerry({ name: 'pnpm' }),
    ]).toEqual([false, true, true, false]);
  });
});
