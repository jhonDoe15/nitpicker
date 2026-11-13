import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureGit, useGitFixtures } from '../../../diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../diff/git/test-support/fixture-files.mjs';
import { applyFixes } from './apply-edits.mjs';
import { createSnapshot } from './snapshot.mjs';
import { isTracked, untrackPath } from './untrack.mjs';

const { createGitRepository, temporaryRoot } = useGitFixtures();

function entry(...edits) {
  return {
    recipe: 'demo',
    fix: { finding: { tool: 'demo', rule: 'x', path: '.env', line: 1 }, edits },
  };
}

const IGNORE = { type: 'write', path: '.gitignore', text: '/.env\n' };
const UNTRACK = { type: 'untrack', path: '.env' };

function tracked(root) {
  return fixtureGit(root, ['ls-files']).split('\n').filter(Boolean);
}

describe('untrack', () => {
  it('removes a path from the index only, keeping the file and the other entries', () => {
    const { root } = createGitRepository({ '.env': 'A=1\n', 'a.txt': 'a\n', 'dir/b.txt': 'b\n' });

    untrackPath(root, 'dir');
    untrackPath(root, '.env');
    untrackPath(root, '.env');

    expect(tracked(root)).toEqual(['a.txt']);
    expect(existsSync(path.join(root, 'dir/b.txt'))).toBe(true);
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toBe('A=1\n');
    expect(isTracked(root, '.env')).toBe(false);
  });

  it('reads a name with glob characters literally', () => {
    const { root } = createGitRepository({ 'a*.txt': 'x\n', 'abc.txt': 'y\n' });

    untrackPath(root, 'a*.txt');

    expect(tracked(root)).toEqual(['abc.txt']);
  });
});

describe('applyFixes with an untrack edit', () => {
  it('writes the text edits first, then untracks, and never commits', () => {
    const { root } = createGitRepository({ '.env': 'A=1\n' });
    const snapshot = createSnapshot(root, []);
    const fix = entry(IGNORE, UNTRACK);

    const result = applyFixes(root, snapshot, [fix]);

    expect(result).toEqual({ applied: [fix], changedMeanwhile: [], errors: [] });
    expect(readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe('/.env\n');
    expect(tracked(root)).toEqual([]);
    expect(readFileSync(path.join(root, '.env'), 'utf8')).toBe('A=1\n');
    expect(fixtureGit(root, ['log', '--oneline']).trim().split('\n')).toHaveLength(1);
  });

  it('leaves the path tracked when the text edit of the same fix could not be written', () => {
    const { root } = createGitRepository({ '.env': 'A=1\n', '.gitignore': 'old\n' });
    const snapshot = createSnapshot(root, ['.gitignore']);
    writeFileSync(path.join(root, '.gitignore'), 'edited\n');
    const fix = entry(
      { type: 'replace', path: '.gitignore', start: 4, end: 4, text: '/.env\n' },
      UNTRACK,
    );

    const result = applyFixes(root, snapshot, [fix]);

    expect(result).toEqual({ applied: [], changedMeanwhile: ['.gitignore'], errors: [] });
    expect(tracked(root)).toEqual(['.env', '.gitignore']);
  });

  it('reports a failed untrack as an error and does not count the fix as applied', () => {
    const root = temporaryRoot('nitpicker-untrack-');
    writeFiles(root, { '.env': 'A=1\n' });
    const snapshot = createSnapshot(root, []);

    const result = applyFixes(root, snapshot, [entry(UNTRACK)]);

    expect(result.applied).toEqual([]);
    expect(result.errors).toEqual([expect.any(String)]);
  });

  it('undoes the text edits of a fix whose untrack failed', () => {
    const root = temporaryRoot('nitpicker-untrack-');
    writeFiles(root, { '.env': 'A=1\n', '.gitignore': 'old\n' });
    const snapshot = createSnapshot(root, ['.gitignore']);
    const fix = entry(
      { type: 'replace', path: '.gitignore', start: 0, end: 3, text: '/.env' },
      UNTRACK,
    );

    const result = applyFixes(root, snapshot, [fix]);

    expect(result.applied).toEqual([]);
    expect(result.errors).toEqual([expect.stringMatching(/^\.env: /u)]);
    expect(readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe('old\n');
  });
});
