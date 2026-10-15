import path from 'node:path';
import ts from 'typescript';
import { withRelativePaths } from './relative-paths.mjs';

const REMOVED_OPTIONS = new Set([
  'outFile',
  'out',
  'downlevelIteration',
  'importsNotUsedAsValues',
  'preserveValueImports',
  'keyofStringsOnly',
  'noImplicitUseStrict',
  'suppressExcessPropertyErrors',
  'suppressImplicitAnyIndexErrors',
  'noStrictGenericChecks',
  'charset',
]);
const REMOVED_WHEN_FALSE = new Set([
  'alwaysStrict',
  'allowSyntheticDefaultImports',
  'esModuleInterop',
]);
const REMOVED_TARGETS = new Set(['es3', 'es5']);
const REMOVED_MODULES = new Set(['amd', 'umd', 'system', 'none']);
const REMOVED_RESOLUTIONS = new Set(['node', 'node10', 'classic']);
const NODE_RESOLUTIONS = new Map([
  ['node16', 'node16'],
  ['node18', 'node16'],
  ['node20', 'node16'],
  ['nodenext', 'nodenext'],
]);
const ES5_DEFAULT_LIBRARIES = ['es5', 'dom', 'webworker.importscripts', 'scripthost'];
const TYPE_NAMES_FILE = '__inferred type names__.ts';

export function typeScript7Options(options, context) {
  return [
    withoutRemovedOptions,
    withSupportedTarget,
    withSupportedModule,
    withSupportedModuleResolution,
    (current) => withResolvableTypes(current, context),
    (current) => withRelativePaths(current, context),
  ].reduce((current, translate) => translate(current), options);
}

function withoutRemovedOptions(options) {
  return Object.fromEntries(
    Object.entries(options).filter(
      ([name, value]) =>
        !REMOVED_OPTIONS.has(name) && !(value === false && REMOVED_WHEN_FALSE.has(name)),
    ),
  );
}

function withSupportedTarget(options) {
  if (!REMOVED_TARGETS.has(lowerCase(options.target))) return options;
  const lib = options.noLib === true ? options.lib : (options.lib ?? ES5_DEFAULT_LIBRARIES);
  return {
    ...options,
    target: 'es2015',
    module: options.module ?? 'commonjs',
    ...(lib === undefined ? {} : { lib }),
  };
}

function withSupportedModule(options) {
  return REMOVED_MODULES.has(lowerCase(options.module))
    ? { ...options, module: 'preserve' }
    : options;
}

function withSupportedModuleResolution(options) {
  if (!REMOVED_RESOLUTIONS.has(lowerCase(options.moduleResolution))) return options;
  const moduleResolution = NODE_RESOLUTIONS.get(lowerCase(options.module)) ?? 'bundler';
  return { ...options, moduleResolution };
}

function withResolvableTypes(options, { directory, resolvedOptions }) {
  if (!Array.isArray(options.types)) return options;
  const containingFile = path.join(directory, TYPE_NAMES_FILE);
  const types = options.types.filter(
    (name) =>
      ts.resolveTypeReferenceDirective(name, containingFile, resolvedOptions, ts.sys)
        .resolvedTypeReferenceDirective !== undefined,
  );
  return { ...options, types };
}

function lowerCase(value) {
  return typeof value === 'string' ? value.toLowerCase() : undefined;
}
