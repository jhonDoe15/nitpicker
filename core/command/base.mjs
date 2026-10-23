import { realpathSync } from 'node:fs';
import { loadConfig } from '../configuration/config.mjs';
import { resolveBase } from '../diff/git/repository/base-ref.mjs';
import { runGit } from '../diff/git/repository/command.mjs';
import { resolveProjectRoot } from '../tooling/tool-resolution.mjs';
import { takeOptionValue } from '../diff/comparison/cli.mjs';

function explicitBaseOf(arguments_) {
  let explicitBase;
  const remaining = arguments_.values();
  for (const argument of remaining) {
    if (argument !== '--base') {
      throw new Error(`Unknown argument: ${argument}. Usage: nitpicker base [--base <ref>]`);
    }
    explicitBase = takeOptionValue(remaining, argument);
  }
  return explicitBase;
}

export function runBaseCommand({ arguments_, currentProjectRoot, environment, stdout }) {
  const explicitBase = explicitBaseOf(arguments_);
  const projectRoot =
    currentProjectRoot === undefined ? resolveProjectRoot() : realpathSync(currentProjectRoot);
  const config = loadConfig(projectRoot);
  const repositoryRoot = realpathSync(runGit(projectRoot, ['rev-parse', '--show-toplevel']).trim());
  const { baseRef } = resolveBase({
    repositoryRoot,
    explicitBase,
    configuredBase: config.base,
    environment,
  });
  stdout.write(`${baseRef}\n`);
  return 0;
}
