import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configurationFiles } from '../adapters/java-analyzer.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../..');
const JAVA_PACKAGE = 'languages/java/';
const HAND_WRITTEN_ROUTE =
  /add an exception for|"exceptions" entry for|If it is right here|To allow it here|If this is intended, add|to "exceptions" in nitpicker/u;

function messageSources() {
  return configurationFiles()
    .filter((file) => file.startsWith(JAVA_PACKAGE))
    .map((file) => file.slice(JAVA_PACKAGE.length));
}

describe('Java finding messages', () => {
  it('in every file that shapes findings get their exception route only from the shared sentence', () => {
    const handWritten = messageSources().flatMap((file) =>
      readFileSync(path.join(packageRoot, JAVA_PACKAGE, file), 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          HAND_WRITTEN_ROUTE.test(line) ? [`${file}:${String(index + 1)}`] : [],
        ),
    );

    expect(handWritten).toEqual([]);
  });
});
