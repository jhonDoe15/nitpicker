import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../../../shared/config.mts';
import type { ConfigLayer } from '../../../shared/values/config-types.mts';
import { readLayers as untypedReadLayers } from './layers.mts';

const readLayers: (
  configPath: string,
  options?: { readonly repositoryRoot?: string | undefined },
) => readonly ConfigLayer[] = untypedReadLayers;

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
