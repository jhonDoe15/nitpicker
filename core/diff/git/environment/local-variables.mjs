import { spawnSync } from 'node:child_process';

const CONFIGURATION_VARIABLES = new Set(['GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT']);

function localVariableNames(environment) {
  const result = spawnSync('git', ['rev-parse', '--local-env-vars'], {
    encoding: 'utf8',
    env: environment,
  });
  if (result.error !== undefined || result.status !== 0) {
    return [];
  }
  return result.stdout.split(/\r?\n/).filter((name) => name.length > 0);
}

export function detachLocalGitVariables(environment) {
  const detached = {};
  for (const name of localVariableNames(environment)) {
    if (!CONFIGURATION_VARIABLES.has(name) && environment[name] !== undefined) {
      detached[name] = environment[name];
      Reflect.deleteProperty(environment, name);
    }
  }
  return detached;
}
