import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { MODE_MASK } from './journal.mjs';
import { unifiedPatch } from './patch.mjs';

function currentOf(file) {
  const stats = lstatSync(file, { throwIfNoEntry: false });
  return stats === undefined
    ? undefined
    : { bytes: readFileSync(file), mode: stats.mode & MODE_MASK };
}

function savedOf(original) {
  return original.bytes === undefined ? undefined : original;
}

function differs(before, after) {
  return before === undefined || after === undefined
    ? before !== after
    : !before.bytes.equals(after.bytes);
}

function repositoryName(repositoryRoot, file) {
  return path.relative(repositoryRoot, file).split(path.sep).join('/');
}

function changesOf(journal, repositoryRoot) {
  return [...journal.originals]
    .map(([file, original]) => ({
      name: repositoryName(repositoryRoot, file),
      before: savedOf(original),
      after: currentOf(file),
    }))
    .filter(({ before, after }) => differs(before, after));
}

function restoreOne(file, original) {
  if (original.bytes === undefined) {
    rmSync(file, { force: true });
    return;
  }
  const current = currentOf(file);
  if (current?.bytes.equals(original.bytes) === true && current.mode === original.mode) {
    return;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, original.bytes);
  chmodSync(file, original.mode);
}

function restore(journal) {
  const failures = [];
  for (const [file, original] of journal.originals) {
    try {
      restoreOne(file, original);
    } catch (error) {
      failures.push(`${file}: ${error.message}`);
    }
  }
  const created = new Set([...journal.originals.values()].map(({ createdUnder }) => createdUnder));
  for (const directory of [...created].filter((entry) => entry !== undefined)) {
    rmSync(directory, { recursive: true, force: true });
  }
  if (failures.length > 0) {
    throw new Error(`--fix --dry-run could not restore ${failures.join('; ')}`);
  }
}

function fixesOf(journal, repositoryRoot) {
  const prefix = repositoryName(repositoryRoot, realpathSync(journal.projectRoot));
  return journal.events.map(({ files, ...event }) => ({
    ...event,
    files: files.map((name) => (prefix === '' ? name : `${prefix}/${name}`)),
  }));
}

export function dryRun({ repositoryRoot, journal, run }) {
  try {
    const result = run();
    const changes = changesOf(journal, repositoryRoot);
    return {
      result,
      patch: unifiedPatch(changes),
      fixes: fixesOf(journal, repositoryRoot),
      files: changes.map(({ name }) => name).toSorted((left, right) => left.localeCompare(right)),
    };
  } finally {
    restore(journal);
  }
}
