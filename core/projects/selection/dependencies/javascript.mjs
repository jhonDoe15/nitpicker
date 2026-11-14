import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isPlainObject } from '../../../../shared/config.mjs';

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];
const LOCAL_SPECIFIER = /^(?:file|link|portal):(?<target>.+)$/u;
const ALIAS_SPECIFIER = /^npm:(?<name>@?[^@]+)/u;

function neededNames([name, specifier]) {
  const alias = ALIAS_SPECIFIER.exec(String(specifier))?.groups.name;
  return alias === undefined ? [`npm:${name}`] : [`npm:${name}`, `npm:${alias}`];
}

function parsedManifest(file) {
  try {
    return { value: JSON.parse(readFileSync(file, 'utf8')) };
  } catch {
    return { value: undefined, unreadable: true };
  }
}

function readManifest(directory) {
  const file = path.join(directory, 'package.json');
  return existsSync(file) ? parsedManifest(file).value : undefined;
}

function declaredDependencies(manifest) {
  return DEPENDENCY_FIELDS.flatMap((field) =>
    isPlainObject(manifest[field]) ? Object.entries(manifest[field]) : [],
  );
}

export function javascriptUnit(directory) {
  const manifest = readManifest(directory);
  if (!isPlainObject(manifest)) {
    return undefined;
  }
  const dependencies = declaredDependencies(manifest);
  return {
    names: typeof manifest.name === 'string' ? [`npm:${manifest.name}`] : [],
    needs: dependencies.flatMap(neededNames),
    folders: dependencies.flatMap(([, specifier]) => {
      const target = LOCAL_SPECIFIER.exec(String(specifier))?.groups.target;
      return target === undefined ? [] : [target];
    }),
  };
}
