const COREPACK_HINT = 'npm install --global corepack && corepack enable';

const YARN_INSTALL_HINT = `Run \`${COREPACK_HINT} yarn\` or \`npm install --global yarn\`.`;

const MANAGERS = {
  npm: {
    binary: 'npm',
    args: ['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'],
    installHint: 'Install Node.js, which includes npm.',
  },
  pnpm: {
    binary: 'pnpm',
    args: [
      'install',
      '--frozen-lockfile',
      '--ignore-scripts',
      '--ignore-pnpmfile',
      '--prefer-offline',
    ],
    installHint: `Run \`${COREPACK_HINT} pnpm\` or \`npm install --global pnpm\`.`,
  },
  yarnClassic: {
    binary: 'yarn',
    args: [
      'install',
      '--frozen-lockfile',
      '--ignore-scripts',
      '--non-interactive',
      '--prefer-offline',
    ],
    ignoreYarnPath: true,
    installHint: YARN_INSTALL_HINT,
  },
  yarnBerry2: {
    binary: 'yarn',
    args: ['install', '--immutable', '--skip-builds'],
    ignoreYarnPath: true,
    installHint: YARN_INSTALL_HINT,
  },
  yarnBerry: {
    binary: 'yarn',
    args: ['install', '--immutable', '--mode=skip-build'],
    ignoreYarnPath: true,
    installHint: YARN_INSTALL_HINT,
  },
  bun: {
    binary: 'bun',
    args: ['install', '--frozen-lockfile', '--ignore-scripts'],
    installHint: 'Run `npm install --global bun` or see https://bun.sh/docs/installation.',
  },
};

function managerKey({ name, major }) {
  if (name !== 'yarn') {
    return name;
  }
  if (major === 1) {
    return 'yarnClassic';
  }
  return major === 2 ? 'yarnBerry2' : 'yarnBerry';
}

export function isBerry({ name, major }) {
  return name === 'yarn' && major > 1;
}

export function installInvocation(packageManager) {
  const {
    binary,
    args,
    ignoreYarnPath = false,
    installHint,
  } = MANAGERS[managerKey(packageManager)];
  const environment = [
    'COREPACK_ENABLE_AUTO_PIN=0',
    ...(ignoreYarnPath ? ['YARN_IGNORE_PATH=1'] : []),
  ];
  return { command: 'env', args: [...environment, binary, ...args], installHint };
}
