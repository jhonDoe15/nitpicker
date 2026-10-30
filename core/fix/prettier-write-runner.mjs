import { text } from 'node:stream/consumers';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as prettier from 'prettier';
import { prettierPrecedence } from '../../languages/typescript/preset/head-policy.mjs';
import {
  isIgnoredByLayers,
  layeredPrettierOptions,
} from '../../languages/typescript/adapters/prettier/prettier-layers.mjs';
import { describeError } from '../../shared/messages/error-chain.mjs';

try {
  const input = JSON.parse(await text(process.stdin));
  const policyOptions = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const layers = {
    precedence: prettierPrecedence(),
    policyIgnorePath: process.argv[3],
    projectRoot: input.projectRoot,
    liveProjectRoot: input.projectRoot,
  };
  for (const relativePath of input.files) {
    if (await isIgnoredByLayers(prettier, { ...layers, relativePath })) {
      continue;
    }
    const filePath = path.join(input.projectRoot, relativePath);
    const source = readFileSync(filePath, 'utf8');
    const options = await layeredPrettierOptions(prettier, {
      ...layers,
      policyOptions,
      relativePath,
    });
    const formatted = await prettier.format(source, { ...options, filepath: filePath });
    if (formatted !== source) {
      writeFileSync(filePath, formatted);
    }
  }
} catch (error) {
  process.stderr.write(`Prettier fix failed: ${describeError(error)}\n`);
  process.exitCode = 2;
}
