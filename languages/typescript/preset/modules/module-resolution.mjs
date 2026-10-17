import { existsSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { chainOf, parentDirectory } from '../../../../shared/traversal.mjs';
import { readJsonc, referencedConfigFile } from './tsconfig-files.mjs';

const CONFIG_NAMES = ['tsconfig.json', 'jsconfig.json'];
const PATH_KEYS = ['paths', 'pathsBasePath', 'baseUrl'];
const MAPPING_KEYS = ['paths', 'baseUrl'];
const PARSE_HOST = { ...ts.sys, readDirectory: () => [] };
const PACKAGE_SPECIFIER = /^(?:@[\w.-]+\/)?[\w.-]+(?:\/|$)/u;
const BUILTINS = new Set(builtinModules);
const IGNORED = Object.freeze({ kind: 'ignored' });
const DECLARATION_FILE = /\.d\.[cm]?ts$/u;
const FIXED_OPTIONS = {
  allowJs: true,
  resolveJsonModule: true,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
};

const resolvers = new Map();

function nearestConfig(directory) {
  return chainOf(directory, parentDirectory)
    .flatMap((candidate) => CONFIG_NAMES.map((name) => path.join(candidate, name)))
    .find((candidate) => existsSync(candidate));
}

function parsedConfig(configFile) {
  return ts.parseJsonConfigFileContent(
    readJsonc(configFile) ?? {},
    PARSE_HOST,
    path.dirname(configFile),
    undefined,
    configFile,
  );
}

function pathMapping(options) {
  return MAPPING_KEYS.some((key) => options[key] !== undefined)
    ? Object.fromEntries(
        PATH_KEYS.filter((key) => options[key] !== undefined).map((key) => [key, options[key]]),
      )
    : undefined;
}

function referencedMapping(configFile, rawConfig) {
  return (rawConfig?.references ?? [])
    .map((reference) => referencedConfigFile(path.dirname(configFile), reference))
    .filter((file) => existsSync(file))
    .map((file) => pathMapping(parsedConfig(file).options))
    .find(Boolean);
}

function configuredOptions(configFile) {
  const parsed = parsedConfig(configFile);
  const own = pathMapping(parsed.options);
  const mapping = own ?? referencedMapping(configFile, readJsonc(configFile));
  return { ...parsed.options, ...mapping };
}

function createResolver(configFile, directory) {
  const options = {
    ...(configFile === undefined ? {} : configuredOptions(configFile)),
    ...FIXED_OPTIONS,
  };
  const root = configFile === undefined ? directory : path.dirname(configFile);
  return {
    options,
    cache: ts.createModuleResolutionCache(root, (name) => name, options),
    pathPatterns: Object.keys(options.paths ?? {}).map(pathPatternMatcher),
    hasBaseUrl: options.baseUrl !== undefined,
  };
}

function resolverFor(directory) {
  const configFile = nearestConfig(directory);
  const key = configFile ?? directory;
  const cached = resolvers.get(key);
  if (cached !== undefined) return cached;
  const created = createResolver(configFile, directory);
  resolvers.set(key, created);
  return created;
}

function pathPatternMatcher(pattern) {
  const star = pattern.indexOf('*');
  if (star === -1) return (specifier) => specifier === pattern;
  if (pattern === '*') return () => false;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  return (specifier) =>
    specifier.length >= pattern.length - 1 &&
    specifier.startsWith(prefix) &&
    specifier.endsWith(suffix);
}

export function packageNameOf(specifier) {
  const segments = specifier.split('/');
  return specifier.startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];
}

function isPackageSpecifier(specifier) {
  return (
    PACKAGE_SPECIFIER.test(specifier) &&
    !specifier.startsWith('node:') &&
    !BUILTINS.has(specifier.split('/')[0])
  );
}

function resolvedModule(resolver, specifier, containingFile) {
  return ts.resolveModuleName(specifier, containingFile, resolver.options, ts.sys, resolver.cache)
    .resolvedModule;
}

function projectModule(resolver, specifier, containingFile) {
  const resolved = resolvedModule(resolver, specifier, containingFile);
  return resolved === undefined || resolved.isExternalLibraryImport === true
    ? undefined
    : resolved.resolvedFileName;
}

function isInstalledFile(file) {
  return file.split(path.sep).includes('node_modules') || DECLARATION_FILE.test(file);
}

function workspaceSource(resolver, specifier, containingFile) {
  const file = resolvedModule(resolver, specifier, containingFile)?.resolvedFileName;
  return file === undefined || isInstalledFile(file) ? undefined : file;
}

function matchesAlias(find, specifier) {
  return typeof find === 'string'
    ? specifier === find || specifier.startsWith(`${find}/`)
    : find.test(specifier);
}

function aliasedSpecifier(aliases, specifier) {
  const alias = aliases.find(({ find }) => matchesAlias(find, specifier));
  return alias === undefined ? specifier : specifier.replace(alias.find, alias.replacement);
}

function packageResult(resolver, specifier, containingFile) {
  const name = packageNameOf(specifier);
  const source = workspaceSource(resolver, specifier, containingFile);
  return source === undefined ? { kind: 'package', name } : { kind: 'package', name, path: source };
}

export function resolveModuleSpecifier(written, containingFile, { aliases = [] } = {}) {
  const specifier = aliasedSpecifier(aliases, written);
  const resolver = resolverFor(path.dirname(containingFile));
  const isPattern = resolver.pathPatterns.some((matches) => matches(specifier));
  const isLocal = specifier.startsWith('.') || path.isAbsolute(specifier);
  const mayBeProjectFile = isLocal || isPattern || resolver.hasBaseUrl;
  const file = mayBeProjectFile ? projectModule(resolver, specifier, containingFile) : undefined;
  if (file !== undefined) return { kind: 'file', path: file };
  const isPackage = !isLocal && !isPattern && isPackageSpecifier(specifier);
  return isPackage ? packageResult(resolver, specifier, containingFile) : IGNORED;
}

function followedFilesOf(file, specifiersOf, aliases) {
  return specifiersOf(file)
    .map((specifier) => resolveModuleSpecifier(specifier, file, { aliases }).path)
    .filter((target) => target !== undefined);
}

export function* reachableModules(entryFile, specifiersOf, { maxDepth, maxFiles, aliases = [] }) {
  const visited = new Set([entryFile]);
  const queue = [{ file: entryFile, depth: 0 }];
  for (const { file, depth } of queue) {
    if (depth > 0) yield { file, depth };
    const followed = new Set(followedFilesOf(file, specifiersOf, aliases));
    const fresh = [...followed].filter((candidate) => !visited.has(candidate));
    const room = depth < maxDepth ? Math.max(0, maxFiles - visited.size) : 0;
    if (fresh.length > room) {
      yield { truncated: true };
      return;
    }
    for (const target of fresh) {
      visited.add(target);
      queue.push({ file: target, depth: depth + 1 });
    }
  }
}
