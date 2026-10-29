import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveTool } from '../../../../core/tooling/tool-resolution.mjs';
import { encodedValue } from './config-values.mjs';

const KNIP_COMPILER_KEYS = new Set(['compilers', 'syncCompilers', 'asyncCompilers']);

const LOADERS = new Map([
  [
    'knip',
    {
      module: 'dist/util/load-config.js',
      load: async (loader, file) => {
        const config = (await loader.loadResolvedConfigFile(file, {})) ?? {};
        return typeof config === 'object' && !Array.isArray(config)
          ? Object.fromEntries(
              Object.entries(config).filter(([key]) => !KNIP_COMPILER_KEYS.has(key)),
            )
          : config;
      },
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
  return encodedValue(await entry.load(loader, file), path.basename(file));
}

export function failureText(error) {
  if (!(error instanceof Error)) {
    return String(error);
  }
  return error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message;
}
