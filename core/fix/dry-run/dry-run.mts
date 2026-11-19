import { realpathSync, writeSync } from 'node:fs';
import path from 'node:path';
import { dropJournal, journalPath, recoverInterruptedRun, saveJournal } from './journal-file.mts';
import { unifiedPatch } from './patch.mts';
import { currentOf, restoreJournal, savedOf } from './restore.mts';
import {
  trackCleanup,
  type Change,
  type DryRunResult,
  type FileState,
  type Journal,
} from './journal-types.mts';
import type { DryRunPlan } from '../typed/fix-types.mts';

function differs(before: FileState | undefined, after: FileState | undefined) {
  return before === undefined || after === undefined
    ? before !== after
    : !before.bytes.equals(after.bytes);
}

function repositoryName(repositoryRoot: string, file: string) {
  return path.relative(repositoryRoot, file).split(path.sep).join('/');
}

type DryRunRequest<Result> = {
  readonly repositoryRoot: string;
  readonly journal: Journal;
  readonly run: () => Result;
};

function changesOf(journal: Journal, repositoryRoot: string): Change[] {
  return [...journal.originals]
    .map(([file, original]) => ({
      name: repositoryName(repositoryRoot, file),
      before: savedOf(original),
      after: currentOf(file),
    }))
    .filter(({ before, after }) => differs(before, after));
}

function restore(journal: Journal) {
  const problems = restoreJournal(journal);
  if (problems.length > 0) {
    throw new Error(`--fix --dry-run could not restore ${problems.join('; ')}`);
  }
}

function fixesOf(journal: Journal, repositoryRoot: string): DryRunPlan['fixes'] {
  const prefix = repositoryName(repositoryRoot, realpathSync(journal.projectRoot));
  return journal.events.map(({ files, scope: _scope, ...event }) => ({
    ...event,
    files: files.map((name) => (prefix === '' ? name : `${prefix}/${name}`)),
  }));
}

function restoreOnExit(journal: Journal) {
  return () => {
    const problems = restoreJournal(journal);
    if (problems.length > 0) {
      writeSync(2, `nitpicker: --fix --dry-run could not restore ${problems.join('; ')}\n`);
    }
  };
}

export function dryRun<Result>({
  repositoryRoot,
  journal,
  run,
}: DryRunRequest<Result>): DryRunResult<Result> {
  const recovered = recoverInterruptedRun(journal.projectRoot);
  const record = journalPath(journal.projectRoot);
  const { savers } = journal;
  savers.push(() => {
    saveJournal(record, journal);
  });
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
