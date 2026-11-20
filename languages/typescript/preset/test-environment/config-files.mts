import path from 'node:path';
import { firstProjectFile } from '../test-runner/typed/shared-views.mts';

const EXTENSIONS = ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs'];

export const PROJECT_CONFIG_NAMES = ['vitest', 'vite'].flatMap((name) =>
  EXTENSIONS.map((extension) => `${name}.config.${extension}`),
);

export function projectConfigFile(projectRoot: string): string | undefined {
  const name = firstProjectFile(projectRoot, PROJECT_CONFIG_NAMES);
  return name === undefined ? undefined : path.join(projectRoot, name);
}
