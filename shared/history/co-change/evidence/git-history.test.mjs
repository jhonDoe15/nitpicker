import { describe, expect, it } from 'vitest';
import {
  fixtureGit,
  useGitFixtures,
} from '../../../../core/diff/git/test-support/git-repository.mjs';
import {
  commitSteps,
  edit,
  repeated,
} from '../../../../core/diff/git/test-support/history-repository.mjs';
import { parseLog, readHistory } from './git-history.mjs';

const { createGitRepository, temporaryRoot } = useGitFixtures();

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
    expect(parseLog('')).toEqual([]);
  });
});

describe('readHistory', () => {
  function repositoryOfCommits(count) {
    const { root } = createGitRepository({ 'src/a/one.ts': 'x\n' });
    commitSteps(
      root,
      repeated(count - 1, (round) => ({ files: edit(['src/a/one.ts'], round) })),
    );
    return root;
  }

  it('lists the newest commits first, capped at the requested count', () => {
    const root = repositoryOfCommits(25);
    const result = readHistory({ projectRoot: root, commits: 22 });

    expect(result.available).toBe(true);
    expect(result.commits).toHaveLength(22);
    expect(result.commits[0].sha).toBe(fixtureGit(root, ['rev-parse', 'HEAD']).trim());
  });

  it('is unavailable with too few commits, naming how many there are', () => {
    expect(readHistory({ projectRoot: repositoryOfCommits(12), commits: 300 })).toEqual({
      available: false,
      reason: 'too-few',
      count: 12,
    });
  });

  it('is unavailable in a shallow clone', () => {
    const source = repositoryOfCommits(30);
    const clone = temporaryRoot('nitpicker-shallow-clone-');
    fixtureGit(clone, ['clone', '-q', '--depth', '25', `file://${source}`, '.']);

    expect(readHistory({ projectRoot: clone, commits: 300 })).toEqual({
      available: false,
      reason: 'shallow',
    });
  });

  it('is unavailable outside a git repository', () => {
    expect(readHistory({ projectRoot: temporaryRoot('nitpicker-no-git-'), commits: 300 })).toEqual({
      available: false,
      reason: 'not-a-repository',
    });
  });
});
