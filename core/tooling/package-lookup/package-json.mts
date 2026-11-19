import nodeModule from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chainOf } from '../../../shared/traversal.mjs';
import { fieldOf, parseJson } from '../../../shared/values/readers.mts';

const PACKAGE_MANIFEST = 'package.json';

type FindPackageJson = (specifier: string, base: string | URL) => string | undefined;

const chain: (start: string, next: (current: string) => string | undefined) => string[] = chainOf;

class ModuleLookupError extends Error {
  code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
  }
}

export function selectFindPackageJson(moduleApi: {
  readonly findPackageJSON?: FindPackageJson;
}): FindPackageJson {
  return typeof moduleApi.findPackageJSON === 'function'
    ? moduleApi.findPackageJSON
    : findPackageJsonByWalking;
}

export const findPackageJSON = selectFindPackageJson(nodeModule);

export function findPackageJsonByWalking(
  specifier: string,
  base: string | URL,
): string | undefined {
  const baseUrl = toFileUrl(base);
  const importer = fileURLToPath(baseUrl);
  if (isPathSpecifier(specifier)) {
    return pathPackageJson(fileURLToPath(parsedUrl(specifier, baseUrl)), importer);
  }
  const name = packageName(specifier, importer);
  const directory = fileURLToPath(parsedUrl('.', baseUrl));
  const found = selfReference(name, directory) ?? installedPackageJson(name, directory);
  if (found === undefined) {
    throw new ModuleLookupError(
      'ERR_MODULE_NOT_FOUND',
      `Cannot find package '${name}' imported from ${importer}`,
    );
  }
  return found;
}

function parsedUrl(text: string, base?: string | URL): URL {
  const url = URL.parse(text, base);
  if (url === null) {
    throw new ModuleLookupError('ERR_INVALID_MODULE_SPECIFIER', `Invalid URL '${text}'`);
  }
  return url;
}

function toFileUrl(base: string | URL): URL {
  if (base instanceof URL) {
    return base;
  }
  return base.startsWith('file:') ? parsedUrl(base) : pathToFileURL(base);
}

function isPathSpecifier(specifier: string): boolean {
  return /^(?:\.{1,2}(?:\/|$)|\/|file:)/u.test(specifier);
}

function packageName(specifier: string, importer: string): string {
  const parts = specifier.split('/');
  const first = parts[0] ?? '';
  const name = first.startsWith('@') ? parts.slice(0, 2).join('/') : first;
  const scopedWithoutName = name.startsWith('@') && !name.includes('/');
  if (scopedWithoutName || name.startsWith('.') || /[\\%]/u.test(name)) {
    throw new ModuleLookupError(
      'ERR_INVALID_MODULE_SPECIFIER',
      `Invalid module "${specifier}" is not a valid package name imported from ${importer}`,
    );
  }
  return name;
}

function ancestors(directory: string): string[] {
  return chain(directory, (current) => {
    const parent = path.dirname(current);
    return parent === current ? undefined : parent;
  });
}

function isFile(candidate: string): boolean {
  return statSync(candidate, { throwIfNoEntry: false })?.isFile() === true;
}

function isDirectory(candidate: string): boolean {
  return statSync(candidate, { throwIfNoEntry: false })?.isDirectory() === true;
}

function readManifest(file: string): unknown {
  try {
    return parseJson(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new ModuleLookupError('ERR_INVALID_PACKAGE_CONFIG', `Invalid package config ${file}.`, {
      cause: error,
    });
  }
}

function closestPackageJson(directory: string): string | undefined {
  return ancestors(directory)
    .map((candidate) => path.join(candidate, PACKAGE_MANIFEST))
    .find(isFile);
}

function pathPackageJson(target: string, importer: string): string | undefined {
  const stats = statSync(target, { throwIfNoEntry: false });
  if (stats === undefined) {
    throw new ModuleLookupError(
      'ERR_MODULE_NOT_FOUND',
      `Cannot find module '${target}' imported from ${importer}`,
    );
  }
  const found = closestPackageJson(stats.isDirectory() ? target : path.dirname(target));
  if (found !== undefined) {
    readManifest(found);
  }
  return found;
}

function packageScope(directory: string): string | undefined {
  const scopes = ancestors(directory);
  const boundary = scopes.findIndex((candidate) => path.basename(candidate) === 'node_modules');
  return (boundary === -1 ? scopes : scopes.slice(0, boundary))
    .map((candidate) => path.join(candidate, PACKAGE_MANIFEST))
    .find(isFile);
}

function selfReference(name: string, directory: string): string | undefined {
  const scope = packageScope(directory);
  if (scope === undefined) {
    return undefined;
  }
  const manifest = readManifest(scope);
  const exported =
    fieldOf(manifest, 'exports') !== undefined && fieldOf(manifest, 'exports') !== null;
  return exported && fieldOf(manifest, 'name') === name ? scope : undefined;
}

function installedPackageJson(name: string, directory: string): string | undefined {
  if (name === '') {
    return undefined;
  }
  const root = ancestors(directory)
    .map((candidate) => path.join(candidate, 'node_modules', name))
    .find(isDirectory);
  return root === undefined ? undefined : path.join(root, PACKAGE_MANIFEST);
}
