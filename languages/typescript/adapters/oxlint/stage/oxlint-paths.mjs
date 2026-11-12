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

export function stageCompilerOptions(config, configPath, stage) {
  const options = parsedOptions(config, configPath);
  return {
    ...baseUrlFreeOptions(options),
    ...(options.rootDir === undefined ? {} : { rootDir: null }),
    ...(options.rootDirs === undefined
      ? {}
      : { rootDirs: stagedRootDirs(options.rootDirs, path.dirname(configPath), stage) }),
    ...(options.isolatedDeclarations === true ? { isolatedDeclarations: false } : {}),
    ...removedOptionResets(options),
    ...installedTypes(options, path.dirname(configPath)),
  };
}

function installedTypes(options, projectRoot) {
  if (!Array.isArray(options.types)) return {};
  const containingFile = path.join(projectRoot, 'index.ts');
  const installed = options.types.filter(
    (name) =>
      ts.resolveTypeReferenceDirective(name, containingFile, options, ts.sys)
        .resolvedTypeReferenceDirective !== undefined,
  );
  return installed.length === options.types.length ? {} : { types: installed };
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
    const relative = path.relative(projectRoot, directory);
    const inside = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    return (inside ? path.join(stage, relative) : directory).replaceAll('\\', '/');
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
