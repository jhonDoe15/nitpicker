import { existsSync } from 'node:fs';
import path from 'node:path';

const EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'];

export const PROJECT_CONFIG_NAMES = ['vitest', 'vite'].flatMap((name) =>
  EXTENSIONS.map((extension) => `${name}.config.${extension}`),
);

export function projectConfigFile(projectRoot) {
  const name = PROJECT_CONFIG_NAMES.find((candidate) =>
    existsSync(path.join(projectRoot, candidate)),
  );
  return name === undefined ? undefined : path.join(projectRoot, name);
}
