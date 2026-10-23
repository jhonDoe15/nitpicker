import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fixtureGit } from '../../core/diff/git/test-support/git-repository.mjs';
import { gitProjectFiles, projectFilesUnder } from './project-files.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function write(root, files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
}

function plainProject(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-files-'));
  temporaryRoots.push(root);
  write(root, files);
  return root;
}

function gitProject(files, { ignored = [], tracked = [] } = {}) {
  const root = plainProject({});
  fixtureGit(root, ['init', '-q']);
  write(root, files);
  writeFileSync(path.join(root, '.git', 'info', 'exclude'), `${ignored.join('\n')}\n`);
  if (tracked.length > 0) {
    fixtureGit(root, ['add', ...tracked]);
  }
  return root;
}

function relativeTo(root, files) {
  return files.map((file) => path.relative(root, file).split(path.sep).join('/')).toSorted();
}

const SOURCES = { 'src/a.mjs': '', 'src/deep/b.mjs': '', 'README.md': '' };

describe('gitProjectFiles', () => {
  it('lists tracked and untracked files except ignored ones and nested repositories', () => {
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
    const clone = path.join(root, 'clone');
    mkdirSync(clone);
    fixtureGit(clone, ['init', '-q']);
    writeFileSync(path.join(clone, 'e.mjs'), '');

    expect(gitProjectFiles(root)).toEqual(['README.md', 'src/a.mjs', 'src/deep/b.mjs']);
    expect(gitProjectFiles(root, ['*.md'])).toEqual(['README.md']);
  });

  it('answers nothing outside a Git checkout', () => {
    expect(gitProjectFiles(plainProject(SOURCES))).toBeUndefined();
    expect(gitProjectFiles(path.join(tmpdir(), 'nitpicker-missing-project'))).toBeUndefined();
  });
});

describe('projectFilesUnder', () => {
  it('walks a project outside Git, skipping nested repositories and the requested folders', () => {
    const root = plainProject({
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

  it('uses the Git file set inside a checkout and still honours the requested folders', () => {
    const root = gitProject(
      {
        ...SOURCES,
        'dist/out.mjs': '',
        'agent/.git': 'gitdir: /nonexistent\n',
        'agent/src/c.mjs': '',
        'src/deep/skip/e.mjs': '',
      },
      { ignored: ['dist/'], tracked: ['src/a.mjs'] },
    );
    rmSync(path.join(root, 'src', 'a.mjs'));
    symlinkSync(path.join(root, 'README.md'), path.join(root, 'link.md'));

    expect(
      relativeTo(
        root,
        projectFilesUnder(root, { skipDirectory: (_, entry) => entry.name === 'skip' }),
      ),
    ).toEqual(['README.md', 'src/deep/b.mjs']);
    expect(relativeTo(root, projectFilesUnder(path.join(root, 'src')))).toEqual([
      'src/deep/b.mjs',
      'src/deep/skip/e.mjs',
    ]);
  });

  it('walks an ignored directory that lies inside a Git checkout', () => {
    const root = gitProject({ ...SOURCES, 'scratch/x.mjs': '' }, { ignored: ['scratch/'] });

    expect(relativeTo(root, projectFilesUnder(path.join(root, 'scratch')))).toEqual([
      'scratch/x.mjs',
    ]);
  });
});
