import { describe, expect, it } from 'vitest';
import { countFindings, judgeFindings, recipeRuns, withSharedFiles } from './judge-findings.mjs';

function finding(tool, rule, path) {
  return { tool, rule, path, classification: 'enforceable' };
}

function run(id, files, findings) {
  return { id, files: new Set(files), findings };
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
      { tool: 'prettier', files: ['a'] },
    ]);
    expect(runs.map(({ id, files }) => [id, [...files]])).toEqual([['one', ['a', 'b']]]);
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
    const reasons = judgeFindings({ runs, before, after, breaking: (tool) => tool === 'build' });
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
