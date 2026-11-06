import { chmodSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureGit, useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { formatNotes, linkNote } from './fix-notes.mjs';
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

function outcomeWith(fields) {
  return {
    rewritten: [],
    partlyRewritten: [],
    keptAsIs: [],
    changedMeanwhile: [],
    unformattable: [],
    undecodable: [],
    ...fields,
  };
}

function topic(files, changes) {
  const repository = createGitRepository(files, { baseRef: 'base' });
  fixtureGit(repository.root, ['checkout', '-q', '-b', 'topic']);
  writeFiles(repository.root, changes);
  return repository;
}

function lineFeedTrimmer(sources) {
  return trimmer()(
    new Map([...sources].map(([name, source]) => [name, source.replaceAll('\r\n', '\n')])),
  );
}

function run(repository, names, format, options = {}) {
  return rewriteFormatted({
    projectRoot: repository.root,
    repositoryRoot: repository.root,
    mergeBaseSha: repository.baseSha,
    files: names.map((name) => ({ path: name, baseRepositoryPath: name })),
    format,
    ...options,
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

    expect(outcome).toEqual(outcomeWith({ rewritten: ['clean.txt', 'new.txt'] }));
    expect([read(repository, 'clean.txt'), read(repository, 'new.txt')]).toEqual(['a\nb\n', 'x\n']);
  });
  it('leaves a file alone that was already unformatted in the base', () => {
    const repository = topic({ 'legacy.txt': 'a  \n' }, { 'legacy.txt': 'a  \nb  \n' });

    const outcome = run(repository, ['legacy.txt'], trimmer());

    expect(outcome).toEqual(outcomeWith({ keptAsIs: ['legacy.txt'] }));
    expect(read(repository, 'legacy.txt')).toBe('a  \nb  \n');
  });
  it('leaves a file alone that the formatter would not change, without reading the base', () => {
    const repository = topic({ 'ok.txt': 'a\n' }, { 'ok.txt': 'a\nb\n' });
    const calls = [];

    const outcome = run(repository, ['ok.txt'], trimmer(calls));

    expect(outcome).toEqual(outcomeWith({}));
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

    expect(outcome).toEqual(outcomeWith({ unformattable: ['was-broken.txt', 'broken.txt'] }));
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

    expect(run(repository, [], trimmer())).toEqual(outcomeWith({}));
  });
  it('leaves a file that is not UTF-8 text alone without handing it to the formatter', () => {
    const repository = topic({}, { 'ok.txt': 'a  \n' });
    const latin1 = Buffer.from('caf\u00e9  \n', 'latin1');
    writeFileSync(path.join(repository.root, 'latin1.txt'), latin1);
    const calls = [];

    const outcome = run(repository, ['latin1.txt', 'ok.txt'], trimmer(calls));

    expect(outcome).toEqual(outcomeWith({ rewritten: ['ok.txt'], undecodable: ['latin1.txt'] }));
    expect(calls).toEqual([['ok.txt']]);
    expect(readFileSync(path.join(repository.root, 'latin1.txt'))).toEqual(latin1);
  });
  it('does not call the formatter when no file is UTF-8 text', () => {
    const repository = topic({}, {});
    writeFileSync(path.join(repository.root, 'latin1.txt'), Buffer.from([0xe9, 0x0a]));
    const calls = [];

    expect(run(repository, ['latin1.txt'], trimmer(calls)).undecodable).toEqual(['latin1.txt']);
    expect(calls).toEqual([]);
  });
});

