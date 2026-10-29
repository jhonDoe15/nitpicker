import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { inheritedLayerFiles } from './inherited.mjs';
import { readLayers } from './layers.mjs';

export function sharedConfigFiles(projectRoot, { repositoryRoot } = {}) {
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);
  return existsSync(configPath)
    ? readLayers(configPath, { repositoryRoot })
        .slice(0, -1)
        .map(({ file, label }) => ({ file, label }))
    : [];
}

function layerFiles(projectRoot, inherits) {
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);
  return [
    ...inheritedLayerFiles(projectRoot, inherits),
    ...(existsSync(configPath) ? readLayers(configPath) : []),
  ];
}

function layerBlobs(projectRoot, blobId, inherits) {
  try {
    return {
      blobs: layerFiles(projectRoot, inherits).map(({ file, label }) => [
        label,
        blobId(readFileSync(file)),
      ]),
    };
  } catch (error) {
    return { blobs: [], error };
  }
}

export function configLayersOf(baseProjectRoot, headProjectRoot, { blobId, inherits }) {
  const head = layerBlobs(headProjectRoot, blobId, inherits).blobs;
  const base = new Map(layerBlobs(baseProjectRoot, blobId, inherits).blobs);
  return {
    shared: head.filter(([label]) => label !== CONFIG_FILE_NAME),
    changed: head.filter(([label, blob]) => base.get(label) !== blob).map(([label]) => label),
  };
}
