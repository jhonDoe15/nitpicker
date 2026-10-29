import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { memberProjectOf } from './member-root.mjs';
import { inspectRepository, planMonorepo } from './inspect.mjs';

const git = useGitFixtures();

function plan(files, folder = '.') {
  const { root } = git.createGitRepository(files, { prefix: 'nitpicker-plan-' });
  return planMonorepo({ root: path.join(root, folder) });
}

const MANIFEST = '{"name":"x","version":"1.0.0"}';
const PYPROJECT = '[project]\nname = "x"\nversion = "0.1.0"\n';

describe('inspectRepository', () => {
  it('is nothing for a repository with one project', () => {
    expect(plan({ 'package.json': MANIFEST, 'src/a.ts': 'export {};\n' })).toBeUndefined();
  });

  it('lists the projects of the config and gives each its preset and shared files', () => {
    const found = plan({
      'base.json': '{"exclude":["gen/**"]}',
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

  it('detects the workspace members when the config lists none, and names the other projects', () => {
    const found = plan({
      'package.json': '{"workspaces":["packages/*"]}',
      'packages/a/package.json': MANIFEST,
      'tools/py/pyproject.toml': PYPROJECT,
    });

    expect(found.source).toBe('detected');
    expect(found.projects.map(({ path: p, preset }) => [p, preset])).toEqual([
      ['packages/a', 'typescript'],
    ]);
    expect(found.undeclared).toEqual([{ path: 'tools/py', origin: 'Python project' }]);
  });

  it('keeps a repository without a workspace one project and names its nested projects', () => {
    const { root } = git.createGitRepository(
      {
        'package.json': MANIFEST,
        'src/a.ts': 'export {};\n',
        'android/build.gradle': '',
        'examples/demo/pyproject.toml': PYPROJECT,
      },
      { prefix: 'nitpicker-plan-' },
    );
    const inspection = inspectRepository({ root });

    expect([inspection.plan, inspection.undeclared]).toEqual([
      undefined,
      [
        { path: 'android', origin: 'Gradle build' },
        { path: 'examples/demo', origin: 'Python project' },
      ],
    ]);
  });

  it('keeps the projects nested in a project out of its run', () => {
    const found = plan({
      'nitpicker.config.json': '{"projects":[".","web","web/sub"]}',
      'package.json': MANIFEST,
      'web/package.json': MANIFEST,
      'web/sub/package.json': MANIFEST,
    });

    expect(found.projects.map(({ overlay }) => overlay)).toEqual([
      { exclude: ['web/**', 'web/sub/**'] },
      { exclude: ['sub/**'] },
      undefined,
    ]);
  });

  it('refuses a project folder named like the report folder of the root project', () => {
    expect(() =>
      plan({
        'nitpicker.config.json': '{"projects":[".","_root"]}',
        'package.json': MANIFEST,
        '_root/package.json': MANIFEST,
      }),
    ).toThrow(
      new Error(
        'The projects include the repository root and _root, but the reports of the root project ' +
          'are written to <output>/_root. Rename the _root folder, or leave the root out of "projects"',
      ),
    );
  });

  it('refuses a project base that differs from the base of the root config', () => {
    expect(() =>
      plan({
        'nitpicker.config.json': '{"projects":["a"],"base":"origin/main"}',
        'a/nitpicker.config.json': '{"base":"origin/develop"}',
        'a/package.json': MANIFEST,
      }),
    ).toThrow(
      new Error(
        'a/nitpicker.config.json sets "base": "origin/develop", but a monorepo run compares every ' +
          'project with one base, the one of the root nitpicker.config.json ("origin/main") or --base. ' +
          'Remove "base" from a/nitpicker.config.json, or set the same "base" in the root config',
      ),
    );
  });

  it('finds the member project that holds a folder', () => {
    const found = plan({
      'pyproject.toml': '[tool.uv.workspace]\nmembers = ["libs/*"]\n',
      'libs/core/pyproject.toml': PYPROJECT,
      'libs/core/src/core/a.py': '',
      'libs/cli/pyproject.toml': PYPROJECT,
    });

    expect(memberProjectOf(found, path.join(found.root, 'libs/core/src')).path).toBe('libs/core');
    expect(memberProjectOf(found, found.root)).toBeUndefined();
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
      found.projects.map(({ path: p, preset, sharedFiles, configError }) => ({
        p,
        preset,
        sharedFiles,
        configError,
      })),
    ).toEqual([
      {
        p: 'a',
        preset: 'typescript',
        sharedFiles: [],
        configError: expect.stringMatching(/^nitpicker\.config\.json is not valid JSON: /u),
      },
    ]);
  });

  it('reports a folder that is not a git repository', () => {
    expect(() => planMonorepo({ root: git.temporaryRoot('nitpicker-plain-') })).toThrow(/git/u);
  });

  it('leaves a root config that is not valid to the run when it lists no projects', () => {
    expect(plan({ 'nitpicker.config.json': '{"colour":1}' })).toBeUndefined();
  });

  it('fails on a root config that is not valid when it lists projects', () => {
    expect(() =>
      plan({
        'nitpicker.config.json': '{"projects":["a"],"colour":1}',
        'a/package.json': MANIFEST,
      }),
    ).toThrow('unknown key "colour"');
  });
});
