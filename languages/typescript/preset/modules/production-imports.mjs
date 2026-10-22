import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { depthFirst } from '../../../../shared/traversal.mjs';
import { reachableModules } from './module-resolution.mjs';
import { readJsonc } from './tsconfig-files.mjs';

const PACKAGE_JSON = /(?:^|\/)package\.json$/u;
const DEPENDENCY_FOLDER = /(?:^|\/)node_modules\//u;
const ENTRY_FIELDS = ['main', 'bin', 'exports'];
const UNLIMITED = { maxDepth: Number.POSITIVE_INFINITY, maxFiles: Number.POSITIVE_INFINITY };

function specifiersOf(file) {
  return existsSync(file)
    ? ts
        .preProcessFile(readFileSync(file, 'utf8'), true, true)
        .importedFiles.map(({ fileName }) => fileName)
    : [];
}

function childValues(node) {
  return node !== null && typeof node === 'object' ? Object.values(node) : [];
}

function stringLeaves(value) {
  return [...depthFirst(value, childValues)].filter((node) => typeof node === 'string');
}

function manifestEntries(projectRoot, manifest) {
  const directory = path.posix.dirname(manifest);
  const fields = readJsonc(path.join(projectRoot, manifest));
  return ENTRY_FIELDS.flatMap((field) =>
    stringLeaves(fields?.[field]).map((target) => ({
      file: path.posix.normalize(path.posix.join(directory, target)),
      label: `${manifest} ${field}`,
    })),
  );
}

export function packageEntryFiles(projectRoot, files) {
  const tracked = new Set(files);
  return files
    .filter((file) => PACKAGE_JSON.test(file) && !DEPENDENCY_FOLDER.test(file))
    .flatMap((manifest) => manifestEntries(projectRoot, manifest))
    .filter(({ file }) => tracked.has(file));
}

export function productionReach(projectRoot, { importers, entries = [] }) {
  const root = realpathSync(projectRoot);
  const starts = [...importers.map((file) => ({ file, label: file })), ...entries];
  const labels = new Map(starts.map(({ file, label }) => [path.join(root, file), label]));
  const reached = new Map(entries.map(({ file, label }) => [file, label]));
  for (const step of reachableModules([...labels.keys()], specifiersOf, UNLIMITED)) {
    const label = labels.get(step.from);
    labels.set(step.file, label);
    reached.set(path.relative(root, step.file).split(path.sep).join('/'), label);
  }
  return reached;
}
