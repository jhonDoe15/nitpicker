import path from 'node:path';
import { firstProjectFile } from '../../../../shared/conventions/read-inside.mjs';

const EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'];

export const PROJECT_CONFIG_NAMES = ['vitest', 'vite'].flatMap((name) =>
  EXTENSIONS.map((extension) => `${name}.config.${extension}`),
);

export function projectConfigFile(projectRoot) {
  const name = firstProjectFile(projectRoot, PROJECT_CONFIG_NAMES);
  return name === undefined ? undefined : path.join(projectRoot, name);
}
