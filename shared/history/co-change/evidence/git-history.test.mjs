import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fixtureGit } from '../../../../core/diff/git/test-support/git-repository.mjs';
import {
  edit,
  repeated,
  useHistoryRepositories,
} from '../../../../core/diff/git/test-support/history-repository.mjs';
import { cloneDepth, parseLog, readHistory } from './git-history.mjs';

const { historyRepository, temporaryRoot } = useHistoryRepositories();

function shasOf(root, range) {
  return fixtureGit(root, ['rev-list', range]).trim().split('\n');
}

describe('parseLog', () => {
  it('reads commits, statuses and the two paths of a rename', () => {
    const output = [
      '\u0001aaa',
      '\nM',
      'src/a.ts',
      'R087',
      'src/old.ts',
      'src/new.ts',
      '\u0001bbb',
      '\nA',
      'src/b.ts',
      'R100',
      'x/one.ts',
      'x/two.ts',
      '',
    ].join('\0');

    expect(parseLog(output)).toEqual([
      {
        sha: 'aaa',
        entries: [
          { kind: 'M', exact: false, path: 'src/a.ts' },
          { kind: 'R', exact: false, from: 'src/old.ts', path: 'src/new.ts' },
        ],
      },
      {
        sha: 'bbb',
        entries: [
          { kind: 'A', exact: false, path: 'src/b.ts' },
          { kind: 'R', exact: true, from: 'x/one.ts', path: 'x/two.ts' },
        ],
      },
    ]);
  });

  it('reads an empty log as no commits', () => {
    expect(parseLog('')).toEqual([]);
  });
});

const repositories = {};

beforeAll(() => {
  const steps = (count) => repeated(count, (round) => ({ files: edit(['src/a/one.ts'], round) }));
  repositories.long = historyRepository({ files: { 'src/a/one.ts': 'x\n' }, steps: steps(24) });
  repositories.short = historyRepository({ files: { 'src/a/one.ts': 'x\n' }, steps: steps(11) });
  repositories.shallow = temporaryRoot('nitpicker-shallow-clone-');
  fixtureGit(repositories.shallow, [
    'clone',
    '-q',
    '--depth',
    '20',
    `file://${repositories.long}`,
    '.',
  ]);
  repositories.empty = temporaryRoot('nitpicker-empty-repository-');
  fixtureGit(repositories.empty, ['init', '-q']);
});

describe('readHistory', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lists the newest commits first, capped at the requested count', () => {
    const root = repositories.long;

    expect(readHistory({ projectRoot: root, commits: 22 }).commits.map(({ sha }) => sha)).toEqual(
      shasOf(root, 'HEAD').slice(0, 22),
    );
  });

  it('reads the window that ends at the given ref, whatever HEAD is', () => {
    const root = repositories.long;

    expect(
      readHistory({ projectRoot: root, commits: 20, ref: 'HEAD~3' }).commits.map(({ sha }) => sha),
    ).toEqual(shasOf(root, 'HEAD~3').slice(0, 20));
  });

  it('is unavailable with too few commits, naming how many there are', () => {
    expect(readHistory({ projectRoot: repositories.short, commits: 300 })).toEqual({
      available: false,
      reason: 'too-few',
      count: 12,
    });
  });

  it('counts an empty repository as too few commits', () => {
    expect(readHistory({ projectRoot: repositories.empty, commits: 300 })).toEqual({
      available: false,
      reason: 'too-few',
      count: 0,
    });
  });

  it('is unavailable in a shallow clone', () => {
    expect(readHistory({ projectRoot: repositories.shallow, commits: 300 })).toEqual({
      available: false,
      reason: 'shallow',
    });
  });

  it('is unavailable outside a git repository', () => {
    const root = temporaryRoot('nitpicker-no-git-');

    expect(readHistory({ projectRoot: root, commits: 300 })).toEqual({
      available: false,
      reason: 'not-a-repository',
    });
  });

  it('names a missing git binary as its own reason', () => {
    vi.stubEnv('PATH', temporaryRoot('nitpicker-no-binaries-'));

    expect(readHistory({ projectRoot: repositories.long, commits: 300 })).toEqual({
      available: false,
      reason: 'git-missing',
    });
  });

  it("reports git's own error, not the command line, when the log cannot be read", () => {
    expect(
      readHistory({ projectRoot: repositories.long, commits: 300, ref: 'no-such-ref' }),
    ).toEqual({
      available: false,
      reason: 'unreadable',
      detail: expect.stringMatching(/^fatal: .*no-such-ref/u),
    });
  });
});

describe('cloneDepth', () => {
  it.each([
    ['a full clone', 'long', 'full'],
    ['a shallow clone', 'shallow', 'shallow'],
  ])('names %s', (_, name, depth) => {
    expect(cloneDepth(repositories[name])).toBe(depth);
  });

  it('names why it cannot tell outside a git repository', () => {
    expect(cloneDepth(temporaryRoot('nitpicker-no-git-depth-'))).toBe('not-a-repository');
  });
});
