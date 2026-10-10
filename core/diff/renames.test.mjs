import { describe, expect, it } from 'vitest';
import { compareFindings } from './compare.mjs';
import {
  directoryMoves,
  inferMovedFiles,
  mapDirectory,
  remapRootPrefix,
  scopeMoves,
} from './renames.mjs';

const LIFTED_PACKAGE = [
  ['typescript/core/cli.mjs', 'core/cli.mjs'],
  ['typescript/core/diff/git.mjs', 'core/diff/git.mjs'],
  ['typescript/package.json', 'package.json'],
  ['typescript/adapters/java/runner.mjs', 'languages/java/adapters/runner.mjs'],
];

describe('directory moves', () => {
  it('derives the moved prefix and every ancestor pair from renamed files', () => {
    const moves = directoryMoves(LIFTED_PACKAGE);

    expect(moves.get('typescript')).toBe('');
    expect(moves.get('typescript/core')).toBe('core');
    expect(moves.get('typescript/core/diff')).toBe('core/diff');
    expect(moves.get('typescript/adapters/java')).toBe('languages/java/adapters');
  });

  it('lets the most common destination win', () => {
    const moves = directoryMoves([
      ['a/one.mjs', 'x/one.mjs'],
      ['a/two.mjs', 'x/two.mjs'],
      ['a/three.mjs', 'y/three.mjs'],
    ]);

    expect(moves.get('a')).toBe('x');
  });

  it('ignores files renamed inside their directory', () => {
    expect(directoryMoves([['a/old.mjs', 'a/new.mjs']]).size).toBe(0);
  });

  it('maps a directory through its longest moved ancestor', () => {
    const moves = directoryMoves(LIFTED_PACKAGE);

    expect(mapDirectory('typescript/core/diff/deeper', moves)).toBe('core/diff/deeper');
    expect(mapDirectory('typescript/unseen', moves)).toBe('unseen');
    expect(mapDirectory('elsewhere', new Map([['other', 'moved']]))).toBe('elsewhere');
  });
});

describe('inferred moves', () => {
  const moves = directoryMoves(LIFTED_PACKAGE);

  it('pairs a deleted file with the added file in the directory that moved', () => {
    const inferred = inferMovedFiles({
      deleted: new Set(['typescript/core/diff/rewritten.mjs', 'typescript/core/gone.mjs']),
      added: new Set(['core/diff/rewritten.mjs', 'core/unrelated.mjs']),
      moves,
    });

    expect([...inferred]).toEqual([
      ['typescript/core/diff/rewritten.mjs', 'core/diff/rewritten.mjs'],
    ]);
  });

  it('never pairs a file with a destination that was not added', () => {
    expect(
      inferMovedFiles({ deleted: new Set(['typescript/core/x.mjs']), added: new Set(), moves })
        .size,
    ).toBe(0);
  });
});

describe('moves scoped to a project', () => {
  const changes = {
    renames: LIFTED_PACKAGE,
    deleted: new Set(['typescript/core/diff/rewritten.mjs', 'docs/old.md']),
    added: new Set(['core/diff/rewritten.mjs']),
  };

  it('lifts a package root to the repository root', () => {
    const moves = scopeMoves({ changes, baseProjectPath: 'typescript', headProjectPath: '' });

    expect(moves.files.get('core/cli.mjs')).toBe('core/cli.mjs');
    expect(moves.files.get('adapters/java/runner.mjs')).toBe('languages/java/adapters/runner.mjs');
    expect(moves.files.get('core/diff/rewritten.mjs')).toBe('core/diff/rewritten.mjs');
    expect([...moves.inferred.keys()]).toEqual(['core/diff/rewritten.mjs']);
    expect(moves.directories.get('adapters/java')).toBe('languages/java/adapters');
  });

  it('drops renames that leave or enter the project', () => {
    const moves = scopeMoves({
      changes: {
        renames: [['docs/a.md', 'typescript/a.md']],
        deleted: new Set(),
        added: new Set(),
      },
      baseProjectPath: 'typescript',
      headProjectPath: 'typescript',
    });

    expect(moves.files.size).toBe(0);
  });
});

describe('source-root prefixes of aggregate identities', () => {
  const directories = new Map([['typescript/core', 'core']]);

  it('remaps the leading root of an identity', () => {
    expect(remapRootPrefix('typescript/core|function:p95', directories)).toBe('core|function:p95');
  });

  it('leaves identities without a moved root alone', () => {
    expect(remapRootPrefix('function:p95', directories)).toBe('function:p95');
    expect(remapRootPrefix('source:abc|count:1', directories)).toBe('source:abc|count:1');
  });
});

describe('comparing findings across a folder move', () => {
  const finding = (path, identity, overrides = {}) => ({
    tool: 'structure',
    rule: 'function-structure',
    path,
    identity,
    message: 'm',
    classification: 'descriptive',
    metric: { name: 'lines', value: 1 },
    ...overrides,
  });

  it('matches aggregate findings whose identity embeds a moved source root', () => {
    const base = [finding('.', 'typescript/core|distribution:p95')];
    const head = [finding('.', 'core|distribution:p95')];

    const result = compareFindings({
      baseFindings: base,
      headFindings: head,
      baseToHeadDirectories: new Map([['typescript/core', 'core']]),
    });

    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
  });
});
