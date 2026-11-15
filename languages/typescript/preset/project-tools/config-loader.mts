import { loadDependencyCruiserConfig } from './dependency-cruiser-loader.mts';
import {
  encodedValue,
  importToolFile,
  loadResolvedConfigFile,
  withoutKnipCompilers,
} from './typed/tool-modules.mts';
import type { LoaderEntry } from './typed/tool-modules.mts';

const LOADERS = new Map<string, LoaderEntry>([
  [
    'knip',
    {
      module: 'dist/util/load-config.js',
      load: async (loader, file) =>
        withoutKnipCompilers((await loadResolvedConfigFile(loader, file)) ?? {}),
    },
  ],
  [
    'dependency-cruiser',
    {
      module: 'src/config-utl/extract-depcruise-config/index.mjs',
      load: loadDependencyCruiserConfig,
    },
  ],
]);

export async function loadToolConfig(tool: string, file: string): Promise<unknown> {
  const entry = LOADERS.get(tool);
  if (entry === undefined) {
    throw new Error(`No config loader for ${tool}`);
  }
  const loader = await importToolFile(tool, entry.module);
  return encodedValue(await entry.load(loader, file));
}
