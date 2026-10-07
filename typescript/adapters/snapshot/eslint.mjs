import path from 'node:path';

const runnerPath = path.join(import.meta.dirname, 'eslint-snapshot-runner.mjs');

export function createEslintSnapshotAnalyzer({
  name,
  version,
  configurationHash,
  exclusions,
  configRelativePath,
  patterns,
  policyFiles = [],
  timeoutMs,
  shardWeight = 1,
}) {
  return {
    name,
    version,
    configurationHash,
    exclusions,
    shardWeight,
    createInvocation({ toolRoot }) {
      const args = [
        runnerPath,
        '--analyzer-name',
        name,
        '--project-root',
        toolRoot,
        '--config',
        configRelativePath,
      ];
      if (timeoutMs !== undefined) {
        args.push('--timeout-ms', String(timeoutMs));
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
