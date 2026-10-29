import { readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureGit, useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import {
  collectFixFiles,
  excludedBy,
  readBytes,
  rewrittenBy,
  rewrittenPaths,
  splitByEncoding,
} from './fix-files.mjs';
import { toolPrecedenceOf } from './tool-precedence.mjs';

const { createGitRepository } = useGitFixtures();

describe('excludedBy', () => {
  it('matches a path against any exclude glob', () => {
    const excluded = excludedBy(['build/**', '**/generated/**']);

    expect([
      excluded('build/out.py'),
      excluded('src/generated/api.py'),
      excluded('src/api.py'),
    ]).toEqual([true, true, false]);
  });
  it('excludes nothing without globs', () => {
    expect([excludedBy()('a.py'), excludedBy([])('a.py')]).toEqual([false, false]);
  });
});

describe('collectFixFiles', () => {
  it('lists the changed files from the merge base that exist and are accepted', () => {
    const repository = createGitRepository(
      { 'keep.txt': 'k\n', 'gone.txt': 'g\n', 'a.py': 'a\n' },
      { baseRef: 'base' },
    );
    fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
    rmSync(path.join(repository.root, 'gone.txt'));
    writeFiles(repository.root, { 'a.py': 'a2\n', 'new/b.py': 'b\n', 'skip.md': 's\n' });

    const { files, comparison } = collectFixFiles({
      repositoryRoot: repository.root,
      projectRoot: repository.root,
      baseRef: 'base',
      accepts: (name) => name.endsWith('.py'),
    });

    expect(files.map(({ path: name }) => name)).toEqual(['a.py', 'new/b.py']);
    expect(comparison.mergeBaseSha).toBe(repository.baseSha);
  });
  it('names the accepted changed paths that are symbolic links instead of following them', () => {
    const repository = createGitRepository({ 'a.py': 'a\n' }, { baseRef: 'base' });
    fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
    symlinkSync('a.py', path.join(repository.root, 'inside.py'));
    symlinkSync(path.resolve('/'), path.join(repository.root, 'outside.py'));
    symlinkSync('a.py', path.join(repository.root, 'notes.md'));

    const { files, links } = collectFixFiles({
      repositoryRoot: repository.root,
      projectRoot: repository.root,
      baseRef: 'base',
      accepts: (name) => name.endsWith('.py'),
    });

    expect([files, links]).toEqual([[], ['inside.py', 'outside.py']]);
  });
});

describe('rewritten paths', () => {
  it('reports only the files whose bytes changed', () => {
    const repository = createGitRepository({ 'a.txt': 'a\n', 'b.txt': 'b\n' });
    const files = [{ path: 'a.txt' }, { path: 'b.txt' }];
    const before = readBytes(repository.root, files);
    writeFileSync(path.join(repository.root, 'b.txt'), 'changed\n');

    expect(rewrittenPaths(repository.root, files, before)).toEqual(['b.txt']);
  });
  it('observes what an action rewrites', () => {
    const repository = createGitRepository({ 'a.txt': 'a\n', 'b.txt': 'b\n' });

    const rewritten = rewrittenBy(repository.root, [{ path: 'a.txt' }, { path: 'b.txt' }], () => {
      writeFileSync(path.join(repository.root, 'a.txt'), 'a2\n');
      writeFileSync(path.join(repository.root, 'b.txt'), 'b\n');
    });

    expect([rewritten, readFileSync(path.join(repository.root, 'a.txt'), 'utf8')]).toEqual([
      ['a.txt'],
      'a2\n',
    ]);
  });
});

describe('toolPrecedenceOf', () => {
  it('maps each configured tool to its precedence layers', () => {
    expect(
      toolPrecedenceOf({ ruff: { precedence: ['project'] }, black: { precedence: ['nitpicker'] } }),
    ).toEqual({ ruff: ['project'], black: ['nitpicker'] });
    expect(toolPrecedenceOf()).toEqual({});
  });
});

describe('splitByEncoding', () => {
  it('keeps the UTF-8 files and names the others', () => {
    const repository = createGitRepository({ 'a.py': 'caf\u00e9 = 1\n' });
    writeFileSync(path.join(repository.root, 'b.py'), Buffer.from([0x63, 0xe9, 0x0a]));
    const files = [{ path: 'a.py' }, { path: 'b.py' }];

    expect(splitByEncoding(repository.root, files)).toEqual({
      files: [{ path: 'a.py' }],
      undecodable: ['b.py'],
    });
  });
});
