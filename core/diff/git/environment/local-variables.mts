import { spawnSync } from 'node:child_process';
import { GIT_TIMEOUT_MS } from '../../../../shared/processes/deadlines.mjs';

const CONFIGURATION_VARIABLES = new Set(['GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT']);

function localVariableNames(environment: NodeJS.ProcessEnv): string[] {
  const result = spawnSync('git', ['rev-parse', '--local-env-vars'], {
    encoding: 'utf8',
    env: environment,
    timeout: GIT_TIMEOUT_MS,
  });
  if (result.error !== undefined || result.status !== 0) {
    return [];
  }
  return result.stdout.split(/\r?\n/).filter((name) => name.length > 0);
}

export function detachLocalGitVariables(environment: NodeJS.ProcessEnv): Record<string, string> {
  const detached: Record<string, string> = {};
  for (const name of localVariableNames(environment)) {
    const value = environment[name];
    if (!CONFIGURATION_VARIABLES.has(name) && value !== undefined) {
      detached[name] = value;
      Reflect.deleteProperty(environment, name);
    }
  }
  return detached;
}
