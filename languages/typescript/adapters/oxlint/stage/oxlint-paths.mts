import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../typed/typescript-program.mts';
import {
  baseUrlOf,
  baseUrlPaths,
  removedOptions,
} from '../../../typescript-api/typescript7-options.mts';
import { isInsideDirectory } from '../../../../../shared/paths/contained-path.mts';

type CompilerOptions = TypeScript.CompilerOptions;

export type StageConfigOptions = {
  readonly compilerOptions: Readonly<Record<string, unknown>>;
  readonly unset: readonly string[];
  readonly typeFiles: readonly string[];
};

const ts = typescriptApi();

const NO_INPUT_ERROR_CODES = new Set([18002, 18003]);

export function stageConfigOptions(
  config: Readonly<Record<string, unknown>>,
  configPath: string,
  stage: string,
): StageConfigOptions {
  const options = parsedOptions(config, configPath);
  const projectRoot = path.dirname(configPath);
  const typeDefinitions = stagedTypeDefinitions(options, projectRoot, stage);
  return {
    compilerOptions: {
      ...baseUrlPaths(options),
      ...(options.rootDirs === undefined
        ? {}
        : { rootDirs: stagedRootDirs(options.rootDirs, projectRoot, stage) }),
      ...(options.isolatedDeclarations === true ? { isolatedDeclarations: false } : {}),
      ...typeDefinitions.compilerOptions,
    },
    unset: [
      ...(baseUrlOf(options) === undefined ? [] : ['baseUrl']),
      ...(options.rootDir === undefined ? [] : ['rootDir']),
      ...removedOptions(options),
    ],
    typeFiles: typeDefinitions.typeFiles,
  };
}

function stagedTypeDefinitions(
  options: CompilerOptions,
  projectRoot: string,
  stage: string,
): Pick<StageConfigOptions, 'compilerOptions' | 'typeFiles'> {
  if (!Array.isArray(options.types)) {
    return { compilerOptions: {}, typeFiles: [] };
  }
  const stagedOptions = { ...options, configFilePath: path.join(stage, 'tsconfig.json') };
  const resolved = options.types.map((name) => ({
    name,
    fromStage: resolvedTypeFile(name, stage, stagedOptions),
    fromProject: resolvedTypeFile(name, projectRoot, options),
  }));
  const types = resolved.filter(({ fromStage }) => fromStage !== undefined).map(({ name }) => name);
  return {
    compilerOptions: types.length === options.types.length ? {} : { types },
    typeFiles: resolved.flatMap(({ fromStage, fromProject }) =>
      fromStage === undefined && fromProject !== undefined
        ? [fromProject.replaceAll('\\', '/')]
        : [],
    ),
  };
}

function resolvedTypeFile(
  name: string,
  directory: string,
  options: CompilerOptions,
): string | undefined {
  return ts.resolveTypeReferenceDirective(name, path.join(directory, 'index.ts'), options, ts.sys)
    .resolvedTypeReferenceDirective?.resolvedFileName;
}

function stagedRootDirs(rootDirs: readonly string[], projectRoot: string, stage: string): string[] {
  return rootDirs.map((directory) => {
    const staged = isInsideDirectory(projectRoot, directory)
      ? path.join(stage, path.relative(projectRoot, directory))
      : directory;
    return staged.replaceAll('\\', '/');
  });
}

function parsedOptions(
  config: Readonly<Record<string, unknown>>,
  configPath: string,
): CompilerOptions {
  const { options, errors } = ts.parseJsonConfigFileContent(
    { ...config, include: [], files: [] },
    ts.sys,
    path.dirname(configPath),
    undefined,
    configPath,
  );
  const failures = errors.filter(({ code }) => !NO_INPUT_ERROR_CODES.has(code));
  if (failures.length > 0) {
    const messages = failures.map(({ messageText }) =>
      ts.flattenDiagnosticMessageText(messageText, ' '),
    );
    throw new Error(`Lint TypeScript config ${configPath} is invalid: ${messages.join('; ')}`);
  }
  return options;
}
