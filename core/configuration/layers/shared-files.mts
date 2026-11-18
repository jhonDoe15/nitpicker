import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mjs';
import { inheritedLayerFiles } from './inherited.mts';
import type { ConfigLayer } from '../../../shared/values/config-types.mts';
import { readLayers as untypedReadLayers } from './layers.mjs';

const readLayers: (
  configPath: string,
  options?: { readonly repositoryRoot?: string | undefined },
) => readonly ConfigLayer[] = untypedReadLayers;

type BlobId = (content: Buffer) => string;
type LayerBlob = readonly [string, string];
type LayerBlobs = { readonly blobs: readonly LayerBlob[]; readonly error?: unknown };

export type ConfigLayers = {
  readonly shared: readonly LayerBlob[];
  readonly changed: readonly string[];
};

export function sharedConfigFiles(
  projectRoot: string,
  { repositoryRoot }: { readonly repositoryRoot?: string | undefined } = {},
): readonly { readonly file: string; readonly label: string }[] {
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);
  return existsSync(configPath)
    ? readLayers(configPath, { repositoryRoot })
        .slice(0, -1)
        .map(({ file, label }) => ({ file, label }))
    : [];
}

function layerFiles(projectRoot: string, inherits: string | undefined): readonly ConfigLayer[] {
  const configPath = path.join(projectRoot, CONFIG_FILE_NAME);
  return [
    ...inheritedLayerFiles(projectRoot, inherits),
    ...(existsSync(configPath) ? readLayers(configPath) : []),
  ];
}

function layerBlobs(projectRoot: string, blobId: BlobId, inherits: string | undefined): LayerBlobs {
  try {
    return {
      blobs: layerFiles(projectRoot, inherits).map(({ file, label }): LayerBlob => [
        label,
        blobId(readFileSync(file)),
      ]),
    };
  } catch (error) {
    return { blobs: [], error };
  }
}

export function configLayersOf(
  baseProjectRoot: string,
  headProjectRoot: string,
  { blobId, inherits }: { readonly blobId: BlobId; readonly inherits?: string | undefined },
): ConfigLayers {
  const head = layerBlobs(headProjectRoot, blobId, inherits).blobs;
  const base = new Map(layerBlobs(baseProjectRoot, blobId, inherits).blobs);
  return {
    shared: head.filter(([label]) => label !== CONFIG_FILE_NAME),
    changed: head.filter(([label, blob]) => base.get(label) !== blob).map(([label]) => label),
  };
}
