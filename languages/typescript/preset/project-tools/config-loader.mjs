import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import { encodedValue, withoutKnipCompilers } from './config-values.mjs';

const LOADERS = new Map([
  [
    'knip',
    {
      module: 'dist/util/load-config.js',
      load: async (loader, file) =>
        withoutKnipCompilers((await loader.loadResolvedConfigFile(file, {})) ?? {}),
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

async function loadedResult(tool, file) {
  try {
    return { config: await loadToolConfig(tool, file) };
  } catch (error) {
    return { failure: failureText(error) };
  }
}

export async function writeToolConfig({ tool, file, resultFile }) {
  writeFileSync(resultFile, JSON.stringify(await loadedResult(tool, file)));
}
