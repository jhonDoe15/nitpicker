import { describe, expect, it } from 'vitest';
import { countFindings, judgeFindings, recipeRuns, withSharedFiles } from './judge-findings.mts';

function finding(tool: string, rule: string, path: string) {
  return { tool, rule, path, classification: 'enforceable' };
}

function run(id: string, files: readonly string[], findings: ReturnType<typeof finding>[]) {
  return { key: id, id, files: new Set(files), findings };
}

const never = () => false;

describe('countFindings', () => {
  it('counts enforceable findings per tool, rule and path', () => {
    const counts = countFindings([
      finding('a', 'r', 'x'),
      finding('a', 'r', 'x'),
      { ...finding('a', 'r', 'x'), classification: 'descriptive' },
    ]);
    expect([...counts.values()].map(({ count }) => count)).toEqual([2]);
  });
});

describe('recipeRuns', () => {
  it('groups recipe events by recipe and ignores tool events', () => {
    const runs = recipeRuns([
      { recipe: 'one', files: ['a'], finding: finding('t', 'r', 'a') },
      { recipe: 'one', files: ['b'], finding: finding('t', 'r', 'b') },
      { files: ['a'] },
    ]);
    expect(runs.map(({ id, files }) => [id, [...files]])).toEqual([['one', ['a', 'b']]]);
  });

  it('keeps one run per file for a recipe that edits one file at a time', () => {
    const runs = recipeRuns([
      { recipe: 'one', scope: 'file', files: ['a'], finding: finding('t', 'r', 'a') },
      { recipe: 'one', scope: 'file', files: ['b'], finding: finding('t', 'r', 'b') },
      { recipe: 'one', scope: 'file', files: ['a'], finding: finding('t', 's', 'a') },
    ]);
    expect(runs.map(({ id, files }) => [id, [...files]])).toEqual([
      ['one', ['a']],
      ['one', ['b']],
    ]);
  });

  it('keeps a fix that edits two files of a file-scoped recipe apart from its one-file fixes', () => {
    const runs = recipeRuns([
      { recipe: 'one', scope: 'file', files: ['b', 'a'], finding: finding('t', 'r', 'a') },
      { recipe: 'one', scope: 'file', files: ['c'], finding: finding('t', 'r', 'c') },
      { recipe: 'one', scope: 'file', files: ['a', 'b'], finding: finding('t', 's', 'b') },
    ]);
    expect(runs.map(({ files }) => [...files])).toEqual([['b', 'a'], ['c']]);
  });

  it('rolls back only the file whose fix broke the compile', () => {
    const runs = recipeRuns([
      { recipe: 'one', scope: 'file', files: ['a'], finding: finding('t', 'r', 'a') },
      { recipe: 'one', scope: 'file', files: ['b'], finding: finding('t', 'r', 'b') },
    ]);
    const before = countFindings([finding('t', 'r', 'a'), finding('t', 'r', 'b')]);
    const after = countFindings([finding('build', 'compile-error', 'b')]);
    const reasons = judgeFindings({ runs, before, after, breaking: () => true });
    const blamed = runs.filter(({ key }) => reasons.has(key));
    expect(blamed.map(({ files }) => [...files])).toEqual([['b']]);
  });
});

describe('recipeRuns and the findings of one fix', () => {
  it('counts the other findings of a fix as findings of the run', () => {
    const runs = recipeRuns([
      {
        recipe: 'one',
        files: ['a'],
        finding: finding('t', 'r', 'a'),
        alsoFindings: [finding('t', 'r', 'a')],
      },
    ]);
    expect(runs.map(({ findings }) => findings.length)).toEqual([2]);
  });

  it('flags a fix of two findings when only one of them is gone', () => {
    const run = recipeRuns([
      {
        recipe: 'one',
        files: ['a'],
        finding: finding('t', 'r', 'a'),
        alsoFindings: [finding('t', 'r', 'a')],
      },
    ]);
    const before = countFindings([finding('t', 'r', 'a'), finding('t', 'r', 'a')]);
    const after = countFindings([finding('t', 'r', 'a')]);
    const reasons = judgeFindings({ runs: run, before, after, breaking: never });
    expect(reasons.get('one')).toEqual(['t/r is still reported in a']);
  });
});

describe('judgeFindings', () => {
  const fixed = run('fix', ['a'], [finding('t', 'r', 'a')]);

  it('accepts a recipe whose finding is gone and that adds nothing', () => {
    const before = countFindings([finding('t', 'r', 'a')]);
    expect(
      judgeFindings({ runs: [fixed], before, after: countFindings([]), breaking: never }).size,
    ).toBe(0);
  });

  it('flags a recipe that leaves its finding in place', () => {
    const before = countFindings([finding('t', 'r', 'a')]);
    const reasons = judgeFindings({ runs: [fixed], before, after: before, breaking: never });
    expect(reasons.get('fix')).toEqual(['t/r is still reported in a']);
  });

  it('flags a recipe that adds a finding in a file it touched', () => {
    const before = countFindings([finding('t', 'r', 'a')]);
    const after = countFindings([finding('t', 'other', 'a')]);
    const reasons = judgeFindings({ runs: [fixed], before, after, breaking: never });
    expect(reasons.get('fix')).toEqual(['adds t/other in a']);
  });

  it('flags a compile error and names the compile check', () => {
    const before = countFindings([finding('t', 'r', 'a')]);
    const after = countFindings([finding('build', 'compile-error', 'a')]);
    const reasons = judgeFindings({ runs: [fixed], before, after, breaking: never });
    expect(reasons.get('fix')).toEqual([
      'breaks the compile or type check: new build/compile-error in a',
    ]);
  });

  it('blames every recipe for a new build error in a file none of them touched', () => {
    const runs = [fixed, run('other', ['b'], [])];
    const before = countFindings([finding('t', 'r', 'a')]);
    const after = countFindings([finding('build', 'compile-error', 'z')]);
    const reasons = judgeFindings({
      runs,
      before,
      after,
      breaking: (tool: string) => tool === 'build',
    });
    expect([...reasons.keys()]).toEqual(['fix', 'other']);
  });

  it('ignores a new ordinary finding in a file no recipe touched', () => {
    const before = countFindings([finding('t', 'r', 'a')]);
    const after = countFindings([finding('t', 'other', 'z')]);
    expect(judgeFindings({ runs: [fixed], before, after, breaking: never }).size).toBe(0);
  });

  it('does not judge a finding the analyzer never reported before the fix', () => {
    const reasons = judgeFindings({
      runs: [fixed],
      before: countFindings([]),
      after: countFindings([]),
      breaking: never,
    });
    expect(reasons.size).toBe(0);
  });
});

describe('withSharedFiles', () => {
  it('rolls back the recipes that share a file with a rolled back recipe', () => {
    const runs = [run('bad', ['a', 'b'], []), run('mate', ['b'], []), run('apart', ['c'], [])];
    const rolled = withSharedFiles(runs, new Map([['bad', ['broke']]]));
    expect([...rolled.keys()]).toEqual(['bad', 'mate']);
    expect(rolled.get('mate')).toEqual(['shares a file with bad, which was rolled back']);
  });
});
