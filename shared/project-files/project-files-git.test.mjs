import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureGit } from '../../core/diff/git/test-support/git-repository.mjs';
import { projectFilePaths } from './project-files.mjs';
import { writeFiles } from '../../core/diff/git/test-support/fixture-files.mjs';
import {
  ageTree,
  useProjectFixtures,
} from '../../core/diff/git/test-support/projects/project-fixtures.mjs';

const { temporaryRoot, gitProject, tracedGit } = useProjectFixtures();

afterEach(() => {
  vi.unstubAllEnvs();
});

const SOURCES = { 'src/a.mjs': '', 'src/deep/b.mjs': '', 'README.md': '' };
const ALLOW_FILE_PROTOCOL = ['-c', 'protocol.file.allow=always'];

function listings(logFile) {
  return readFileSync(logFile, 'utf8')
    .split('\n')
    .filter((line) => line.includes('built-in: git') && line.includes(' ls-files '));
}

function logFileOf() {
  const logFile = path.join(temporaryRoot(), 'git.log');
  writeFileSync(logFile, '');
  tracedGit(logFile);
  return logFile;
}

function repositoryWithSubmodule() {
  const library = temporaryRoot();
  fixtureGit(library, ['init', '-q']);
  writeFiles(library, { 'l.mjs': '', 'src/m.mjs': '' });
  fixtureGit(library, ['add', '-A']);
  fixtureGit(library, ['commit', '-q', '-m', 'library']);
  const root = gitProject({ ...SOURCES, 'clone/c.mjs': '' });
  fixtureGit(root, [...ALLOW_FILE_PROTOCOL, 'submodule', 'add', '-q', library, 'libs/lib']);
  fixtureGit(path.join(root, 'clone'), ['init', '-q']);
  fixtureGit(path.join(root, 'clone'), ['commit', '--allow-empty', '-q', '-m', 'clone']);
  const sha = fixtureGit(path.join(root, 'clone'), ['rev-parse', 'HEAD']).trim();
  fixtureGit(root, ['update-index', '--add', '--cacheinfo', `160000,${sha},clone`]);
  writeFiles(root, { 'libs/lib/untracked.mjs': '' });
  return root;
}

describe('the Git environment of the listing', () => {
  it('ignores the repository variables a hook leaves in the environment', () => {
    const other = gitProject({});
    const root = gitProject(
      { ...SOURCES, 'src/scratch/x.mjs': '' },
      { ignored: ['scratch/'], tracked: ['README.md'] },
    );
    vi.stubEnv('GIT_DIR', path.join(other, '.git'));
    vi.stubEnv('GIT_WORK_TREE', path.join(root, 'elsewhere'));
    vi.stubEnv('GIT_INDEX_FILE', path.join(root, 'elsewhere', 'index'));
    vi.stubEnv('GIT_PREFIX', 'src/');

    expect(projectFilePaths(path.join(root, 'src'))).toEqual(['a.mjs', 'deep/b.mjs']);
  });

  it('does not apply the global ignore file of the machine', () => {
    const home = temporaryRoot();
    writeFileSync(path.join(home, 'ignore'), '*.mjs\n');
    writeFileSync(
      path.join(home, 'gitconfig'),
      `[core]\n\texcludesFile = ${path.join(home, 'ignore')}\n`,
    );
    vi.stubEnv('GIT_CONFIG_GLOBAL', path.join(home, 'gitconfig'));
    vi.stubEnv('XDG_CONFIG_HOME', home);
    const root = gitProject(SOURCES);

    expect(projectFilePaths(root)).toEqual(['README.md', 'src/a.mjs', 'src/deep/b.mjs']);
  });
});

describe('a Git failure that is not an absent repository', () => {
  it('names the failure instead of walking the whole tree', () => {
    const root = gitProject(SOURCES, { tracked: ['README.md'] });
    writeFileSync(path.join(root, '.git', 'index'), 'not an index');

    expect(() => projectFilePaths(root)).toThrow(/git .* failed in .*index/u);
  });

  it('says that Git could not be run when there is no Git program', () => {
    const root = gitProject(SOURCES);
    vi.stubEnv('PATH', temporaryRoot());

    expect(() => projectFilePaths(root)).toThrow(
      /git rev-parse failed in .*No such file or directory/u,
    );
  });
});

describe('submodules', () => {
  it('lists the files of a registered submodule and skips other nested repositories', () => {
    const root = repositoryWithSubmodule();

    expect(projectFilePaths(root)).toEqual([
      '.gitmodules',
      'README.md',
      'libs/lib/l.mjs',
      'libs/lib/src/m.mjs',
      'libs/lib/untracked.mjs',
      'src/a.mjs',
      'src/deep/b.mjs',
    ]);
  });

  it('keeps the files of a registered submodule when ignored files are kept', () => {
    const root = repositoryWithSubmodule();

    expect(projectFilePaths(root, { includeIgnored: true })).toEqual(projectFilePaths(root));
  });

  it('lists a folder inside a submodule from the submodule itself', () => {
    const root = repositoryWithSubmodule();

    expect(projectFilePaths(path.join(root, 'libs', 'lib', 'src'))).toEqual(['m.mjs']);
  });
});

describe('the listing of a repository', () => {
  it('is made once while the tree does not change, whatever folder asks', () => {
    const logFile = logFileOf();
    const root = gitProject(SOURCES, { ignored: ['scratch/'], tracked: ['README.md'] });
    writeFiles(root, { 'scratch/x.mjs': '' });
    ageTree(root);

    const first = projectFilePaths(root);
    const second = projectFilePaths(path.join(root, 'src'));
    const third = projectFilePaths(path.join(root, 'src', 'deep'));
    const fourth = projectFilePaths(path.join(root, 'src', 'deep'));

    expect([first, second, third, fourth]).toEqual([
      ['README.md', 'src/a.mjs', 'src/deep/b.mjs'],
      ['a.mjs', 'deep/b.mjs'],
      ['b.mjs'],
      ['b.mjs'],
    ]);
    expect(listings(logFile)).toHaveLength(1);
  });

  it('is made again once a file appears', () => {
    const logFile = logFileOf();
    const root = gitProject(SOURCES, { tracked: ['README.md'] });
    ageTree(root);
    projectFilePaths(root);

    mkdirSync(path.join(root, 'src', 'late'));
    writeFiles(root, { 'src/late/c.mjs': '' });

    expect(projectFilePaths(root)).toEqual([
      'README.md',
      'src/a.mjs',
      'src/deep/b.mjs',
      'src/late/c.mjs',
    ]);
    expect(listings(logFile)).toHaveLength(2);
  });

  it('shows a file created right after an earlier listing', () => {
    const root = gitProject(SOURCES, { tracked: ['README.md'] });
    projectFilePaths(root);
    writeFiles(root, { 'src/new.mjs': '' });

    expect(projectFilePaths(root)).toEqual([
      'README.md',
      'src/a.mjs',
      'src/deep/b.mjs',
      'src/new.mjs',
    ]);
  });
});
