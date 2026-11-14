import { realpathSync, writeSync } from 'node:fs';
import path from 'node:path';
import { trackCleanup } from '../../tooling/temporary-files.mjs';
import { dropJournal, journalPath, recoverInterruptedRun, saveJournal } from './journal-file.mjs';
import { unifiedPatch } from './patch.mjs';
import { currentOf, restoreJournal, savedOf } from './restore.mjs';

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

function restore(journal) {
  const problems = restoreJournal(journal);
  if (problems.length > 0) {
    throw new Error(`--fix --dry-run could not restore ${problems.join('; ')}`);
  }
}

function fixesOf(journal, repositoryRoot) {
  const prefix = repositoryName(repositoryRoot, realpathSync(journal.projectRoot));
  return journal.events.map(({ files, ...event }) => ({
    ...event,
    files: files.map((name) => (prefix === '' ? name : `${prefix}/${name}`)),
  }));
}

function restoreOnExit(journal) {
  return () => {
    const problems = restoreJournal(journal);
    if (problems.length > 0) {
      writeSync(2, `nitpicker: --fix --dry-run could not restore ${problems.join('; ')}\n`);
    }
  };
}

export function dryRun({ repositoryRoot, journal, run }) {
  const recovered = recoverInterruptedRun(journal.projectRoot);
  const record = journalPath(journal.projectRoot);
  journal.save = () => {
    saveJournal(record, journal);
  };
  const stopTracking = trackCleanup(restoreOnExit(journal));
  try {
    const result = run();
    const changes = changesOf(journal, repositoryRoot);
    return {
      result,
      recovered,
      patch: unifiedPatch(changes),
      fixes: fixesOf(journal, repositoryRoot),
      files: changes.map(({ name }) => name).toSorted((left, right) => left.localeCompare(right)),
    };
  } finally {
    try {
      restore(journal);
      dropJournal(record);
    } finally {
      stopTracking();
    }
  }
}
