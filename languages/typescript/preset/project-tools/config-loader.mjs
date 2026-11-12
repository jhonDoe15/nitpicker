import { pathToFileURL } from 'node:url';
import { resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import { encodedValue, withoutKnipCompilers } from './config-values.mjs';
import { loadDependencyCruiserConfig } from './dependency-cruiser-loader.mjs';

const LOADERS = new Map([
  [
    'knip',
    {
      module: 'dist/util/load-config.js',
      load: async (loader, file) =>
        withoutKnipCompilers((await loader.loadResolvedConfigFile(file, {})) ?? {}),
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

export async function loadToolConfig(tool, file) {
  const entry = LOADERS.get(tool);
  if (entry === undefined) {
    throw new Error(`No config loader for ${tool}`);
  }
  const loaderPath = resolveTool(tool, { bin: entry.module }).binPath;
  const loader = await import(pathToFileURL(loaderPath).href);
  return encodedValue(await entry.load(loader, file));
}
