const MANAGERS = {
  npm: {
    binary: 'npm',
    args: ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'],
    installHint: 'Install Node.js, which includes npm.',
  },
  pnpm: {
    binary: 'pnpm',
    args: ['install', '--frozen-lockfile', '--ignore-scripts', '--prefer-offline'],
    installHint:
      'Run `corepack enable pnpm` (Corepack ships with Node.js) or `npm install --global pnpm`.',
  },
  yarn: {
    binary: 'yarn',
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
  yarnBerry: {
    binary: 'yarn',
    args: ['install', '--immutable', '--mode=skip-build'],
    environment: { YARN_ENABLE_SCRIPTS: 'false', YARN_NODE_LINKER: 'node-modules' },
    installHint: 'Run `corepack enable yarn` (Corepack ships with Node.js).',
  },
  bun: {
    binary: 'bun',
    args: ['install', '--frozen-lockfile', '--ignore-scripts'],
    installHint: 'Run `npm install --global bun` or see https://bun.sh/docs/installation.',
  },
};

export function installCommand(packageManager, platform = process.platform) {
  const key = packageManager.flavor === 'berry' ? 'yarnBerry' : packageManager.name;
  const { binary, args, environment = {}, installHint } = MANAGERS[key];
  return {
    command: platform === 'win32' && binary !== 'bun' ? `${binary}.cmd` : binary,
    args,
    environment: { COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', ...environment },
    installHint,
  };
}
