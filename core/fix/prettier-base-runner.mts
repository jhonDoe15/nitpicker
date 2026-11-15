import { text } from 'node:stream/consumers';
import path from 'node:path';
import * as prettier from 'prettier';
import {
  ignoreOptions,
  inputOf,
  isIgnoredByLayers,
  layeredPrettierOptions,
  layersOf,
  lacksLocation,
} from './prettier-runner-types.mts';
import type { Input, Layers, SourceFile } from './prettier-runner-types.mts';

async function isIgnored(input: Input, layers: Layers, relativePath: string) {
  if (input.layered) {
    return isIgnoredByLayers(prettier, { ...layers, relativePath });
  }
  const info = await prettier.getFileInfo(
    path.join(input.projectRoot, relativePath),
    ignoreOptions(layers),
  );
  return info.ignored || info.inferredParser === null;
}

function optionsFor(input: Input, layers: Layers, relativePath: string) {
  return input.layered
    ? layeredPrettierOptions(prettier, { ...layers, relativePath })
    : layers.policyOptions;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function formatOne(input: Input, layers: Layers, file: SourceFile) {
  const { path: relativePath, filePath, source } = file;
  try {
    if (await isIgnored(input, layers, relativePath)) {
      return { path: relativePath, ignored: true };
    }
    const options = await optionsFor(input, layers, relativePath);
    return {
      path: relativePath,
      formatted: await prettier.format(source, { ...options, filepath: filePath }),
    };
  } catch (error) {
    return lacksLocation(error)
      ? { path: relativePath, error: messageOf(error) }
      : { path: relativePath, unparsable: true };
  }
}

const input = inputOf(await text(process.stdin));
const layers = layersOf(input, process.argv);
const results = await Promise.all(input.files.map((file) => formatOne(input, layers, file)));
process.stdout.write(`${JSON.stringify({ results })}\n`);
