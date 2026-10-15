import path from 'node:path';

const runnerPath = path.join(new URL('../', import.meta.url).pathname, 'static-checks-runner.mjs');

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
    createInvocation({ projectRoot, policyRoot, toolRoot, liveProjectRoot }) {
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
        ...optionalArguments({ liveProjectRoot, ignoreRelativePath, includeOnly, exclude }),
        ...patterns.flatMap((pattern) => ['--pattern', pattern]),
      ];
      return {
        command: process.execPath,
        args,
        cwd: toolRoot,
      };
    },
  };
}

function optionalArguments(values) {
  const flags = {
    liveProjectRoot: '--live-project-root',
    ignoreRelativePath: '--ignore-path',
    includeOnly: '--include-only',
    exclude: '--exclude',
  };
  return Object.entries(flags).flatMap(([key, flag]) =>
    values[key] === undefined ? [] : [flag, values[key]],
  );
}
