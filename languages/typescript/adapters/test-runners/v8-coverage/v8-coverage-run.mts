import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type TypeScript from 'typescript';
import {
  coverageOutputFile,
  coverageSourceFiles,
  removeTemporary,
  temporaryProjectPath,
} from '../test-run.mts';
import { writeV8Coverage } from './v8-coverage.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import type {
  CoverageRun,
  Environment,
  RunnerCommand,
  TestOptions,
} from '../typed/runner-types.mts';

type ProjectTypeScript = typeof TypeScript & {
  readonly getEmitScriptTarget: (options: TypeScript.CompilerOptions) => TypeScript.ScriptTarget;
};

const LOADED_SOURCES = path.join(import.meta.dirname, 'loaded-sources.cjs');
const TS_NODE_OPTIONS = 'TS_NODE_COMPILER_OPTIONS';
const COVERAGE_TARGET = 'es2022';

function isProjectTypeScript(value: unknown): value is ProjectTypeScript {
  return typeof fieldOf(value, 'getEmitScriptTarget') === 'function';
}

function projectTypeScript(
  projectRoot: string,
): { readonly typescript: unknown } | { readonly unavailable: unknown } {
  try {
    const typescript: unknown = createRequire(path.join(projectRoot, 'package.json'))('typescript');
    return { typescript };
  } catch (error) {
    return { unavailable: error };
  }
}

function writtenOptions(
  text: string | undefined,
): { readonly options: object } | { readonly malformed: unknown } {
  try {
    const options: unknown = JSON.parse(text ?? '{}');
    return typeof options === 'object' && options !== null ? { options } : { malformed: text };
  } catch (error) {
    return { malformed: error };
  }
}

function compiledOptions(
  typescript: ProjectTypeScript,
  projectRoot: string,
  written: object,
): TypeScript.CompilerOptions {
  const configFile = typescript.findConfigFile(projectRoot, (file) =>
    typescript.sys.fileExists(file),
  );
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

function tsNodeEnvironment(projectRoot: string, environment: Environment): Environment {
  const loaded = projectTypeScript(projectRoot);
  const typescript = 'typescript' in loaded ? loaded.typescript : undefined;
  const parsed = writtenOptions(environment[TS_NODE_OPTIONS]);
  if (!(isProjectTypeScript(typescript) && 'options' in parsed)) {
    return {};
  }
  const written = parsed.options;
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

export function startV8Coverage(options: TestOptions, command: RunnerCommand): CoverageRun {
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
