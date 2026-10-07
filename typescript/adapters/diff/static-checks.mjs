import path from 'node:path';

const runnerPath = path.join(import.meta.dirname, 'static-checks-runner.mjs');

export function createStaticCheckAnalyzer({
  name,
  kind,
  version,
  configurationHash,
  exclusions,
  configRelativePath,
  ignoreRelativePath,
  patterns = [],
  includeOnly,
  exclude,
  timeoutMs,
  shardWeight = 1,
}) {
  return {
    name,
    version,
    configurationHash,
    exclusions,
    timeoutMs,
    shardWeight,
    createInvocation({ projectRoot, policyRoot, toolRoot }) {
      const args = [
        runnerPath,
        '--analyzer-name',
        name,
        '--kind',
        kind,
        '--project-root',
        projectRoot,
        '--policy-root',
        policyRoot,
        '--tool-root',
        toolRoot,
        '--config',
        configRelativePath,
      ];
      if (ignoreRelativePath !== undefined) {
        args.push('--ignore-path', ignoreRelativePath);
      }
      if (includeOnly !== undefined) {
        args.push('--include-only', includeOnly);
      }
      if (exclude !== undefined) {
        args.push('--exclude', exclude);
      }
      for (const pattern of patterns) {
        args.push('--pattern', pattern);
      }
      return {
        command: process.execPath,
        args,
        cwd: toolRoot,
      };
    },
  };
}
