import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runnerPath = path.join(fileURLToPath(new URL('../', import.meta.url)), 'eslint-runner.mjs');

function invocationOf(settings, roots) {
  const { name, configRelativePath, patterns, policyFiles = [], environment = {} } = settings;
  const { projectRoot, policyRoot, toolRoot, liveProjectRoot } = roots;
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
    ...optionalArguments({ ...settings, liveProjectRoot }),
    ...environmentArguments(environment),
    ...patterns.flatMap((pattern) => ['--pattern', pattern]),
    ...policyFiles.flatMap((policyFile) => ['--policy-file', policyFile]),
  ];
  return { command: process.execPath, args, cwd: toolRoot };
}

export function createEslintAnalyzer(settings) {
  const { patterns, exclusions, shardWeight = 1, policyFromPackage = false } = settings;
  return {
    name: settings.name,
    version: settings.version,
    configurationHash: settings.configurationHash,
    exclusions,
    lintedGlobs: { include: patterns, exclude: exclusions },
    timeoutMs: settings.timeoutMs,
    shardWeight,
    requiresDependencies: true,
    ...(policyFromPackage ? {} : { concurrencyGroup: 'eslint-snapshot-dependencies' }),
    createInvocation(roots) {
      return invocationOf(settings, roots);
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
