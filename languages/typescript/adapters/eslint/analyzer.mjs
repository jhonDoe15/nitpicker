import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runnerPath = path.join(fileURLToPath(new URL('../', import.meta.url)), 'eslint-runner.mjs');

export function createEslintAnalyzer(options) {
  const {
    name,
    version,
    configurationHash,
    exclusions,
    timeoutMs,
    shardWeight = 1,
    policyFromPackage = false,
    colocatedWith,
  } = options;
  return {
    name,
    version,
    configurationHash,
    exclusions,
    timeoutMs,
    shardWeight,
    ...(colocatedWith === undefined ? {} : { colocatedWith }),
    requiresDependencies: true,
    ...(policyFromPackage ? {} : { concurrencyGroup: 'eslint-snapshot-dependencies' }),
    createInvocation: (roots) => ({
      command: process.execPath,
      args: runnerArguments(options, roots),
      cwd: roots.toolRoot,
    }),
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

function runnerArguments(options, { projectRoot, policyRoot, toolRoot, liveProjectRoot }) {
  const { name, configRelativePath, patterns, policyFiles = [], environment = {} } = options;
  const { eslintTimeoutMs, eslintCliPath } = options;
  return [
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
}
