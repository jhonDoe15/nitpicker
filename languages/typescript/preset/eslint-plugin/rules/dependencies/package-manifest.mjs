import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const manifests = new Map();

export function nearestManifest(directory) {
  if (!manifests.has(directory)) {
    manifests.set(directory, findManifest(directory));
  }
  return manifests.get(directory);
}

function findManifest(directory) {
  const file = path.join(directory, 'package.json');
  if (existsSync(file)) {
    return readManifest(file);
  }
  const parent = path.dirname(directory);
  return parent === directory ? undefined : nearestManifest(parent);
}

function parseObject(text) {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? { value: parsed } : {};
  } catch (error) {
    return { error };
  }
}

function readManifest(file) {
  const { value } = parseObject(readFileSync(file, 'utf8'));
  return value === undefined
    ? undefined
    : {
        development: new Set(Object.keys(value.devDependencies ?? {})),
        runtime: new Set(
          ['dependencies', 'peerDependencies', 'optionalDependencies'].flatMap((section) =>
            Object.keys(value[section] ?? {}),
          ),
        ),
      };
}

export function packageNameOf(specifier) {
  if (/^(?:[./#]|node:)/u.test(specifier)) {
    return undefined;
  }
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}
