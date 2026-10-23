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
    needs: dependencies.map(([name]) => `npm:${name}`),
    folders: dependencies.flatMap(([, specifier]) => {
      const target = LOCAL_SPECIFIER.exec(String(specifier))?.groups.target;
      return target === undefined ? [] : [target];
    }),
  };
}
