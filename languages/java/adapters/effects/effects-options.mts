import { readdirSync } from 'node:fs';
import path from 'node:path';
import { readSpringDocuments } from '../spring/spring-config-files.mts';
import { relaxKey } from '../spring/spring-config-parser.mts';
import { placeholderDefault } from '../spring/spring-secrets.mts';
import { appendAll, largest } from '../../../../shared/lists/items.mjs';

type Visit = { readonly directory: string; readonly depth: number };

type SpringDocuments = (
  projectRoot: string,
  roots: readonly string[],
) => readonly { readonly entries: readonly { readonly key: string; readonly value: string }[] }[];

const documentsOf: SpringDocuments = readSpringDocuments;
const defaultOf: (value: string) => string = placeholderDefault;
const BATCH_KEYS = new Set(
  [
    'hibernate.default_batch_fetch_size',
    'spring.jpa.properties.hibernate.default_batch_fetch_size',
  ].map(relaxKey),
);
const RESOURCES = 'src/main/resources';
const SKIPPED = new Set(['build', 'target', 'node_modules', 'out', 'bin']);
const DEPTH = 6;

function isResources(directory: string): boolean {
  return directory.replaceAll(path.sep, '/').endsWith(`/${RESOURCES}`);
}

function children(base: string, { directory, depth }: Visit): string[] {
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

function resourceRoots(projectRoot: string): string[] {
  const base = path.resolve(projectRoot);
  const pending: Visit[] = [{ directory: base, depth: 0 }];
  const found: string[] = [];
  for (const current of pending) {
    const next = children(base, current);
    appendAll(
      found,
      next.filter(isResources).map((child) => path.relative(base, child).replaceAll(path.sep, '/')),
    );
    appendAll(
      pending,
      next
        .filter((child) => !isResources(child))
        .map((child) => ({ directory: child, depth: current.depth + 1 })),
    );
  }
  return found;
}

function sizeIn(projectRoot: string, roots: readonly string[]): number | undefined {
  const sizes = documentsOf(projectRoot, roots)
    .flatMap((document) => document.entries)
    .filter((entry) => BATCH_KEYS.has(relaxKey(entry.key)))
    .map((entry) => Number.parseInt(defaultOf(entry.value).trim(), 10))
    .filter((size) => Number.isInteger(size) && size > 1);
  return sizes.length === 0 ? undefined : largest(sizes);
}

function moduleOf(resourceRoot: string): string {
  const module = resourceRoot.slice(0, -RESOURCES.length).replace(/\/$/u, '');
  return module === '' ? '.' : module;
}

export function batchFetchSizes(projectRoot: string): Map<string, number> {
  const byModule = new Map<string, string[]>();
  for (const root of resourceRoots(projectRoot)) {
    const module = moduleOf(root);
    byModule.set(module, [...(byModule.get(module) ?? []), root]);
  }
  return new Map(
    [...byModule]
      .sort(([left], [right]) => left.localeCompare(right))
      .map((entry): [string, number | undefined] => [entry[0], sizeIn(projectRoot, entry[1])])
      .filter((entry): entry is [string, number] => entry[1] !== undefined),
  );
}

export function batchFetchSize(projectRoot: string): number | undefined {
  const sizes = [...batchFetchSizes(projectRoot).values()];
  return sizes.length === 0 ? undefined : largest(sizes);
}

function scopedOptions(projectRoot: string, place: (module: string) => string): string[] {
  return [...batchFetchSizes(projectRoot)].map(
    ([module, size]) => `batchFetchSize=${String(size)}@${place(module)}`,
  );
}

export function effectsOptions(projectRoot: string): string[] {
  return scopedOptions(projectRoot, (module) => path.resolve(projectRoot, module));
}

export function moduleEffectsOptions(options: readonly string[], moduleDir: string): string[] {
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

export function effectsProperties(projectRoot: string): string[] {
  const options = scopedOptions(projectRoot, (module) => module);
  return options.length === 0 ? [] : [`-Pnitpicker.effects.options=${options.join(',')}`];
}
