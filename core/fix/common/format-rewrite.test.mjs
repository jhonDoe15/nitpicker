import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureGit, useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { formatNotes } from './fix-notes.mjs';
import { rewriteFormatted } from './format-rewrite.mjs';

const { createGitRepository } = useGitFixtures();

function trimmer(calls = []) {
  return (sources) => {
    calls.push([...sources.keys()]);
    const formatted = new Map();
    const unformattable = [];
    for (const [name, source] of sources) {
      if (source.includes('BROKEN')) {
        unformattable.push(name);
      } else {
        formatted.set(name, source.replaceAll(/ +$/gm, ''));
      }
    }
    return { formatted, unformattable };
  };
}

function topic(files, changes) {
  const repository = createGitRepository(files, { baseRef: 'base' });
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, changes);
  return repository;
}

function run(repository, names, format) {
  return rewriteFormatted({
    projectRoot: repository.root,
    repositoryRoot: repository.root,
    mergeBaseSha: repository.baseSha,
    files: names.map((name) => ({ path: name, baseRepositoryPath: name })),
    format,
  });
}

function read(repository, name) {
  return readFileSync(path.join(repository.root, name), 'utf8');
}

describe('rewriteFormatted', () => {
  it('rewrites a new file and a file that was clean in the base', () => {
    const repository = topic(
      { 'clean.txt': 'a\n' },
      { 'clean.txt': 'a  \nb\n', 'new.txt': 'x  \n' },
    );

    const outcome = run(repository, ['clean.txt', 'new.txt'], trimmer());

    expect(outcome).toEqual({
      rewritten: ['clean.txt', 'new.txt'],
      keptAsIs: [],
      unformattable: [],
    });
    expect([read(repository, 'clean.txt'), read(repository, 'new.txt')]).toEqual(['a\nb\n', 'x\n']);
  });
  it('leaves a file alone that was already unformatted in the base', () => {
    const repository = topic({ 'legacy.txt': 'a  \n' }, { 'legacy.txt': 'a  \nb  \n' });

    const outcome = run(repository, ['legacy.txt'], trimmer());

    expect(outcome).toEqual({ rewritten: [], keptAsIs: ['legacy.txt'], unformattable: [] });
    expect(read(repository, 'legacy.txt')).toBe('a  \nb  \n');
  });
  it('leaves a file alone that the formatter would not change, without reading the base', () => {
    const repository = topic({ 'ok.txt': 'a\n' }, { 'ok.txt': 'a\nb\n' });
    const calls = [];

    const outcome = run(repository, ['ok.txt'], trimmer(calls));

    expect(outcome).toEqual({ rewritten: [], keptAsIs: [], unformattable: [] });
    expect(calls).toEqual([['ok.txt']]);
  });
  it('asks the formatter about the base only for files that would change and existed there', () => {
    const repository = topic(
      { 'clean.txt': 'a\n', 'legacy.txt': 'a  \n' },
      { 'clean.txt': 'a  \n', 'legacy.txt': 'a  \nb\n', 'new.txt': 'n  \n', 'same.txt': 's\n' },
    );
    const calls = [];

    run(repository, ['clean.txt', 'legacy.txt', 'new.txt', 'same.txt'], trimmer(calls));

    expect(calls).toEqual([
      ['clean.txt', 'legacy.txt', 'new.txt', 'same.txt'],
      ['clean.txt', 'legacy.txt'],
    ]);
  });
  it('reports files the formatter could not parse and treats a base it cannot parse as unformatted', () => {
    const repository = topic(
      { 'was-broken.txt': 'BROKEN\n' },
      { 'was-broken.txt': 'BROKEN  \nfixed  \n', 'broken.txt': 'BROKEN  \n' },
    );

    const outcome = run(repository, ['was-broken.txt', 'broken.txt'], trimmer());

    expect(outcome).toEqual({
      rewritten: [],
      keptAsIs: [],
      unformattable: ['was-broken.txt', 'broken.txt'],
    });
    expect(read(repository, 'broken.txt')).toBe('BROKEN  \n');
  });
  it('reads the base of a renamed file from its old path', () => {
    const repository = topic({ 'old.txt': 'a\n' }, {});
    fixtureGit(repository.root, ['mv', 'old.txt', 'renamed.txt']);
    writeFiles(repository.root, { 'renamed.txt': 'a  \nb\n' });

    const outcome = rewriteFormatted({
      projectRoot: repository.root,
      repositoryRoot: repository.root,
      mergeBaseSha: repository.baseSha,
      files: [{ path: 'renamed.txt', baseRepositoryPath: 'old.txt' }],
      format: trimmer(),
    });

    expect(outcome.rewritten).toEqual(['renamed.txt']);
  });
  it('writes nothing when no file is given', () => {
    const repository = topic({}, {});

    expect(run(repository, [], trimmer())).toEqual({
      rewritten: [],
      keptAsIs: [],
      unformattable: [],
    });
  });
});

describe('formatNotes', () => {
  it('names the tool for what it rewrote, left alone and could not parse', () => {
    expect(
      formatNotes('demo fmt', {
        rewritten: ['a.x', 'b.x'],
        keptAsIs: ['c.x'],
        unformattable: ['d.x'],
      }),
    ).toEqual([
      'demo fmt rewrote a.x, b.x',
      'demo fmt left c.x as is: already unformatted before your change',
      'demo fmt could not parse d.x',
    ]);
  });
  it('says nothing about an empty outcome', () => {
    expect(formatNotes('demo fmt', { rewritten: [], keptAsIs: [], unformattable: [] })).toEqual([]);
  });
});
