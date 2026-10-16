import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  coverageOutputFile,
  coverageSourceFiles,
  removeTemporary,
  temporaryProjectPath,
} from '../test-run.mjs';
import { writeV8Coverage } from './v8-coverage.mjs';

const LOADED_SOURCES = pathToFileURL(path.join(import.meta.dirname, 'loaded-sources.mjs')).href;

export function startV8Coverage(options, command) {
  const coverageDirectory = temporaryProjectPath(options, 'v8-coverage');
  const sourcesDirectory = temporaryProjectPath(options, 'loaded-sources');
  mkdirSync(coverageDirectory);
  mkdirSync(sourcesDirectory);
  const nodeOptions = command.environment.NODE_OPTIONS ?? process.env.NODE_OPTIONS ?? '';
  return {
    environment: {
      NODE_ENV: process.env.NODE_ENV ?? 'test',
      ...command.environment,
      NODE_V8_COVERAGE: coverageDirectory,
      NITPICKER_LOADED_SOURCES: sourcesDirectory,
      NODE_OPTIONS: `${nodeOptions} --import=${LOADED_SOURCES}`.trim(),
    },
    write: () =>
      writeV8Coverage({
        coverageDirectory,
        sourcesDirectory,
        sourceFiles: coverageSourceFiles(options),
        outputFile: coverageOutputFile(options),
      }),
    remove: () => removeTemporary(coverageDirectory, sourcesDirectory),
  };
}
