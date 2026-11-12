import { realpathSync } from 'node:fs';
import { loadConfig } from '../configuration/config.mjs';
import { resolveBase } from '../diff/git/repository/base-ref.mjs';
import { runGit } from '../diff/git/repository/command.mjs';
import { resolveProjectRoot } from '../configuration/project-checks/project-root.mjs';
import { takeOptionValue, unknownArgumentError } from '../diff/comparison/cli.mjs';

const BASE_USAGE = 'Usage: nitpicker base [--base <ref>]';

function explicitBaseOf(commandArguments) {
  let explicitBase;
  const remaining = commandArguments.values();
  for (const argument of remaining) {
    if (argument !== '--base') {
      throw unknownArgumentError(argument, ['--base'], BASE_USAGE);
    }
    explicitBase = takeOptionValue(remaining, argument);
  }
  return explicitBase;
}

export function runBaseCommand({
  arguments_: commandArguments,
  currentProjectRoot,
  environment,
  stdout,
}) {
  if (commandArguments.includes('--help')) {
    stdout.write(`${BASE_USAGE}\n\nPrints the base ref a comparison run would use.\n`);
    return 0;
  }
  const explicitBase = explicitBaseOf(commandArguments);
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
