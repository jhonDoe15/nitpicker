import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { resolveDeclaredProjects } from './declared-projects.mjs';
import {
  directoriesWith,
  isInside,
  isSkippedLocation,
  listRepositoryFiles,
  outermost,
} from './repository-files.mjs';

const git = useGitFixtures();

function repository(files) {
  return git.createGitRepository(files, { prefix: 'nitpicker-declared-' }).root;
}

function resolve(root, entries) {
  return resolveDeclaredProjects({ root, entries, files: listRepositoryFiles(root) });
}

describe('the projects a config lists', () => {
  const files = {
    'web/package.json': '{}',
    'services/api/pyproject.toml': '',
    'services/jobs/pom.xml': '',
    'services/notes/readme.md': '',
    'tools/x/nitpicker.config.json': '{}',
  };

  it('keeps folders as listed, with their preset', () => {
    const root = repository(files);

    expect(resolve(root, [{ path: 'web' }, { path: 'services/api', preset: 'python' }])).toEqual([
      { path: 'web', origin: 'nitpicker.config.json "projects"' },
      { path: 'services/api', preset: 'python', origin: 'nitpicker.config.json "projects"' },
    ]);
  });

  it('expands a glob to the folders that look like projects', () => {
    const root = repository(files);

    expect(resolve(root, [{ path: 'services/*', preset: 'java' }]).map(({ path: p }) => p)).toEqual(
      ['services/api', 'services/jobs'],
    );
    expect(resolve(root, [{ path: 'services/*' }])[0]).not.toHaveProperty('preset');
  });

  it('lists a folder once when two entries reach it', () => {
    const root = repository(files);

    expect(
      resolve(root, [{ path: 'services/api' }, { path: 'services/*' }]).map(({ path: p }) => p),
    ).toEqual(['services/api', 'services/jobs']);
  });

  it('refuses a folder that does not exist or is a file', () => {
    const root = repository(files);

    expect(() => resolve(root, [{ path: 'missing' }])).toThrow(
      `"projects" lists missing, which is not a folder under ${root}`,
    );
    expect(() => resolve(root, [{ path: 'web/package.json' }])).toThrow('is not a folder');
  });

  it('refuses a glob that matches nothing and says what it looks for', () => {
    const root = repository(files);

    expect(() => resolve(root, [{ path: 'apps/*' }])).toThrow(
      '"projects" entry apps/* matches no folder with a package.json, ' +
        'pyproject.toml, build file or nitpicker.config.json',
    );
  });
});

describe('repository file helpers', () => {
  it('lists tracked and untracked files but not ignored ones', () => {
    const root = repository({ '.gitignore': 'ignored/\n', 'a.txt': '', 'ignored/b.txt': '' });

    expect(listRepositoryFiles(root).toSorted()).toEqual(['.gitignore', 'a.txt']);
  });

  it('finds the folders that hold a marker file that exists', () => {
    const root = repository({
      'a/pom.xml': '',
      'a/b/pom.xml': '',
      'c/readme.md': '',
      'build.gradle': '',
    });

    expect(directoriesWith(root, listRepositoryFiles(root), ['pom.xml', 'build.gradle'])).toEqual([
      '.',
      'a',
      'a/b',
    ]);
    expect(directoriesWith(path.join(root, 'a'), ['pom.xml', 'gone/pom.xml'], ['pom.xml'])).toEqual(
      ['.'],
    );
  });

  it('knows whether a folder is inside another', () => {
    expect(isInside('a/b', 'a')).toBe(true);
    expect(isInside('a', 'a')).toBe(true);
    expect(isInside('ab', 'a')).toBe(false);
    expect(isInside('a', '.')).toBe(true);
  });

  it('skips hidden, dependency, build and test locations', () => {
    expect(isSkippedLocation('services/api')).toBe(false);
    expect(isSkippedLocation('.')).toBe(false);
    expect(isSkippedLocation('a/.cache')).toBe(true);
    expect(isSkippedLocation('a/node_modules/b')).toBe(true);
    expect(isSkippedLocation('a/tests')).toBe(true);
  });

  it('keeps the outermost folders, and the root only when it holds the rest', () => {
    expect(outermost(['.', 'a', 'a/b', 'c'])).toEqual(['.', 'a', 'c']);
    expect(outermost(['.', 'a', 'a/b', 'c'], { rootContainsAll: true })).toEqual(['.']);
  });
});
