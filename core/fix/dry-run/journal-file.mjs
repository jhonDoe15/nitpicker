import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { realTemporaryDirectory } from '../../tooling/temporary-files.mjs';
import { createJournal } from './journal.mjs';
import { restoreJournal } from './restore.mjs';

const NAME_DIGITS = 20;
const SUFFIX_BYTES = 4;
const PRIVATE_MODE = 0o600;

export function journalPath(projectRoot) {
  const digest = createHash('sha256').update(projectRoot).digest('hex').slice(0, NAME_DIGITS);
  return path.join(realTemporaryDirectory(), `nitpicker-fix-dry-run-${digest}.json`);
}

function encoded(state) {
  return state?.bytes === undefined ? state : { ...state, bytes: state.bytes.toString('base64') };
}

function decoded(state) {
  return state?.bytes === undefined
    ? state
    : { ...state, bytes: Buffer.from(state.bytes, 'base64') };
}

export function saveJournal(file, journal) {
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

export function dropJournal(file) {
  rmSync(file, { force: true });
}

function loadJournal(file) {
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    const journal = createJournal(saved.projectRoot);
    for (const [name, original] of saved.originals) {
      journal.originals.set(name, decoded(original));
    }
    for (const [name, state] of saved.fixed) {
      journal.fixed.set(name, decoded(state));
    }
    for (const [name, listing] of saved.indexListings) {
      journal.indexListings.set(name, listing);
    }
    return journal;
  } catch (error) {
    return error.code === 'ENOENT' ? undefined : { unreadable: error.message };
  }
}

export function recoverInterruptedRun(projectRoot) {
  const file = journalPath(projectRoot);
  const journal = loadJournal(file);
  if (journal === undefined) {
    return [];
  }
  dropJournal(file);
  if (journal.unreadable !== undefined) {
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
