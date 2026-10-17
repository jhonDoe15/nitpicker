import { spawnSync } from 'node:child_process';
import { environmentError } from './environment-error.mjs';

export const INSTALL_HINTS = {
  uv: 'install uv with `curl -LsSf https://astral.sh/uv/install.sh | sh` or `pip install uv`',
  poetry: 'install poetry with `pipx install poetry` or `pip install poetry`',
  pipenv: 'install pipenv with `pipx install pipenv` or `pip install pipenv`',
  pdm: 'install pdm with `pipx install pdm` or `pip install pdm`',
  hatch: 'install hatch with `pipx install hatch` or `pip install hatch`',
  conda: 'install conda from https://docs.conda.io/projects/conda/en/stable/user-guide/install/',
  python: 'install Python 3 from https://www.python.org/downloads/',
};

export function isMissing(binary) {
  return spawnSync(binary, ['--version'], { stdio: 'ignore' }).error?.code === 'ENOENT';
}

export function missingToolError(kind, purpose) {
  return environmentError(`${kind} is not installed, ${purpose}: ${INSTALL_HINTS[kind]}`);
}
