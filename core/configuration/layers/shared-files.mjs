import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { readLayers } from './layers.mjs';

export function sharedConfigFiles(projectRoot) {
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);
  return existsSync(configPath)
    ? readLayers(configPath)
        .slice(0, -1)
        .map(({ file, label }) => ({ file, label }))
    : [];
}

export function sharedConfigBlobs(projectRoot, blobId) {
  return sharedConfigFiles(projectRoot).map(({ file, label }) => [
    label,
    blobId(readFileSync(file)),
  ]);
}
