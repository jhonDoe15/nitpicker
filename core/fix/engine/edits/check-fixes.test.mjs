import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../diff/git/test-support/fixture-files.mjs';
import { acceptFixes, checkFix, fixOrder } from './check-fixes.mjs';
import { createSnapshot } from './snapshot.mjs';

const { temporaryRoot } = useGitFixtures();

const RULE = { tool: 'demo', rule: 'shout' };
const RECIPE = { id: 'demo', rules: [RULE], scope: 'file' };

function fixOf(edits, path = 'a.txt') {
  return { finding: { ...RULE, path, line: 1 }, edits };
}

function settingsFor(files, extra = {}) {
  const projectRoot = temporaryRoot('nitpicker-check-fixes-');
  writeFiles(projectRoot, files);
  return {
    projectRoot,
    snapshot: createSnapshot(projectRoot, Object.keys(files)),
    accepts: () => true,
    changed: new Set(Object.keys(files)),
    ...extra,
  };
}

function replace(start, end, path = 'a.txt') {
  return { type: 'replace', path, start, end, text: 'x' };
}

describe('checkFix', () => {
  const files = { 'a.txt': 'abcdef', 'b.txt': 'b' };

  it.each([
    [
      'a finding of another rule',
      { finding: { tool: 'demo', rule: 'other', path: 'a.txt', line: 1 }, edits: [replace(0, 1)] },
      'outside the rules of recipe demo',
    ],
    ['no edits', fixOf([]), 'has no edits'],
    ['a reversed range', fixOf([replace(3, 2)]), 'is not a range'],
    ['a range past the end', fixOf([replace(2, 9)]), 'past the end of a.txt'],
    ['an unknown edit', fixOf([{ type: 'chmod', path: 'a.txt' }]), 'unknown edit type chmod'],
    [
      'a move onto a file',
      fixOf([{ type: 'move', from: 'a.txt', to: 'b.txt' }]),
      'would replace b.txt',
    ],
    ['a path outside the project', fixOf([{ type: 'delete', path: '../a.txt' }]), 'is outside'],
    ['overlapping edits', fixOf([replace(0, 3), replace(2, 4)]), 'overlap'],
    ['two inserts at one offset', fixOf([replace(2, 2), replace(2, 2)]), 'overlap'],
    [
      'a range edit on a file it also writes',
      fixOf([replace(0, 1), { type: 'write', path: 'a.txt', text: '' }]),
      'overlap',
    ],
  ])('refuses %s', (_, fix, message) => {
    expect(() => checkFix(fix, RECIPE, settingsFor(files))).toThrow(message);
  });
  it('refuses a write over a file the plan did not read', () => {
    const unread = settingsFor({ 'a.txt': 'a', 'c.txt': 'c' });
    const snapshot = createSnapshot(unread.projectRoot, ['a.txt']);

    expect(() =>
      checkFix(
        fixOf([{ type: 'write', path: 'c.txt', text: '' }]),
        { ...RECIPE, scope: 'project' },
        { ...unread, snapshot },
      ),
    ).toThrow('replaces a file the plan did not read');
  });
  it('accepts adjacent ranges and a new file from a project recipe', () => {
    const settings = settingsFor(files);
    expect(() => checkFix(fixOf([replace(0, 2), replace(2, 4)]), RECIPE, settings)).not.toThrow();
    expect(() =>
      checkFix(
        fixOf([{ type: 'write', path: 'new/c.txt', text: 'c' }]),
        { ...RECIPE, scope: 'project' },
        settings,
      ),
    ).not.toThrow();
  });
});

describe('acceptFixes', () => {
  function entries(...fixes) {
    return fixes.map((fix, index) => ({ recipe: `r${index}`, fix }));
  }

  it('keeps the first of two fixes that overlap and skips the later one', () => {
    const planned = entries(fixOf([replace(0, 3)]), fixOf([replace(2, 4)]), fixOf([replace(3, 5)]));

    const { accepted, skipped } = acceptFixes(planned);

    expect(accepted.map(({ recipe }) => recipe)).toEqual(['r0', 'r2']);
    expect(skipped.map(({ recipe }) => recipe)).toEqual(['r1']);
  });
  it('skips any fix on a file another fix writes whole, moves or deletes', () => {
    const planned = entries(
      fixOf([{ type: 'move', from: 'a.txt', to: 'c.txt' }]),
      fixOf([replace(0, 1)]),
      fixOf([{ type: 'write', path: 'c.txt', text: '' }], 'c.txt'),
      fixOf([replace(0, 1, 'b.txt')], 'b.txt'),
    );

    expect(acceptFixes(planned).accepted.map(({ recipe }) => recipe)).toEqual(['r0', 'r3']);
  });
});

describe('fixOrder', () => {
  it('orders fixes by path, then first offset, then line', () => {
    const fixes = [fixOf([replace(4, 5)], 'b.txt'), fixOf([replace(4, 5)]), fixOf([replace(1, 2)])];

    expect([...fixes].sort(fixOrder)).toEqual([fixes[2], fixes[1], fixes[0]]);
  });
});
