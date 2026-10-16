import { existsSync } from 'node:fs';
import path from 'node:path';

export const OVERRIDE_HINT = 'or set "python.environment"';
const ENVIRONMENT_FAILED_RULE = 'environment-failed';

export function environmentError(message) {
  return Object.assign(new Error(message), { rule: ENVIRONMENT_FAILED_RULE });
}

export function venvLauncher(directory, description) {
  const bin = path.join(directory, process.platform === 'win32' ? 'Scripts' : 'bin');
  if (!existsSync(bin)) {
    throw environmentError(
      `No Python environment at ${directory} (${bin} does not exist): create it, ${OVERRIDE_HINT}`,
    );
  }
  const env = { VIRTUAL_ENV: directory, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` };
  return {
    description,
    launch: (tool, args) => {
      const installed = path.join(bin, tool);
      return { command: existsSync(installed) ? installed : tool, args, env };
    },
  };
}

function condaBinDirectories(prefix) {
  return process.platform === 'win32'
    ? [prefix, path.join(prefix, 'Scripts'), path.join(prefix, 'Library', 'bin')]
    : [path.join(prefix, 'bin')];
}

export function condaLauncher(prefix) {
  const directories = condaBinDirectories(prefix);
  if (!existsSync(prefix)) {
    throw environmentError(
      `No conda environment at ${prefix}: create it with \`conda env create -f environment.yml\`, ${OVERRIDE_HINT}`,
    );
  }
  const env = {
    CONDA_PREFIX: prefix,
    PATH: [...directories, process.env.PATH ?? ''].join(path.delimiter),
  };
  return {
    description: 'conda',
    launch: (tool, args) => {
      const installed = directories
        .map((directory) => path.join(directory, tool))
        .find((candidate) => existsSync(candidate));
      return { command: installed ?? tool, args, env };
    },
  };
}
