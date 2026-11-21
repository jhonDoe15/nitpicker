import { CO_CHANGE_LIMITS } from '../../../project-rules/hygiene-rules.mts';
import { git } from '../../../hygiene/tracked-files.mts';
import { fieldOf } from '../../../values/readers.mts';
import type {
  HistoryCommit,
  HistoryEntry,
  UnavailableHistory,
  AvailableHistory,
} from '../../typed/history-types.mts';

type PendingEntry = { readonly status: string; readonly paths: string[]; readonly size: number };
type ParseState = {
  readonly commits: HistoryCommit[];
  commit: HistoryCommit | undefined;
  pending: PendingEntry | undefined;
};

const HEADER_MARK = '\u0001';
const PAIRED_STATUS = /^[RC]/u;
const NOT_A_REPOSITORY = /not a git repository/iu;

function entryOf({ status, paths }: PendingEntry): HistoryEntry {
  const kind = status.slice(0, 1);
  const [first = '', second = ''] = paths;
  return paths.length === 2
    ? { kind, exact: status === `${kind}100`, from: first, path: second }
    : { kind, exact: false, path: first };
}

function addToken(state: ParseState, token: string): void {
  if (token.startsWith(HEADER_MARK)) {
    state.commit = { sha: token.slice(HEADER_MARK.length), entries: [] };
    state.commits.push(state.commit);
    state.pending = undefined;
    return;
  }
  if (state.pending === undefined) {
    const status = token.trim();
    state.pending = { status, paths: [], size: PAIRED_STATUS.test(status) ? 2 : 1 };
    return;
  }
  state.pending.paths.push(token);
  if (state.pending.paths.length === state.pending.size) {
    state.commit?.entries.push(entryOf(state.pending));
    state.pending = undefined;
  }
}

export function parseLog(output: string): HistoryCommit[] {
  const state: ParseState = { commits: [], commit: undefined, pending: undefined };
  for (const token of output.split('\0')) {
    if (token.trim() !== '' || token.startsWith(HEADER_MARK)) {
      addToken(state, token);
    }
  }
  return state.commits;
}

function failureText(error: unknown): string {
  const failed = fieldOf(error, 'stderr');
  const stderr = typeof failed === 'string' ? failed.trim() : '';
  const text = stderr === '' ? String(fieldOf(error, 'message') ?? error) : stderr;
  return text.split(/\r?\n/u)[0] ?? '';
}

function unavailable(error: unknown): UnavailableHistory {
  if (fieldOf(error, 'code') === 'ENOENT') {
    return { available: false, reason: 'git-missing' };
  }
  const detail = failureText(error);
  if (NOT_A_REPOSITORY.test(detail)) {
    return { available: false, reason: 'not-a-repository' };
  }
  return { available: false, reason: 'unreadable', detail };
}

export function cloneDepth(projectRoot: string): string {
  try {
    return git(projectRoot, ['rev-parse', '--is-shallow-repository']).trim() === 'true'
      ? 'shallow'
      : 'full';
  } catch (error) {
    return unavailable(error).reason;
  }
}

function logArguments({
  commits,
  ref,
}: {
  readonly commits: number;
  readonly ref: string;
}): string[] {
  return [
    'log',
    '-n',
    String(commits),
    '--no-merges',
    '-M',
    '--name-status',
    '-z',
    '--relative',
    '--format=%x01%H',
    '--end-of-options',
    ref,
    '--',
    '.',
  ];
}

export function readHistory({
  projectRoot,
  commits,
  ref = 'HEAD',
}: {
  readonly projectRoot: string;
  readonly commits: number;
  readonly ref?: string;
}): AvailableHistory | UnavailableHistory {
  try {
    if (git(projectRoot, ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
      return { available: false, reason: 'shallow' };
    }
    if (git(projectRoot, ['rev-list', '-n', '1', '--all']).trim() === '') {
      return { available: false, reason: 'too-few', count: 0 };
    }
    const walked = parseLog(git(projectRoot, logArguments({ commits, ref })));
    return walked.length < CO_CHANGE_LIMITS.minHistory
      ? { available: false, reason: 'too-few', count: walked.length }
      : { available: true, commits: walked };
  } catch (error) {
    return unavailable(error);
  }
}
