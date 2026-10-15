import path from 'node:path';

const runnerPath = path.join(new URL('../', import.meta.url).pathname, 'eslint-runner.mjs');

export function createEslintAnalyzer({
  name,
  version,
  configurationHash,
  exclusions,
  configRelativePath,
  patterns,
  policyFiles = [],
  timeoutMs,
  eslintTimeoutMs,
  eslintCliPath,
  environment = {},
  shardWeight = 1,
}) {
  return {
    name,
    version,
    configurationHash,
    exclusions,
    timeoutMs,
    shardWeight,
    concurrencyGroup: 'eslint-snapshot-dependencies',
    createInvocation({ projectRoot, policyRoot, toolRoot, liveProjectRoot }) {
      const args = [
        runnerPath,
        '--analyzer-name',
        name,
        '--project-root',
        projectRoot,
        '--policy-root',
        policyRoot,
        '--tool-root',
        toolRoot,
        '--config',
        configRelativePath,
        ...optionalArguments({ liveProjectRoot, eslintTimeoutMs, eslintCliPath }),
        ...environmentArguments(environment),
        ...patterns.flatMap((pattern) => ['--pattern', pattern]),
        ...policyFiles.flatMap((policyFile) => ['--policy-file', policyFile]),
      ];
      return {
        command: process.execPath,
        args,
        cwd: toolRoot,
      };
    },
  };
}

function optionalArguments({ liveProjectRoot, eslintTimeoutMs, eslintCliPath }) {
  const args = [];
  if (liveProjectRoot !== undefined) {
    args.push('--live-project-root', liveProjectRoot);
  }
  if (eslintTimeoutMs !== undefined) {
    args.push('--timeout-ms', String(eslintTimeoutMs));
  }
  if (eslintCliPath !== undefined) {
    args.push('--eslint-cli', eslintCliPath);
  }
  return args;
}

function environmentArguments(environment) {
  return Object.entries(environment).flatMap(([environmentName, value]) => [
    '--environment',
    `${environmentName}=${value}`,
  ]);
}
