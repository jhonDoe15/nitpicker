import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { chainOf } from '../../../shared/traversal.mjs';
import { readConfigFile } from '../../configuration/config.mjs';

export const DEFAULT_PRESET = 'typescript';

function configRootFrom(start) {
  const directories = chainOf(start, (directory) => {
    const parent = path.dirname(directory);
    return parent === directory ? undefined : parent;
  });
  return directories.find((directory) => existsSync(path.join(directory, CONFIG_FILE_NAME)));
}

/** The config of the nearest folder at or above `currentProjectRoot` that has one, or `{}`. */
export function nearestConfig(currentProjectRoot) {
  const configRoot = configRootFrom(realpathSync(currentProjectRoot ?? process.cwd()));
  return configRoot === undefined ? {} : readConfigFile(configRoot);
}
