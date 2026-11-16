import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Launcher } from '../../typed/environment/launcher-types.mts';
import { environmentError, OVERRIDE_HINT } from './environment-error.mts';

function condaBinDirectories(prefix: string): string[] {
  return process.platform === 'win32'
    ? [prefix, path.join(prefix, 'Scripts'), path.join(prefix, 'Library', 'bin')]
    : [path.join(prefix, 'bin')];
}

function installedTool(directories: readonly string[], tool: string): string | undefined {
  for (const directory of directories) {
    const candidate = path.resolve(directory, tool);
    if (!candidate.startsWith(`${directory}${path.sep}`)) {
      return undefined;
    }
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

export function condaLauncher(prefix: string): Launcher {
  if (!existsSync(prefix)) {
    throw environmentError(
      `No conda environment at ${prefix}: create it with \`conda env create -f environment.yml\`, ${OVERRIDE_HINT}`,
    );
  }
  const directories = condaBinDirectories(prefix);
  const env = { CONDA_PREFIX: prefix };
  return {
    description: 'conda',
    launch: (tool, args) => ({ command: installedTool(directories, tool) ?? tool, args, env }),
  };
}
