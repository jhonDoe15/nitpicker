import path from 'node:path';
import type TypeScript from 'typescript';
import { typescriptApi } from '../../typed/typescript-program.mts';
import { isRecord as untypedIsRecord } from '../../../../../shared/rules/facts/checks.mjs';
import { fieldOf, fieldsOf, listOf } from '../../../../../shared/values/readers.mts';

type CompilerOptions = TypeScript.CompilerOptions;

export type StageConfigOptions = {
  readonly compilerOptions: Readonly<Record<string, unknown>>;
  readonly unset: readonly string[];
  readonly typeFiles: readonly string[];
};

const isRecord: (value: unknown) => boolean = untypedIsRecord;

const ts = typescriptApi();

const NO_INPUT_ERROR_CODES = new Set([18002, 18003]);
const REMOVED_ENUM_VALUES: Readonly<Record<string, ReadonlySet<unknown>>> = {
  target: new Set([1]),
  module: new Set([2, 3, 4]),
  moduleResolution: new Set([1, 2]),
};
const REMOVED_FALSE_OPTIONS = ['esModuleInterop', 'allowSyntheticDefaultImports', 'alwaysStrict'];
const REMOVED_OPTIONS = ['downlevelIteration', 'outFile', 'out'];

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

function isInside(directory: string, root: string): boolean {
  const relative = path.relative(root, directory);
  return relative === '' || !(relative.startsWith('..') || path.isAbsolute(relative));
}

function resolvedTypeFile(
  name: string,
  directory: string,
  options: CompilerOptions,
): string | undefined {
  return ts.resolveTypeReferenceDirective(name, path.join(directory, 'index.ts'), options, ts.sys)
    .resolvedTypeReferenceDirective?.resolvedFileName;
}

function removedOptions(options: CompilerOptions): string[] {
  return [
    ...Object.entries(REMOVED_ENUM_VALUES)
      .filter(([option, values]) => values.has(options[option]))
      .map(([option]) => option),
    ...REMOVED_FALSE_OPTIONS.filter((option) => options[option] === false),
    ...REMOVED_OPTIONS.filter((option) => options[option] !== undefined),
  ];
}

function stagedRootDirs(rootDirs: readonly string[], projectRoot: string, stage: string): string[] {
  return rootDirs.map((directory) => {
    const staged = isInside(directory, projectRoot)
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

function baseUrlOf(options: CompilerOptions): string | undefined {
  const baseUrl = fieldOf(options, 'baseUrl');
  return typeof baseUrl === 'string' ? baseUrl : undefined;
}

function baseUrlPaths(options: CompilerOptions): Readonly<Record<string, unknown>> {
  const baseUrl = baseUrlOf(options);
  return baseUrl === undefined ? {} : absolutePaths(baseUrl, options.paths);
}

function absolutePaths(baseUrl: string, paths: unknown): Readonly<Record<string, unknown>> {
  if (paths !== undefined && !isRecord(paths)) return {};
  const mapped = Object.fromEntries(
    Object.entries(fieldsOf(paths)).map(([pattern, targets]) => [
      pattern,
      Array.isArray(targets) ? targets.map((target) => absoluteTarget(baseUrl, target)) : targets,
    ]),
  );
  return { paths: { ...mapped, '*': withBareLookup(mapped['*'], absoluteTarget(baseUrl, '*')) } };
}

function withBareLookup(targets: unknown, bareTarget: unknown): unknown {
  if (targets === undefined) return [bareTarget];
  return Array.isArray(targets) ? [...listOf(targets), bareTarget] : targets;
}

function absoluteTarget(baseUrl: string, target: unknown): unknown {
  return typeof target === 'string' ? path.resolve(baseUrl, target).replaceAll('\\', '/') : target;
}
