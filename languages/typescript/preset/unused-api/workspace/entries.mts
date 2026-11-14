import { existsSync } from 'node:fs';
import path from 'node:path';
import type { EntryLayout, PackageEntry } from './workspace-types.mts';
import { fieldOf, fieldsOf } from '../../../../../shared/values/readers.mts';
import { depthFirst } from './entry-views.mts';
import { codeExtensionNames } from '../../layout.mjs';

const MANIFEST_ENTRY_FIELDS = ['source', 'types', 'typings', 'module', 'main'];
const FALLBACK_ROOTS = ['src', '.'];

function exportChildren(value: unknown, includeSubpaths: boolean): unknown[] {
  if (value === null || typeof value !== 'object') return [];
  const root = !includeSubpaths && Object.hasOwn(value, '.') ? fieldOf(value, '.') : value;
  if (typeof root === 'string') return [root];
  return Object.entries(fieldsOf(root))
    .filter(([key]) => includeSubpaths || !key.startsWith('.'))
    .map(([, target]) => target);
}

function manifestTargets(
  manifest: unknown,
  { includeSubpaths }: { includeSubpaths: boolean },
): string[] {
  return [
    ...MANIFEST_ENTRY_FIELDS.map((field) => fieldOf(manifest, field)),
    ...depthFirst(fieldOf(manifest, 'exports'), (value) => exportChildren(value, includeSubpaths)),
  ].filter((target) => typeof target === 'string');
}

function isSourceEntry(file: string, layout: EntryLayout): boolean {
  const extension = path.extname(file).slice(1);
  return (
    codeExtensionNames.includes(extension) &&
    !file.endsWith('.d.ts') &&
    !layout.excludedGlobs.some((glob) => path.posix.matchesGlob(file, glob)) &&
    existsSync(file)
  );
}

function indexFiles(directory: string, roots: readonly string[]): string[] {
  return roots.flatMap((root) =>
    codeExtensionNames.map((extension) => path.join(directory, root, `index.${extension}`)),
  );
}

function sourceEntryOf({ dir, manifest }: PackageEntry, layout: EntryLayout): string | undefined {
  const declared = manifestTargets(manifest, { includeSubpaths: false }).map((target) =>
    path.join(dir, target),
  );
  const candidates = [...declared, ...indexFiles(dir, [...layout.sourceRoots, ...FALLBACK_ROOTS])];
  return candidates.find((file) => isSourceEntry(file, layout));
}

export function publicEntryGlobs(entry: PackageEntry, layout: EntryLayout): string[] {
  const targets = manifestTargets(entry.manifest, { includeSubpaths: true }).map((target) =>
    path.join(entry.dir, target),
  );
  const sources = targets.filter((target) => target.includes('*') || isSourceEntry(target, layout));
  return sources.length > 0
    ? sources
    : [sourceEntryOf(entry, layout)].filter((file) => file !== undefined);
}

export function workspacePaths(
  packages: readonly PackageEntry[],
  layout: EntryLayout,
): Record<string, string[]> {
  return Object.fromEntries(
    packages.flatMap((entry): [string, string[]][] => {
      const source = sourceEntryOf(entry, layout);
      const roots = [...layout.sourceRoots, ...FALLBACK_ROOTS];
      const named: [string, string[]][] = source === undefined ? [] : [[entry.name, [source]]];
      return [...named, [`${entry.name}/*`, roots.map((root) => path.join(entry.dir, root, '*'))]];
    }),
  );
}
