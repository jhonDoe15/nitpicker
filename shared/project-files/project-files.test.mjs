import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixtureGit } from '../../core/diff/git/test-support/git-repository.mjs';
import { projectFilePaths, projectFilesUnder } from './project-files.mjs';
import {
  relativeTo,
  useProjectFixtures,
} from '../../core/diff/git/test-support/projects/project-fixtures.mjs';

const { gitProject, outsideGit } = useProjectFixtures();

const SOURCES = { 'src/a.mjs': '', 'src/deep/b.mjs': '', 'README.md': '' };

function nestedClone(root, name) {
  const clone = path.join(root, name);
  mkdirSync(clone);
  fixtureGit(clone, ['init', '-q']);
  writeFileSync(path.join(clone, 'e.mjs'), '');
}

describe('projectFilePaths in a Git checkout', () => {
  it('lists tracked and untracked files except ignored ones, nested checkouts and gitlinks', () => {
    const root = gitProject(
      {
        ...SOURCES,
        '.scratch/tsconfig.json': '{}',
        'worktree/.git': 'gitdir: /nonexistent\n',
        'worktree/src/c.mjs': '',
        'worktree/src/deep/d.mjs': '',
      },
      { ignored: ['.scratch/'], tracked: ['src/a.mjs'] },
    );
    nestedClone(root, 'clone');

    expect(projectFilePaths(root)).toEqual(['README.md', 'src/a.mjs', 'src/deep/b.mjs']);
  });

  it('trusts an empty listing when every file of the repository is ignored', () => {
    const root = gitProject({ 'a.log': '', 'sub/b.log': '' }, { ignored: ['*.log'] });

    expect(projectFilePaths(root)).toEqual([]);
    expect(projectFilePaths(path.join(root, 'sub'))).toEqual([]);
  });

  it('trusts the listing of a root whose files are ignored but whose folder is not', () => {
    const root = gitProject(
      { ...SOURCES, 'src/gen/x.generated': '' },
      { ignored: ['*.generated'] },
    );

    expect(relativeTo(root, projectFilesUnder(path.join(root, 'src/gen')))).toEqual([]);
  });

  it('keeps the ignored files of a source root when they are asked for', () => {
    const root = gitProject(
      { '.gitignore': 'src/\n', 'src/ignored.ts': '' },
      { tracked: ['.gitignore'] },
    );

    expect(projectFilePaths(path.join(root, 'src'), { includeIgnored: true })).toEqual([
      'ignored.ts',
    ]);
  });

  it('trusts an empty listing for a source root that the repository ignores', () => {
    const root = gitProject(
      { '.gitignore': 'src/\n', 'package.json': '{}', 'src/ignored.ts': '' },
      { tracked: ['.gitignore', 'package.json'] },
    );
    nestedClone(root, 'src/clone');

    expect(projectFilePaths(root)).toEqual(['.gitignore', 'package.json']);
    expect(projectFilesUnder(path.join(root, 'src'))).toEqual([]);
  });

  it('trusts the listing of an ignored root that holds one force-added file', () => {
    const root = gitProject(
      { ...SOURCES, 'scratch/x.mjs': '', 'scratch/forced.mjs': '' },
      { ignored: ['scratch/'], tracked: ['scratch/forced.mjs'] },
    );

    expect(projectFilePaths(path.join(root, 'scratch'))).toEqual(['forced.mjs']);
    expect(projectFilePaths(root)).toEqual([
      'README.md',
      'scratch/forced.mjs',
      'src/a.mjs',
      'src/deep/b.mjs',
    ]);
  });

  it('drops tracked files that are missing and keeps the requested folder rules', () => {
    const root = gitProject(
      { ...SOURCES, 'src/deep/skip/e.mjs': '' },
      { tracked: ['src/a.mjs', 'src/deep/skip/e.mjs'] },
    );
    rmSync(path.join(root, 'src', 'a.mjs'));

    const options = { skipDirectory: (_, entry) => entry.name === 'skip' };

    expect(projectFilePaths(root, options)).toEqual(['README.md', 'src/deep/b.mjs']);
    expect(relativeTo(root, projectFilesUnder(path.join(root, 'src'), options))).toEqual([
      'src/deep/b.mjs',
    ]);
  });

  it('keeps symbolic links out unless they are asked for', () => {
    const root = gitProject(SOURCES);
    symlinkSync(path.join(root, 'README.md'), path.join(root, 'link.md'));

    expect(projectFilePaths(root)).toEqual(['README.md', 'src/a.mjs', 'src/deep/b.mjs']);
    expect(projectFilePaths(root, { includeLinks: true })).toEqual([
      'README.md',
      'link.md',
      'src/a.mjs',
      'src/deep/b.mjs',
    ]);
  });

  it('lists an empty list for a folder that does not exist or is a file', () => {
    const root = gitProject(SOURCES);

    expect(projectFilePaths(path.join(root, 'missing'))).toEqual([]);
    expect(projectFilePaths(path.join(root, 'README.md'))).toEqual([]);
  });
});

describe('projectFilePaths with ignored files kept', () => {
  it('still skips nested checkouts, the requested folders and the Git folder', () => {
    const root = gitProject(
      { ...SOURCES, 'src/generated/g.mjs': '', 'node_modules/pkg/i.mjs': '' },
      { ignored: ['src/generated/', 'node_modules/'] },
    );
    nestedClone(root, 'clone');

    expect(
      projectFilePaths(root, {
        includeIgnored: true,
        skipDirectory: (_, entry) => entry.name === 'node_modules',
      }),
    ).toEqual(['README.md', 'src/a.mjs', 'src/deep/b.mjs', 'src/generated/g.mjs']);
  });
});

describe('projectFilePaths outside Git', () => {
  it('walks the tree, skipping nested repositories and the requested folders', () => {
    const root = outsideGit({
      ...SOURCES,
      'agent/.git/HEAD': '',
      'agent/src/c.mjs': '',
      'linked/.git': 'gitdir: /nonexistent\n',
      'linked/src/d.mjs': '',
      'node_modules/pkg/index.mjs': '',
    });

    expect(
      relativeTo(
        root,
        projectFilesUnder(root, { skipDirectory: (_, entry) => entry.name === 'node_modules' }),
      ),
    ).toEqual(['README.md', 'src/a.mjs', 'src/deep/b.mjs']);
  });

  it('answers an empty list for a folder that does not exist', () => {
    const root = outsideGit(SOURCES);

    expect(projectFilesUnder(path.join(root, 'missing'))).toEqual([]);
  });

  it('keeps the files of a folder that a broken checkout marker covers', () => {
    const root = outsideGit({ ...SOURCES, '.git': 'gitdir: /nonexistent\n' });

    expect(projectFilePaths(root)).toEqual(['README.md', 'src/a.mjs', 'src/deep/b.mjs']);
  });
});
