import { execFileSync } from 'node:child_process';
import { CO_CHANGE_LIMITS } from '../../../project-rules/hygiene-rules.mjs';

const MAX_LOG_BYTES = 512 * 1024 * 1024;
const HEADER_MARK = '\u0001';
const PAIRED_STATUS = /^[RC]/u;
const FIRST_LINE = /^[^\n]*/u;

function runGit(root, gitArguments) {
  return execFileSync('git', gitArguments, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: MAX_LOG_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function entryOf({ status, paths }) {
  const kind = status.slice(0, 1);
  return paths.length === 2
    ? { kind, exact: status === `${kind}100`, from: paths[0], path: paths[1] }
    : { kind, exact: false, path: paths[0] };
}

function addToken(state, token) {
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
    state.commit.entries.push(entryOf(state.pending));
    state.pending = undefined;
  }
}

export function parseLog(output) {
  const state = { commits: [], commit: undefined, pending: undefined };
  for (const token of output.split('\0')) {
    if (token.trim() !== '' || token.startsWith(HEADER_MARK)) {
      addToken(state, token);
    }
  }
  return state.commits;
}

function failure(error) {
  const text = error instanceof Error ? error.message : String(error);
  return FIRST_LINE.exec(text.trim())?.[0] ?? text;
}

export function readHistory({ projectRoot, commits }) {
  try {
    if (runGit(projectRoot, ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
      return { available: false, reason: 'shallow' };
    }
  } catch {
    return { available: false, reason: 'not-a-repository' };
  }
  try {
    const log = runGit(projectRoot, [
      'log',
      '-n',
      String(commits),
      '--no-merges',
      '-M',
      '--name-status',
      '-z',
      '--relative',
      '--format=%x01%H',
      '--',
      '.',
    ]);
    const walked = parseLog(log);
    return walked.length < CO_CHANGE_LIMITS.minHistory
      ? { available: false, reason: 'too-few', count: walked.length }
      : { available: true, commits: walked };
  } catch (error) {
    return { available: false, reason: 'unreadable', detail: failure(error) };
  }
}
