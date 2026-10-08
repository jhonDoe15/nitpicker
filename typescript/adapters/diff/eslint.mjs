import path from 'node:path';

const runnerPath = path.join(import.meta.dirname, 'eslint-runner.mjs');

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
      ];
      if (liveProjectRoot !== undefined) {
        args.push('--live-project-root', liveProjectRoot);
      }
      if (eslintTimeoutMs !== undefined) {
        args.push('--timeout-ms', String(eslintTimeoutMs));
      }
      if (eslintCliPath !== undefined) {
        args.push('--eslint-cli', eslintCliPath);
      }
      for (const [environmentName, value] of Object.entries(environment)) {
        args.push('--environment', `${environmentName}=${value}`);
      }
      for (const pattern of patterns) {
        args.push('--pattern', pattern);
      }
      for (const policyFile of policyFiles) {
        args.push('--policy-file', policyFile);
      }
      return {
        command: process.execPath,
        args,
        cwd: toolRoot,
      };
    },
  };
}
