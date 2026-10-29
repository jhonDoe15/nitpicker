import nodeModule from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chainOf } from '../../shared/traversal.mjs';

class ModuleLookupError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.code = code;
  }
}

export function selectFindPackageJson(moduleApi) {
  return typeof moduleApi.findPackageJSON === 'function'
    ? moduleApi.findPackageJSON
    : findPackageJsonByWalking;
}

export const findPackageJSON = selectFindPackageJson(nodeModule);

export function findPackageJsonByWalking(specifier, base) {
  const baseUrl = toFileUrl(base);
  const importer = fileURLToPath(baseUrl);
  if (isPathSpecifier(specifier)) {
    return pathPackageJson(fileURLToPath(new URL(specifier, baseUrl)), importer);
  }
  const name = packageName(specifier, importer);
  const directory = fileURLToPath(new URL('.', baseUrl));
  const found = selfReference(name, directory) ?? installedPackageJson(name, directory);
  if (found === undefined) {
    throw new ModuleLookupError(
      'ERR_MODULE_NOT_FOUND',
      `Cannot find package '${name}' imported from ${importer}`,
    );
  }
  return found;
}

function toFileUrl(base) {
  if (base instanceof URL) {
    return base;
  }
  return String(base).startsWith('file:') ? new URL(base) : pathToFileURL(base);
}

function isPathSpecifier(specifier) {
  return /^(?:\.{1,2}(?:\/|$)|\/|file:)/u.test(specifier);
}

function packageName(specifier, importer) {
  const parts = specifier.split('/');
  const name = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  const scopedWithoutName = name.startsWith('@') && !name.includes('/');
  if (scopedWithoutName || name.startsWith('.') || /[\\%]/u.test(name)) {
    throw new ModuleLookupError(
      'ERR_INVALID_MODULE_SPECIFIER',
      `Invalid module "${specifier}" is not a valid package name imported from ${importer}`,
    );
  }
  return name;
}

function ancestors(directory) {
  return chainOf(directory, (current) => {
    const parent = path.dirname(current);
    return parent === current ? undefined : parent;
  });
}

function isFile(candidate) {
  return statSync(candidate, { throwIfNoEntry: false })?.isFile() === true;
}

function isDirectory(candidate) {
  return statSync(candidate, { throwIfNoEntry: false })?.isDirectory() === true;
}

function readManifest(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new ModuleLookupError('ERR_INVALID_PACKAGE_CONFIG', `Invalid package config ${file}.`, {
      cause: error,
    });
  }
}

function closestPackageJson(directory) {
  return ancestors(directory)
    .map((candidate) => path.join(candidate, 'package.json'))
    .find(isFile);
}

function pathPackageJson(target, importer) {
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

function packageScope(directory) {
  const scopes = ancestors(directory);
  const boundary = scopes.findIndex((candidate) => path.basename(candidate) === 'node_modules');
  return (boundary === -1 ? scopes : scopes.slice(0, boundary))
    .map((candidate) => path.join(candidate, 'package.json'))
    .find(isFile);
}

function selfReference(name, directory) {
  const scope = packageScope(directory);
  if (scope === undefined) {
    return undefined;
  }
  const manifest = readManifest(scope);
  const exported = manifest.exports !== undefined && manifest.exports !== null;
  return exported && manifest.name === name ? scope : undefined;
}

function installedPackageJson(name, directory) {
  if (name === '') {
    return undefined;
  }
  const root = ancestors(directory)
    .map((candidate) => path.join(candidate, 'node_modules', name))
    .find(isDirectory);
  return root === undefined ? undefined : path.join(root, 'package.json');
}
