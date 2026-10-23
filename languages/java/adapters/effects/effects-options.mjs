import { readdirSync } from 'node:fs';
import path from 'node:path';
import { readSpringDocuments } from '../spring/spring-config-files.mjs';
import { relaxKey } from '../spring/spring-config-parser.mjs';
import { placeholderDefault } from '../spring/spring-secrets.mjs';

const BATCH_KEYS = new Set(
  [
    'hibernate.default_batch_fetch_size',
    'spring.jpa.properties.hibernate.default_batch_fetch_size',
  ].map(relaxKey),
);
const RESOURCES = path.join('src', 'main', 'resources');
const SKIPPED = new Set(['build', 'target', 'node_modules', 'out', 'bin']);
const DEPTH = 6;

function isResources(directory) {
  return directory.endsWith(path.sep + RESOURCES);
}

function children(base, { directory, depth }) {
  if (depth > DEPTH) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && !entry.name.startsWith('.') && !SKIPPED.has(entry.name),
    )
    .map((entry) => path.resolve(directory, entry.name))
    .filter((child) => child.startsWith(base + path.sep));
}

function resourceRoots(projectRoot) {
  const base = path.resolve(projectRoot);
  const pending = [{ directory: base, depth: 0 }];
  const found = [];
  for (const current of pending) {
    const next = children(base, current);
    found.push(
      ...next
        .filter(isResources)
        .map((child) => path.relative(base, child).replaceAll(path.sep, '/')),
    );
    pending.push(
      ...next
        .filter((child) => !isResources(child))
        .map((child) => ({ directory: child, depth: current.depth + 1 })),
    );
  }
  return found;
}

export function batchFetchSize(projectRoot) {
  const sizes = readSpringDocuments(projectRoot, resourceRoots(projectRoot))
    .flatMap((document) => document.entries)
    .filter((entry) => BATCH_KEYS.has(relaxKey(entry.key)))
    .map((entry) => Number.parseInt(placeholderDefault(entry.value).trim(), 10))
    .filter((size) => Number.isInteger(size) && size > 1);
  return sizes.length === 0 ? undefined : Math.max(...sizes);
}

export function effectsOptions(projectRoot) {
  const size = batchFetchSize(projectRoot);
  return size === undefined ? [] : [`batchFetchSize=${size}`];
}

export function effectsProperties(projectRoot) {
  const options = effectsOptions(projectRoot);
  return options.length === 0 ? [] : [`-Pnitpicker.effects.options=${options.join(',')}`];
}
