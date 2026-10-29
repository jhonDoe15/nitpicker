import { spawnSync } from 'node:child_process';
import { fixTypeScript } from '../../languages/typescript/fix/typescript-fix.mjs';
import { languageFixers } from './language-fixers.mjs';

const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

function spawnEnvironment(baseEnvironment, overrides = {}) {
  if (baseEnvironment === undefined && Object.keys(overrides).length === 0) {
    return undefined;
  }
  return { ...baseEnvironment, ...overrides };
}

export function spawnInvocation(
  { command, args, cwd, input, environment, shell = false, timeout },
  baseEnvironment,
  spawn = spawnSync,
) {
  return spawn(command, args, {
    cwd,
    input,
    shell,
    timeout,
    env: spawnEnvironment(baseEnvironment, environment),
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
  });
}

export function fixWorkingTree(options) {
  const settings = {
    ...options,
    executeFixCommand: (invocation) =>
      options.executeFixCommand?.(invocation) ?? spawnInvocation(invocation, options.environment),
  };
  const fixer = languageFixers[settings.config?.preset];
  return fixer === undefined ? fixTypeScript(settings) : fixer(settings);
}
