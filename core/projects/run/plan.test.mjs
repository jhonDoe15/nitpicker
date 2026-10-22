import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { planMonorepo } from './plan.mjs';

const git = useGitFixtures();

function plan(files, folder = '.') {
  const { root } = git.createGitRepository(files, { prefix: 'nitpicker-plan-' });
  return planMonorepo({ root: path.join(root, folder) });
}

const MANIFEST = '{"name":"x","version":"1.0.0"}';
const PYPROJECT = '[project]\nname = "x"\nversion = "0.1.0"\n';

describe('planMonorepo', () => {
  it('is nothing for a repository with one project', () => {
    expect(plan({ 'package.json': MANIFEST, 'src/a.ts': 'export {};\n' })).toBeUndefined();
  });

  it('lists the projects of the config and gives each its preset and shared files', () => {
    const found = plan({
      'base.json': '{"base":"origin/main"}',
      'nitpicker.config.json': JSON.stringify({
        projects: ['web', { path: 'api', preset: 'python' }, 'svc'],
      }),
      'web/package.json': MANIFEST,
      'web/nitpicker.config.json': '{"extends":"../base.json"}',
      'api/pyproject.toml': PYPROJECT,
      'svc/pom.xml': '<project/>',
    });

    expect(found.source).toBe('declared');
    expect(
      found.projects.map(({ path: p, preset, overlay, sharedFiles, repoPath }) => ({
        p,
        preset,
        overlay,
        sharedFiles,
        repoPath,
      })),
    ).toEqual([
      {
        p: 'web',
        preset: 'typescript',
        overlay: undefined,
        sharedFiles: ['base.json'],
        repoPath: 'web',
      },
      {
        p: 'api',
        preset: 'python',
        overlay: { preset: 'python', declared: true },
        sharedFiles: [],
        repoPath: 'api',
      },
      {
        p: 'svc',
        preset: 'java',
        overlay: { preset: 'java', declared: false },
        sharedFiles: [],
        repoPath: 'svc',
      },
    ]);
  });

  it('keeps one project when the list is empty, whatever the repository holds', () => {
    expect(
      plan({
        'nitpicker.config.json': '{"projects":[]}',
        'package.json': '{"workspaces":["a"]}',
        'a/package.json': MANIFEST,
      }),
    ).toBeUndefined();
  });

  it('detects the projects when the config lists none', () => {
    const found = plan({
      'package.json': '{"workspaces":["packages/*"]}',
      'packages/a/package.json': MANIFEST,
      'tools/py/pyproject.toml': PYPROJECT,
    });

    expect(found.source).toBe('detected');
    expect(found.projects.map(({ path: p, preset }) => [p, preset])).toEqual([
      ['packages/a', 'typescript'],
      ['tools/py', 'python'],
    ]);
  });

  it('places the projects of a monorepo that is a folder of a larger repository', () => {
    const found = plan(
      {
        'mono/nitpicker.config.json': '{"projects":["a","b"]}',
        'mono/a/package.json': MANIFEST,
        'mono/b/package.json': MANIFEST,
      },
      'mono',
    );

    expect(found.prefix).toBe('mono');
    expect(found.projects.map(({ repoPath }) => repoPath)).toEqual(['mono/a', 'mono/b']);
  });

  it('refuses a project config that lists projects of its own', () => {
    expect(() =>
      plan({
        'nitpicker.config.json': '{"projects":["a"]}',
        'a/nitpicker.config.json': '{"projects":["b"]}',
        'a/package.json': MANIFEST,
      }),
    ).toThrow(
      'a/nitpicker.config.json sets "projects", but only the config at the top of the monorepo can list projects',
    );
  });

  it('leaves a project config it cannot read to the run of that project', () => {
    const found = plan({
      'nitpicker.config.json': '{"projects":["a"]}',
      'a/nitpicker.config.json': '{ broken',
      'a/package.json': MANIFEST,
    });

    expect(
      found.projects.map(({ path: p, preset, sharedFiles }) => ({ p, preset, sharedFiles })),
    ).toEqual([{ p: 'a', preset: 'typescript', sharedFiles: [] }]);
  });

  it('leaves a repository it cannot list files in alone', () => {
    expect(planMonorepo({ root: git.temporaryRoot('nitpicker-plain-') })).toBeUndefined();
  });

  it('fails on a root config that is not valid', () => {
    expect(() => plan({ 'nitpicker.config.json': '{"colour":1}' })).toThrow('unknown key "colour"');
  });
});
