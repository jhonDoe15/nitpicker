import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { realTemporaryDirectory } from '../../tooling/temporary-files.mjs';
import { createJournal } from './journal.mts';
import { restoreJournal } from './restore.mts';
import { errorCode } from '../typed/error-text.mts';
import { messageOf } from '../../../shared/values/readers.mts';
import {
  decodedFixed,
  decodedOriginal,
  savedJournal,
  type FixedState,
  type Journal,
  type Original,
} from './journal-types.mts';

const NAME_DIGITS = 20;
const SUFFIX_BYTES = 4;
const PRIVATE_MODE = 0o600;

export function journalPath(projectRoot: string): string {
  const digest = createHash('sha256').update(projectRoot).digest('hex').slice(0, NAME_DIGITS);
  return path.join(realTemporaryDirectory(), `nitpicker-fix-dry-run-${digest}.json`);
}

function encoded(state: Original | FixedState) {
  return 'bytes' in state ? { ...state, bytes: state.bytes.toString('base64') } : state;
}

export function saveJournal(file: string, journal: Journal): void {
  const text = JSON.stringify({
    projectRoot: journal.projectRoot,
    originals: [...journal.originals].map(([name, original]) => [name, encoded(original)]),
    fixed: [...journal.fixed].map(([name, state]) => [name, encoded(state)]),
    indexListings: [...journal.indexListings],
  });
  const temporary = `${file}.${randomBytes(SUFFIX_BYTES).toString('hex')}`;
  writeFileSync(temporary, text, { mode: PRIVATE_MODE });
  renameSync(temporary, file);
}

export function dropJournal(file: string): void {
  rmSync(file, { force: true });
}

function loadJournal(file: string): Journal | { readonly unreadable: string } | undefined {
  try {
    const saved = savedJournal(readFileSync(file, 'utf8'));
    const journal = createJournal(saved.projectRoot);
    for (const [name, original] of saved.originals) {
      journal.originals.set(name, decodedOriginal(original));
    }
    for (const [name, state] of saved.fixed) {
      journal.fixed.set(name, decodedFixed(state));
    }
    for (const [name, listing] of saved.indexListings) {
      journal.indexListings.set(name, listing);
    }
    return journal;
  } catch (error) {
    return errorCode(error) === 'ENOENT' ? undefined : { unreadable: messageOf(error) };
  }
}

export function recoverInterruptedRun(projectRoot: string): string[] {
  const file = journalPath(projectRoot);
  const journal = loadJournal(file);
  if (journal === undefined) {
    return [];
  }
  dropJournal(file);
  if ('unreadable' in journal) {
    return [
      `--fix --dry-run ignored an unreadable record of an interrupted run: ${journal.unreadable}`,
    ];
  }
  const problems = restoreJournal(journal);
  return [
    `--fix --dry-run first put back the files an interrupted dry run left changed (${String(journal.originals.size)} recorded)`,
    ...problems.map((problem) => `--fix --dry-run could not restore ${problem}`),
  ];
}
