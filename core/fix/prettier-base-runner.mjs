import { readFileSync } from 'node:fs';
import * as prettier from 'prettier';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const prettierOptions = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const results = await Promise.all(
    input.files.map(async ({ path, source, filePath }) => {
      try {
        return {
          path,
          clean: await prettier.check(source, { ...prettierOptions, filepath: filePath }),
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