describe('rewriteFormatted on lines, line endings and concurrent edits', () => {
  it('formats only the touched lines of a file that was unformatted in the base', () => {
    const repository = topic(
      { 'legacy.txt': 'a  \nb  \nc  \n' },
      { 'legacy.txt': 'a  \nB  \nc  \nd  \n' },
    );

    const outcome = run(repository, ['legacy.txt'], trimmer(), { touchedLinesOnly: true });

    expect(outcome).toEqual(outcomeWith({ partlyRewritten: ['legacy.txt'] }));
    expect(read(repository, 'legacy.txt')).toBe('a  \nB\nc  \nd\n');
  });
  it('leaves an unformatted file alone when its touched lines are already formatted', () => {
    const repository = topic({ 'legacy.txt': 'a  \nb  \n' }, { 'legacy.txt': 'a  \nb  \nc\n' });

    const outcome = run(repository, ['legacy.txt'], trimmer(), { touchedLinesOnly: true });

    expect(outcome).toEqual(outcomeWith({ keptAsIs: ['legacy.txt'] }));
    expect(read(repository, 'legacy.txt')).toBe('a  \nb  \nc\n');
  });
  it('keeps CRLF line endings when the formatter writes LF, also when checking the base', () => {
    const repository = topic(
      { 'clean.txt': 'a\r\n', 'legacy.txt': 'a  \r\n' },
      { 'clean.txt': 'a  \r\nb\r\n', 'legacy.txt': 'a  \r\nb  \r\n', 'new.txt': 'n  \r\n' },
    );

    const outcome = run(repository, ['clean.txt', 'legacy.txt', 'new.txt'], lineFeedTrimmer, {
      touchedLinesOnly: true,
    });

    expect(outcome).toEqual(
      outcomeWith({ rewritten: ['clean.txt', 'new.txt'], partlyRewritten: ['legacy.txt'] }),
    );
    expect(['clean.txt', 'legacy.txt', 'new.txt'].map((name) => read(repository, name))).toEqual([
      'a\r\nb\r\n',
      'a  \r\nb\r\n',
      'n\r\n',
    ]);
  });
  it("keeps the formatter's line endings and checks the base with its own formatter when asked", () => {
    const repository = topic({ 'old.txt': 'a\r\n' }, { 'old.txt': 'a  \r\n' });
    const baseCalls = [];

    const outcome = run(repository, ['old.txt'], lineFeedTrimmer, {
      keepLineEndings: false,
      formatBase: (sources) => {
        baseCalls.push([...sources.values()]);
        return { formatted: new Map(sources), unformattable: [] };
      },
    });

    expect(outcome).toEqual(outcomeWith({ rewritten: ['old.txt'] }));
    expect([read(repository, 'old.txt'), baseCalls]).toEqual(['a\n', [['a\r\n']]]);
  });
  it('leaves a file alone that changed while the formatter ran', () => {
    const repository = topic({}, { 'busy.txt': 'a  \n', 'calm.txt': 'c  \n' });
    function editingTrimmer(sources) {
      writeFileSync(path.join(repository.root, 'busy.txt'), 'edited  \n');
      return trimmer()(sources);
    }

    const outcome = run(repository, ['busy.txt', 'calm.txt'], editingTrimmer);

    expect(outcome).toEqual(
      outcomeWith({ rewritten: ['calm.txt'], changedMeanwhile: ['busy.txt'] }),
    );
    expect([read(repository, 'busy.txt'), read(repository, 'calm.txt')]).toEqual([
      'edited  \n',
      'c\n',
    ]);
  });
  it('replaces a file whole, keeping its mode and leaving no temporary file behind', () => {
    const repository = topic({}, { 'run.sh': 'echo  \n' });
    chmodSync(path.join(repository.root, 'run.sh'), 0o754);
    const before = readdirSync(repository.root).sort();

    run(repository, ['run.sh'], trimmer());

    expect([
      read(repository, 'run.sh'),
      statSync(path.join(repository.root, 'run.sh')).mode & 0o777,
      readdirSync(repository.root).sort(),
    ]).toEqual(['echo\n', 0o754, before]);
  });
});

describe('formatNotes', () => {
  it('names the tool for what it rewrote, left alone and could not parse', () => {
    expect(
      formatNotes('demo fmt', {
        rewritten: ['a.x', 'b.x'],
        partlyRewritten: ['p.x'],
        keptAsIs: ['c.x'],
        unformattable: ['d.x'],
        undecodable: ['e.x'],
        changedMeanwhile: ['f.x'],
      }),
    ).toEqual([
      'demo fmt rewrote a.x, b.x',
      'demo fmt formatted only the code around your change in p.x: the rest was already unformatted before your change',
      'demo fmt left c.x as is: already unformatted before your change',
      'demo fmt could not parse d.x',
      '--fix left e.x as is: not UTF-8 text',
      '--fix left f.x as is: the file changed while --fix ran',
    ]);
  });
  it('says nothing about an empty outcome', () => {
    expect(formatNotes('demo fmt', { rewritten: [], keptAsIs: [], unformattable: [] })).toEqual([]);
  });
  it('names the symbolic links it did not follow', () => {
    expect([linkNote([]), linkNote(['a.py', 'b.py'])]).toEqual([
      [],
      ['--fix left a.py, b.py as is: symbolic links are not followed'],
    ]);
  });
});
