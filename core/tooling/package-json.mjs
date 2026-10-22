import nodeModule from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chainOf } from '../../shared/traversal.mjs';

export const findPackageJSON = nodeModule.findPackageJSON ?? findPackageJsonByWalking;

export function findPackageJsonByWalking(specifier, base) {
  const baseUrl = toFileUrl(base);
  const directory = fileURLToPath(new URL('.', baseUrl));
  if (isPathSpecifier(specifier)) {
    return closestPackageJson(path.dirname(fileURLToPath(new URL(specifier, baseUrl))));
  }
  const name = packageName(specifier);
  return (
    selfReference(name, directory) ??
    installedPackageJson(name, directory) ??
    throwNotFound(name, baseUrl)
  );
}

function toFileUrl(base) {
  if (base instanceof URL) return base;
  return String(base).startsWith('file:') ? new URL(base) : pathToFileURL(base);
}

function isPathSpecifier(specifier) {
  return /^(?:\.{1,2}(?:\/|$)|\/|file:)/u.test(specifier);
}

function packageName(specifier) {
  const parts = specifier.split('/');
  return parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
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

function closestPackageJson(directory) {
  return ancestors(directory)
    .map((candidate) => path.join(candidate, 'package.json'))
    .find(isFile);
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
  if (scope === undefined) return undefined;
  const manifest = JSON.parse(readFileSync(scope, 'utf8'));
  const exported = manifest.exports !== undefined && manifest.exports !== null;
  return exported && manifest.name === name ? scope : undefined;
}

function installedPackageJson(name, directory) {
  const root = ancestors(directory)
    .map((candidate) => path.join(candidate, 'node_modules', name))
    .find(isDirectory);
  return root === undefined ? undefined : path.join(root, 'package.json');
}

class PackageNotFoundError extends Error {
  code = 'ERR_MODULE_NOT_FOUND';
}

function throwNotFound(name, baseUrl) {
  throw new PackageNotFoundError(
    `Cannot find package '${name}' imported from ${fileURLToPath(baseUrl)}`,
  );
}
