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
const RESOURCES = 'src/main/resources';
const SKIPPED = new Set(['build', 'target', 'node_modules', 'out', 'bin']);
const DEPTH = 6;

function isResources(directory) {
  return directory.replaceAll(path.sep, '/').endsWith(`/${RESOURCES}`);
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

function sizeIn(projectRoot, roots) {
  const sizes = readSpringDocuments(projectRoot, roots)
    .flatMap((document) => document.entries)
    .filter((entry) => BATCH_KEYS.has(relaxKey(entry.key)))
    .map((entry) => Number.parseInt(placeholderDefault(entry.value).trim(), 10))
    .filter((size) => Number.isInteger(size) && size > 1);
  return sizes.length === 0 ? undefined : Math.max(...sizes);
}

function moduleOf(resourceRoot) {
  const module = resourceRoot.slice(0, -RESOURCES.length).replace(/\/$/u, '');
  return module === '' ? '.' : module;
}

export function batchFetchSizes(projectRoot) {
  const byModule = new Map();
  for (const root of resourceRoots(projectRoot)) {
    const module = moduleOf(root);
    byModule.set(module, [...(byModule.get(module) ?? []), root]);
  }
  return new Map(
    [...byModule]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([module, roots]) => [module, sizeIn(projectRoot, roots)])
      .filter(([, size]) => size !== undefined),
  );
}

export function batchFetchSize(projectRoot) {
  const sizes = [...batchFetchSizes(projectRoot).values()];
  return sizes.length === 0 ? undefined : Math.max(...sizes);
}

function scopedOptions(projectRoot, place) {
  return [...batchFetchSizes(projectRoot)].map(
    ([module, size]) => `batchFetchSize=${String(size)}@${place(module)}`,
  );
}

export function effectsOptions(projectRoot) {
  return scopedOptions(projectRoot, (module) => path.resolve(projectRoot, module));
}

export function moduleEffectsOptions(options, moduleDir) {
  return options.flatMap((option) => {
    const at = option.lastIndexOf('@');
    if (at === -1) {
      return [option];
    }
    return path.resolve(option.slice(at + 1)) === path.resolve(moduleDir)
      ? [option.slice(0, at)]
      : [];
  });
}

export function effectsProperties(projectRoot) {
  const options = scopedOptions(projectRoot, (module) => module);
  return options.length === 0 ? [] : [`-Pnitpicker.effects.options=${options.join(',')}`];
}
