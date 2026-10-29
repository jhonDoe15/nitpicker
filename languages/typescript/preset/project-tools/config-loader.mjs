import { writeFileSync } from 'node:fs';
import path from 'node:path';
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

async function loadToolConfig(tool, file) {
  const entry = LOADERS.get(tool);
  if (entry === undefined) {
    throw new Error(`No config loader for ${tool}`);
  }
  const loaderPath = resolveTool(tool, { bin: entry.module }).binPath;
  const loader = await import(pathToFileURL(loaderPath).href);
  return encodedValue(await entry.load(loader, file), path.basename(file));
}

function failureText(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }
  return error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message;
}

export async function writeToolConfig({ tool, file, resultFile }) {
  const result = await loadToolConfig(tool, file).then(
    (config) => ({ config }),
    (error) => ({ failure: failureText(error) }),
  );
  writeFileSync(resultFile, JSON.stringify(result));
}
