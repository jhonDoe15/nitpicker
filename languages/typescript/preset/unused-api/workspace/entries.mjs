import { existsSync } from 'node:fs';
import path from 'node:path';
import { depthFirst } from '../../../../../shared/traversal.mjs';
import { codeExtensionNames } from '../../layout.mjs';

const MANIFEST_ENTRY_FIELDS = ['source', 'types', 'typings', 'module', 'main'];
const FALLBACK_ROOTS = ['src', '.'];

function exportChildren(value) {
  if (value === null || typeof value !== 'object') return [];
  const root = Object.hasOwn(value, '.') ? value['.'] : value;
  if (typeof root === 'string') return [root];
  return Object.entries(root ?? {})
    .filter(([key]) => !key.startsWith('.'))
    .map(([, target]) => target);
}

function exportTargets(value) {
  return [...depthFirst(value, exportChildren)].filter((target) => typeof target === 'string');
}

function manifestTargets(manifest) {
  return [
    ...MANIFEST_ENTRY_FIELDS.map((field) => manifest[field]).filter(
      (target) => typeof target === 'string',
    ),
    ...exportTargets(manifest.exports),
  ];
}

function nestedValues(value) {
  return value !== null && typeof value === 'object' ? Object.values(value) : [];
}

function declaredTargets(manifest) {
  return [
    ...MANIFEST_ENTRY_FIELDS.map((field) => manifest[field]),
    ...depthFirst(manifest.exports, nestedValues),
  ].filter((target) => typeof target === 'string');
}

function isSourceEntry(file, layout) {
  const extension = path.extname(file).slice(1);
  return (
    codeExtensionNames.includes(extension) &&
    !file.endsWith('.d.ts') &&
    !layout.excludedGlobs.some((glob) => path.posix.matchesGlob(file, glob)) &&
    existsSync(file)
  );
}

function indexFiles(directory, roots) {
  return roots.flatMap((root) =>
    codeExtensionNames.map((extension) => path.join(directory, root, `index.${extension}`)),
  );
}

function sourceEntryOf({ dir, manifest }, layout) {
  const declared = manifestTargets(manifest).map((target) => path.join(dir, target));
  const candidates = [...declared, ...indexFiles(dir, [...layout.sourceRoots, ...FALLBACK_ROOTS])];
  return candidates.find((file) => isSourceEntry(file, layout));
}

export function publicEntryGlobs(entry, layout) {
  const targets = declaredTargets(entry.manifest).map((target) => path.join(entry.dir, target));
  const sources = targets.filter((target) => target.includes('*') || isSourceEntry(target, layout));
  return sources.length > 0 ? sources : [sourceEntryOf(entry, layout)].filter(Boolean);
}

/**
 * `paths` that resolve each workspace package to its source: the entry its `package.json` names
 * when that is a source file (`main`, `types`, `exports`), else the index of a layout source root;
 * `name/*` maps into the source roots.
 */
export function workspacePaths(packages, layout) {
  return Object.fromEntries(
    packages.flatMap((entry) => {
      const source = sourceEntryOf(entry, layout);
      const roots = [...layout.sourceRoots, ...FALLBACK_ROOTS];
      return [
        ...(source === undefined ? [] : [[entry.name, [source]]]),
        [`${entry.name}/*`, roots.map((root) => path.join(entry.dir, root, '*'))],
      ];
    }),
  );
}
