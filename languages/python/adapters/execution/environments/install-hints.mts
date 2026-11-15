import { spawnSync } from 'node:child_process';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { environmentError } from './environment-error.mts';
import type { InstallKind } from './typed/environment-types.mts';
import { PROBE_TIMEOUT_MS } from '../../../../../shared/processes/deadlines.mjs';

export const INSTALL_HINTS: Readonly<Record<InstallKind, string>> = {
  uv: 'install uv with `curl -LsSf https://astral.sh/uv/install.sh | sh` or `pip install uv`',
  poetry: 'install poetry with `pipx install poetry` or `pip install poetry`',
  pipenv: 'install pipenv with `pipx install pipenv` or `pip install pipenv`',
  pdm: 'install pdm with `pipx install pdm` or `pip install pdm`',
  hatch: 'install hatch with `pipx install hatch` or `pip install hatch`',
  conda: 'install conda from https://docs.conda.io/projects/conda/en/stable/user-guide/install/',
  python: 'install Python 3 from https://www.python.org/downloads/',
};

export function installHint(kind: string): string {
  return isInstallKind(kind) ? INSTALL_HINTS[kind] : '';
}

function isInstallKind(kind: string): kind is InstallKind {
  return Object.hasOwn(INSTALL_HINTS, kind);
}

export function isMissing(binary: string): boolean {
  return (
    fieldOf(
      spawnSync(binary, ['--version'], { stdio: 'ignore', timeout: PROBE_TIMEOUT_MS }).error,
      'code',
    ) === 'ENOENT'
  );
}

export function missingToolError(
  kind: InstallKind,
  purpose: string,
  anchor: string,
): Error & { rule: string } {
  return environmentError(`${kind} is not installed, ${purpose}: ${INSTALL_HINTS[kind]}`, anchor);
}
