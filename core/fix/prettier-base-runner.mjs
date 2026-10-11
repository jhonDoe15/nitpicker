import { readFileSync } from 'node:fs';
import * as prettier from 'prettier';
import { prettierPrecedence } from '../../languages/typescript/preset/head-policy.mjs';
import { layeredPrettierOptions } from '../../languages/typescript/adapters/prettier-layers.mjs';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const policyOptions = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const precedence = prettierPrecedence();
  const results = await Promise.all(
    input.files.map(async ({ path, source, filePath }) => {
      try {
        const options = await layeredPrettierOptions(prettier, {
          precedence,
          policyOptions,
          liveProjectRoot: input.liveProjectRoot,
          relativePath: path,
        });
        return {
          path,
          clean: await prettier.check(source, { ...options, filepath: filePath }),
        };
      } catch (error) {
        return {
          path,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
  process.stdout.write(`${JSON.stringify({ results })}\n`);
} catch (error) {
  process.stderr.write(
    `Prettier base check failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
}
