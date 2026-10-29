import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { readLayers } from './layers.mjs';

export function sharedConfigFiles(projectRoot, { repositoryRoot } = {}) {
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);
  return existsSync(configPath)
    ? readLayers(configPath, { repositoryRoot })
        .slice(0, -1)
        .map(({ file, label }) => ({ file, label }))
    : [];
}

function layerBlobs(projectRoot, blobId) {
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);
  if (!existsSync(configPath)) {
    return { blobs: [] };
  }
  try {
    return {
      blobs: readLayers(configPath).map(({ file, label }) => [label, blobId(readFileSync(file))]),
    };
  } catch (error) {
    return { blobs: [], error };
  }
}

export function configLayersOf(baseProjectRoot, headProjectRoot, blobId) {
  const head = layerBlobs(headProjectRoot, blobId).blobs;
  const base = new Map(layerBlobs(baseProjectRoot, blobId).blobs);
  return {
    shared: head.filter(([label]) => label !== CONFIG_FILE_NAME),
    changed: head.filter(([label, blob]) => base.get(label) !== blob).map(([label]) => label),
  };
}
