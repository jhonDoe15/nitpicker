import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../diff/git/test-support/fixture-files.mjs';
import { applyFixes } from './apply-edits.mjs';
import { createSnapshot } from './snapshot.mjs';

const { temporaryRoot } = useGitFixtures();

function project(files) {
  const root = temporaryRoot('nitpicker-apply-edits-');
  writeFiles(root, files);
  return { root, snapshot: createSnapshot(root, Object.keys(files)) };
}

function entry(...edits) {
  return {
    recipe: 'demo',
    fix: { finding: { tool: 'demo', rule: 'x', path: 'a.txt', line: 1 }, edits },
  };
}

function read(root, name) {
  return readFileSync(path.join(root, name), 'utf8');
}

describe('applyFixes', () => {
  it('composes the range edits of several fixes on one file and keeps its mode', () => {
    const { root, snapshot } = project({ 'a.txt': 'one two three' });
    chmodSync(path.join(root, 'a.txt'), 0o755);
    const fixes = [
      entry({ type: 'replace', path: 'a.txt', start: 8, end: 13, text: '3' }),
      entry({ type: 'replace', path: 'a.txt', start: 0, end: 3, text: '1' }),
      entry({ type: 'replace', path: 'a.txt', start: 4, end: 4, text: '+' }),
    ];

    const result = applyFixes(root, snapshot, fixes);

    expect(read(root, 'a.txt')).toBe('1 +two 3');
    expect(statSync(path.join(root, 'a.txt')).mode & 0o777).toBe(0o755);
    expect(result).toEqual({ applied: fixes, changedMeanwhile: [] });
  });
  it('drops every fix on a file that changed after the snapshot', () => {
    const { root, snapshot } = project({ 'a.txt': 'old', 'b.txt': 'b' });
    writeFileSync(path.join(root, 'a.txt'), 'edited');
    const both = entry(
      { type: 'replace', path: 'a.txt', start: 0, end: 3, text: 'new' },
      { type: 'replace', path: 'b.txt', start: 0, end: 1, text: 'B' },
    );

    const result = applyFixes(root, snapshot, [both]);

    expect([read(root, 'a.txt'), read(root, 'b.txt')]).toEqual(['edited', 'b']);
    expect(result).toEqual({ applied: [], changedMeanwhile: ['a.txt'] });
  });
  it('does not replace a file that appeared where a fix creates or moves one', () => {
    const { root, snapshot } = project({ 'a.txt': 'a' });
    writeFiles(root, { 'new.txt': 'theirs', 'to.txt': 'theirs' });

    const result = applyFixes(root, snapshot, [
      entry({ type: 'write', path: 'new.txt', text: 'ours' }),
      entry({ type: 'move', from: 'a.txt', to: 'to.txt' }),
    ]);

    expect([read(root, 'new.txt'), read(root, 'to.txt'), read(root, 'a.txt')]).toEqual([
      'theirs',
      'theirs',
      'a',
    ]);
    expect(result).toEqual({ applied: [], changedMeanwhile: ['a.txt', 'new.txt'] });
  });
  it('moves and deletes files that still hold the snapshot bytes', () => {
    const { root, snapshot } = project({ 'a.txt': 'a', 'b.txt': 'b' });

    applyFixes(root, snapshot, [
      entry({ type: 'move', from: 'a.txt', to: 'dir/a.txt' }),
      entry({ type: 'delete', path: 'b.txt' }),
    ]);

    expect([existsSync(path.join(root, 'a.txt')), existsSync(path.join(root, 'b.txt'))]).toEqual([
      false,
      false,
    ]);
    expect(read(root, 'dir/a.txt')).toBe('a');
  });
});
