import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  coverageOutputFile,
  coverageSourceFiles,
  removeTemporary,
  temporaryProjectPath,
} from '../test-run.mjs';
import { writeV8Coverage } from './v8-coverage.mjs';

const LOADED_SOURCES = path.join(import.meta.dirname, 'loaded-sources.cjs');
const TS_NODE_OPTIONS = 'TS_NODE_COMPILER_OPTIONS';
const COVERAGE_TARGET = 'es2022';

function projectTypeScript(projectRoot) {
  try {
    return { typescript: createRequire(path.join(projectRoot, 'package.json'))('typescript') };
  } catch (error) {
    return { unavailable: error };
  }
}

function writtenOptions(text) {
  try {
    const options = JSON.parse(text ?? '{}');
    return typeof options === 'object' && options !== null ? { options } : { malformed: text };
  } catch (error) {
    return { malformed: error };
  }
}

function compiledOptions(typescript, projectRoot, written) {
  const configFile = typescript.findConfigFile(projectRoot, typescript.sys.fileExists);
  const host = { ...typescript.sys, onUnRecoverableConfigFileDiagnostic: () => {} };
  const configured =
    configFile === undefined
      ? {}
      : (typescript.getParsedCommandLineOfConfigFile(configFile, {}, host)?.options ?? {});
  return {
    ...configured,
    ...typescript.convertCompilerOptionsFromJson(written, projectRoot).options,
  };
}

function tsNodeEnvironment(projectRoot, environment) {
  const { typescript } = projectTypeScript(projectRoot);
  const { options: written } = writtenOptions(environment[TS_NODE_OPTIONS]);
  if (typeof typescript?.getEmitScriptTarget !== 'function' || written === undefined) {
    return {};
  }
  const options = compiledOptions(typescript, projectRoot, written);
  if (typescript.getEmitScriptTarget(options) >= typescript.ScriptTarget.ES2022) {
    return {};
  }
  const useDefineForClassFields = options.useDefineForClassFields ?? false;
  return {
    [TS_NODE_OPTIONS]: JSON.stringify({
      ...written,
      target: COVERAGE_TARGET,
      useDefineForClassFields,
    }),
  };
}

export function startV8Coverage(options, command) {
  const coverageDirectory = temporaryProjectPath(options, 'v8-coverage');
  const sourcesDirectory = temporaryProjectPath(options, 'loaded-sources');
  mkdirSync(coverageDirectory);
  mkdirSync(sourcesDirectory);
  return {
    nodeArguments: ['--require', LOADED_SOURCES],
    environment: {
      ...command.environment,
      ...tsNodeEnvironment(options.projectRoot, command.environment),
      NODE_V8_COVERAGE: coverageDirectory,
      NITPICKER_LOADED_SOURCES: sourcesDirectory,
    },
    write: () =>
      writeV8Coverage({
        coverageDirectory,
        sourcesDirectory,
        sourceFiles: coverageSourceFiles(options),
        outputFile: coverageOutputFile(options),
      }),
    remove: () => {
      removeTemporary(coverageDirectory, sourcesDirectory);
    },
  };
}
