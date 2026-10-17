import { existsSync } from 'node:fs';
import path from 'node:path';
import { environmentError, OVERRIDE_HINT } from './environment-error.mjs';

function condaBinDirectories(prefix) {
  return process.platform === 'win32'
    ? [prefix, path.join(prefix, 'Scripts'), path.join(prefix, 'Library', 'bin')]
    : [path.join(prefix, 'bin')];
}

export function condaLauncher(prefix, variables) {
  if (!existsSync(prefix)) {
    throw environmentError(
      `No conda environment at ${prefix}: create it with \`conda env create -f environment.yml\`, ${OVERRIDE_HINT}`,
    );
  }
  const env = {
    CONDA_PREFIX: prefix,
    PATH: [...condaBinDirectories(prefix), variables.PATH ?? ''].join(path.delimiter),
  };
  return {
    description: 'conda',
    launch: (tool, args) => ({ command: tool, args, env }),
  };
}
