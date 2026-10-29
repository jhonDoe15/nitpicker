import { text } from 'node:stream/consumers';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import { prettierPrecedence } from '../../languages/typescript/preset/head-policy.mjs';
import {
  isIgnoredByLayers,
  layeredPrettierOptions,
} from '../../languages/typescript/adapters/prettier/prettier-layers.mjs';

async function isIgnored(input, layers, relativePath) {
  if (input.layered) {
    return isIgnoredByLayers(prettier, { ...layers, relativePath });
  }
  const info = await prettier.getFileInfo(path.join(input.projectRoot, relativePath), {
    ignorePath: layers.policyIgnorePath,
  });
  return info.ignored || info.inferredParser === null;
}

function optionsFor(input, layers, relativePath) {
  return input.layered
    ? layeredPrettierOptions(prettier, { ...layers, relativePath })
    : layers.policyOptions;
}

async function formatOne(input, layers, { path: relativePath, filePath, source }) {
  if (await isIgnored(input, layers, relativePath)) {
    return { path: relativePath, ignored: true };
  }
  const options = await optionsFor(input, layers, relativePath);
  try {
    return {
      path: relativePath,
      formatted: await prettier.format(source, { ...options, filepath: filePath }),
    };
  } catch (error) {
    if (error?.loc === undefined) {
      throw error;
    }
    return { path: relativePath, unparsable: true };
  }
}

try {
  const input = JSON.parse(await text(process.stdin));
  const layers = {
    precedence: prettierPrecedence(),
    policyOptions: JSON.parse(readFileSync(process.argv[2], 'utf8')),
    policyIgnorePath: process.argv[3],
    projectRoot: input.projectRoot,
    liveProjectRoot: input.projectRoot,
  };
  const results = await Promise.all(input.files.map((file) => formatOne(input, layers, file)));
  process.stdout.write(`${JSON.stringify({ results })}\n`);
} catch (error) {
  process.stderr.write(
    `Prettier fix failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
}
