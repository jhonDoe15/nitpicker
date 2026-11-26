import { existsSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import type TypeScript from 'typescript';
import { cachedValue } from '../../../../shared/values/caching/cached-value.mts';
import { lazyTypeScriptApi } from '../../typescript-api/lazy-typescript-api.mts';
import {
  chainOf as untypedChainOf,
  parentDirectory as untypedParentDirectory,
} from '../../../../shared/traversal.mts';
import { aliasedSpecifier } from './specifiers/aliased-specifier.mts';
import { packageName as packageNameOf } from './specifiers/package-name.mts';
import { parsedTsconfig, readJsonc, referencedTsconfigs } from './tsconfig-files.mts';
import type {
  ModuleAlias,
  ModuleResolution,
  ModuleResolver,
  ReachLimits,
  ReachStep,
  ResolveOptions,
} from './typed/module-types.mts';

const chainOf: (start: string, parent: (directory: string) => string | undefined) => string[] =
  untypedChainOf;
const parentDirectory: (directory: string) => string | undefined = untypedParentDirectory;

const CONFIG_NAMES = ['tsconfig.json', 'jsconfig.json'];
const BASE_URL = 'baseUrl';
const PATH_KEYS = ['paths', 'pathsBasePath', BASE_URL];
const MAPPING_KEYS = ['paths', BASE_URL];
const PACKAGE_SPECIFIER = /^(?:@[\w.-]+\/)?[\w.-]+(?:\/|$)/u;
const BUILTINS = new Set(builtinModules);
const IGNORED: ModuleResolution = Object.freeze({ kind: 'ignored' });
const DECLARATION_FILE = /\.d\.[cm]?ts$/u;
function typescript(): typeof TypeScript {
  return lazyTypeScriptApi();
}

function fixedOptions(ts: typeof TypeScript): TypeScript.CompilerOptions {
  return {
    allowJs: true,
    resolveJsonModule: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  };
}

const resolvers = new Map<string, ModuleResolver>();

const configs = new Map<string, { readonly file: string | undefined }>();

function nearestConfig(directory: string): string | undefined {
  return cachedValue(configs, directory, () => ({
    file: chainOf(directory, parentDirectory)
      .flatMap((candidate) => CONFIG_NAMES.map((name) => path.join(candidate, name)))
      .find((candidate) => existsSync(candidate)),
  })).file;
}

function pathMapping(options: TypeScript.CompilerOptions): TypeScript.CompilerOptions | undefined {
  return MAPPING_KEYS.some((key) => options[key] !== undefined)
    ? Object.fromEntries(
        PATH_KEYS.filter((key) => options[key] !== undefined).map((key) => [key, options[key]]),
      )
    : undefined;
}

function referencedMapping(
  configFile: string,
  rawConfig: unknown,
): TypeScript.CompilerOptions | undefined {
  return referencedTsconfigs(configFile, rawConfig)
    .map((file) => pathMapping(parsedTsconfig(file).options))
    .find(Boolean);
}

function configuredOptions(configFile: string): TypeScript.CompilerOptions {
  const parsed = parsedTsconfig(configFile);
  const own = pathMapping(parsed.options);
  const mapping = own ?? referencedMapping(configFile, readJsonc(configFile));
  return { ...parsed.options, ...mapping };
}

function createResolver(configFile: string | undefined, directory: string): ModuleResolver {
  const ts = typescript();
  const options = {
    ...(configFile === undefined ? {} : configuredOptions(configFile)),
    ...fixedOptions(ts),
  };
  const root = configFile === undefined ? directory : path.dirname(configFile);
  return {
    options,
    cache: ts.createModuleResolutionCache(root, (name) => name, options),
    pathPatterns: Object.keys(options.paths ?? {}).map(pathPatternMatcher),
    hasBaseUrl: Reflect.get(options, BASE_URL) !== undefined,
  };
}

function resolverFor(directory: string): ModuleResolver {
  const configFile = nearestConfig(directory);
  const key = configFile ?? directory;
  return cachedValue(resolvers, key, () => createResolver(configFile, directory));
}

function pathPatternMatcher(pattern: string): (specifier: string) => boolean {
  const star = pattern.indexOf('*');
  if (star === -1) {
    return (specifier) => specifier === pattern;
  }
  if (pattern === '*') {
    return () => false;
  }
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  return (specifier) =>
    specifier.length >= pattern.length - 1 &&
    specifier.startsWith(prefix) &&
    specifier.endsWith(suffix);
}

export { packageNameOf };

function isPackageSpecifier(specifier: string): boolean {
  return (
    PACKAGE_SPECIFIER.test(specifier) &&
    !specifier.startsWith('node:') &&
    !BUILTINS.has(specifier.split('/')[0] ?? '')
  );
}

function resolvedModule(
  resolver: ModuleResolver,
  specifier: string,
  containingFile: string,
): TypeScript.ResolvedModuleFull | undefined {
  const ts = typescript();
  return ts.resolveModuleName(specifier, containingFile, resolver.options, ts.sys, resolver.cache)
    .resolvedModule;
}

function projectModule(
  resolver: ModuleResolver,
  specifier: string,
  containingFile: string,
): string | undefined {
  const resolved = resolvedModule(resolver, specifier, containingFile);
  return resolved === undefined || resolved.isExternalLibraryImport === true
    ? undefined
    : resolved.resolvedFileName;
}

function isInstalledFile(file: string): boolean {
  return file.split(path.sep).includes('node_modules') || DECLARATION_FILE.test(file);
}

function workspaceSource(
  resolver: ModuleResolver,
  specifier: string,
  containingFile: string,
): string | undefined {
  const file = resolvedModule(resolver, specifier, containingFile)?.resolvedFileName;
  return file === undefined || isInstalledFile(file) ? undefined : file;
}

function packageResult(
  resolver: ModuleResolver,
  specifier: string,
  containingFile: string,
): ModuleResolution {
  const name = packageNameOf(specifier);
  const source = workspaceSource(resolver, specifier, containingFile);
  return source === undefined ? { kind: 'package', name } : { kind: 'package', name, path: source };
}

export function resolveModuleSpecifier(
  written: string,
  containingFile: string,
  options: ResolveOptions = {},
): ModuleResolution {
  const aliases = options.aliases ?? [];
  const specifier = aliasedSpecifier(aliases, written);
  const resolver = resolverFor(path.dirname(containingFile));
  const isPattern = resolver.pathPatterns.some((matches) => matches(specifier));
  const isLocal = specifier.startsWith('.') || path.isAbsolute(specifier);
  const mayBeProjectFile = isLocal || isPattern || resolver.hasBaseUrl;
  const file = mayBeProjectFile ? projectModule(resolver, specifier, containingFile) : undefined;
  if (file !== undefined) {
    return { kind: 'file', path: file };
  }
  const isPackage = !isLocal && !isPattern && isPackageSpecifier(specifier);
  return isPackage ? packageResult(resolver, specifier, containingFile) : IGNORED;
}

function followedFilesOf(
  file: string,
  specifiersOf: (file: string) => readonly string[],
  aliases: readonly ModuleAlias[] | undefined,
): string[] {
  return specifiersOf(file)
    .map((specifier) => resolveModuleSpecifier(specifier, file, { aliases }).path)
    .filter((target) => target !== undefined);
}

export function* reachableModules(
  entries: string | readonly string[],
  specifiersOf: (file: string) => readonly string[],
  limits: ReachLimits,
): Generator<ReachStep, void> {
  const { maxDepth, maxFiles, aliases } = limits;
  const queue = [entries]
    .flat()
    .map((file): { file: string; depth: number; from: string | undefined } => ({
      file,
      depth: 0,
      from: undefined,
    }));
  const visited = new Set(queue.map(({ file }) => file));
  for (const { file, depth, from } of queue) {
    if (depth > 0 && from !== undefined) {
      yield { file, depth, from };
    }
    const followed = new Set(followedFilesOf(file, specifiersOf, aliases));
    const fresh = [...followed].filter((candidate) => !visited.has(candidate));
    const room = depth < maxDepth ? Math.max(0, maxFiles - visited.size) : 0;
    if (fresh.length > room) {
      yield { truncated: true };
      return;
    }
    for (const target of fresh) {
      visited.add(target);
      queue.push({ file: target, depth: depth + 1, from: file });
    }
  }
}
