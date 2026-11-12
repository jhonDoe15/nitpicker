import path from 'node:path';
import { ts } from '../../../typescript-api/typescript-api.mjs';
import { isRecord } from '../../../../../shared/rules/facts/checks.mjs';

const NO_INPUT_ERROR_CODES = new Set([18002, 18003]);
const REMOVED_ENUM_VALUES = {
  target: new Set([1]),
  module: new Set([2, 3, 4]),
  moduleResolution: new Set([1, 2]),
};
const REMOVED_FALSE_OPTIONS = ['esModuleInterop', 'allowSyntheticDefaultImports', 'alwaysStrict'];
const REMOVED_OPTIONS = ['downlevelIteration', 'outFile', 'out'];

export function stageConfigOptions(config, configPath, stage) {
  const options = parsedOptions(config, configPath);
  const projectRoot = path.dirname(configPath);
  const typeDefinitions = stagedTypeDefinitions(options, projectRoot, stage);
  return {
    compilerOptions: {
      ...baseUrlFreeOptions(options),
      ...(options.rootDir === undefined ? {} : { rootDir: null }),
      ...(options.rootDirs === undefined
        ? {}
        : { rootDirs: stagedRootDirs(options.rootDirs, projectRoot, stage) }),
      ...(options.isolatedDeclarations === true ? { isolatedDeclarations: false } : {}),
      ...removedOptionResets(options),
      ...typeDefinitions.compilerOptions,
    },
    typeFiles: typeDefinitions.typeFiles,
  };
}

function stagedTypeDefinitions(options, projectRoot, stage) {
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
    typeFiles: resolved
      .filter(({ fromStage, fromProject }) => fromStage === undefined && fromProject !== undefined)
      .map(({ fromProject }) => fromProject.replaceAll('\\', '/')),
  };
}

function isInside(directory, root) {
  const relative = path.relative(root, directory);
  return relative === '' || !(relative.startsWith('..') || path.isAbsolute(relative));
}

function resolvedTypeFile(name, directory, options) {
  return ts.resolveTypeReferenceDirective(name, path.join(directory, 'index.ts'), options, ts.sys)
    .resolvedTypeReferenceDirective?.resolvedFileName;
}

function removedOptionResets(options) {
  const removed = [
    ...Object.entries(REMOVED_ENUM_VALUES)
      .filter(([option, values]) => values.has(options[option]))
      .map(([option]) => option),
    ...REMOVED_FALSE_OPTIONS.filter((option) => options[option] === false),
    ...REMOVED_OPTIONS.filter((option) => options[option] !== undefined),
  ];
  return Object.fromEntries(removed.map((option) => [option, null]));
}

function stagedRootDirs(rootDirs, projectRoot, stage) {
  return rootDirs.map((directory) => {
    const staged = isInside(directory, projectRoot)
      ? path.join(stage, path.relative(projectRoot, directory))
      : directory;
    return staged.replaceAll('\\', '/');
  });
}

function parsedOptions(config, configPath) {
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

function baseUrlFreeOptions(options) {
  if (options.baseUrl === undefined) return {};
  return { baseUrl: null, ...absolutePaths(options.baseUrl, options.paths) };
}

function absolutePaths(baseUrl, paths) {
  if (paths !== undefined && !isRecord(paths)) return {};
  const mapped = Object.fromEntries(
    Object.entries(paths ?? {}).map(([pattern, targets]) => [
      pattern,
      Array.isArray(targets) ? targets.map((target) => absoluteTarget(baseUrl, target)) : targets,
    ]),
  );
  return { paths: { ...mapped, '*': withBareLookup(mapped['*'], absoluteTarget(baseUrl, '*')) } };
}

function withBareLookup(targets, bareTarget) {
  if (targets === undefined) return [bareTarget];
  return Array.isArray(targets) ? [...targets, bareTarget] : targets;
}

function absoluteTarget(baseUrl, target) {
  return typeof target === 'string' ? path.resolve(baseUrl, target).replaceAll('\\', '/') : target;
}
