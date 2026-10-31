import { realpathSync } from 'node:fs';
import { loadConfig } from '../configuration/config.mjs';
import { resolveBase } from '../diff/git/repository/base-ref.mjs';
import { runGit } from '../diff/git/repository/command.mjs';
import { resolveProjectRoot } from '../tooling/tool-resolution.mjs';
import { takeOptionValue, unknownArgumentError } from '../diff/comparison/cli.mjs';

function explicitBaseOf(commandArguments) {
  let explicitBase;
  const remaining = commandArguments.values();
  for (const argument of remaining) {
    if (argument !== '--base') {
      throw unknownArgumentError(argument, ['--base'], 'Usage: nitpicker base [--base <ref>]');
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
