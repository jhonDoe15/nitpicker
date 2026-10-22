import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configurationFiles } from '../adapters/python-analyzer.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../..');
const PYTHON_PACKAGE = 'languages/python/';
const ROUTE_SOURCE = 'rules/rule-hints.mjs';
const HAND_WRITTEN_ROUTE =
  /"python\.exceptions" entry|add an exception for|to "exceptions" in nitpicker|to "?exclude"? in nitpicker|with exclude in nitpicker/u;

function messageSources() {
  return configurationFiles()
    .filter((file) => file.startsWith(PYTHON_PACKAGE))
    .map((file) => file.slice(PYTHON_PACKAGE.length));
}

describe('Python finding messages', () => {
  it('get their exception route only from exceptionSentence in rule-hints.mjs', () => {
    const handWritten = messageSources()
      .filter((file) => file !== ROUTE_SOURCE)
      .flatMap((file) =>
        readFileSync(path.join(packageRoot, PYTHON_PACKAGE, file), 'utf8')
          .split('\n')
          .flatMap((line, index) =>
            HAND_WRITTEN_ROUTE.test(line) ? [`${file}:${String(index + 1)}`] : [],
          ),
      );

    expect(handWritten).toEqual([]);
  });

  it('read the one route from the file that writes it', () => {
    expect(readFileSync(path.join(packageRoot, PYTHON_PACKAGE, ROUTE_SOURCE), 'utf8')).toMatch(
      HAND_WRITTEN_ROUTE,
    );
  });
});
