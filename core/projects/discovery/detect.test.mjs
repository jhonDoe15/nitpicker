import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { detectProjects, undeclaredProjects } from './detect.mjs';
import { listRepositoryFiles } from './repository-files.mjs';

const git = useGitFixtures();

function detect(files, rootConfig = {}) {
  const { root } = git.createGitRepository(files, { prefix: 'nitpicker-detect-' });
  const detected = detectProjects({ root, rootConfig });
  const undeclared = undeclaredProjects({
    root,
    files: listRepositoryFiles(root),
    projects: detected.entries,
  });
  return {
    ...detected,
    paths: detected.entries.map(({ path }) => path),
    origins: [...new Set(detected.entries.map(({ origin }) => origin))],
    undeclared: undeclared.map(({ path, origin }) => `${path} (${origin})`),
  };
}

const MANIFEST = (name, extra = {}) => JSON.stringify({ name, version: '1.0.0', ...extra });

describe('a repository with one project', () => {
  it('is not a monorepo', () => {
    expect(detect({ 'package.json': MANIFEST('solo'), 'src/a.ts': 'export {};\n' }).multiple).toBe(
      false,
    );
  });

  it('is not one for a lone Gradle, Maven or Python project', () => {
    for (const files of [
      { 'settings.gradle': '', 'app/build.gradle': '' },
      { 'pom.xml': '<project/>', 'module-a/pom.xml': '<project/>' },
      { 'pyproject.toml': '[project]\nname = "solo"\n' },
    ]) {
      expect(detect(files)).toEqual({
        declared: false,
        entries: [],
        multiple: false,
        paths: [],
        origins: [],
        undeclared: [],
      });
    }
  });

  it('is not one for a package with an Android build and example Python projects', () => {
    const result = detect({
      'package.json': MANIFEST('app'),
      'src/a.ts': 'export {};\n',
      'android/build.gradle': '',
      'pyproject.toml': '[project]\nname = "lib"\n',
      'examples/demo/pyproject.toml': '[project]\nname = "demo"\n',
    });

    expect([result.multiple, result.undeclared]).toEqual([
      false,
      ['android (Gradle build)', 'examples/demo (Python project)'],
    ]);
  });

  it('is not one when the workspaces match no package', () => {
    const result = detect({ 'package.json': MANIFEST('root', { workspaces: ['packages/*'] }) });

    expect(result.declared).toBe(true);
    expect(result.multiple).toBe(false);
    expect(result.entries).toEqual([]);
  });
});

describe('JavaScript workspaces', () => {
  const workspaceFiles = {
    'packages/a/package.json': MANIFEST('a'),
    'packages/b/package.json': MANIFEST('b'),
    'tools/c/package.json': MANIFEST('c'),
    'packages/not-a-package/readme.md': 'x',
  };

  it('reads npm, Yarn and Bun workspaces from package.json', () => {
    const result = detect({
      ...workspaceFiles,
      'package.json': MANIFEST('root', { workspaces: ['packages/*', 'tools/c'] }),
    });

    expect(result.paths).toEqual(['packages/a', 'packages/b', 'tools/c']);
    expect(result.declared).toBe(true);
    expect(result.multiple).toBe(true);
    expect(result.origins).toEqual(['package.json workspaces']);
  });

  it('reads the Yarn workspaces object form and excluded packages', () => {
    const result = detect({
      ...workspaceFiles,
      'package.json': MANIFEST('root', { workspaces: { packages: ['packages/*', '!packages/b'] } }),
    });

    expect(result.paths).toEqual(['packages/a']);
  });

  it('reads pnpm-workspace.yaml', () => {
    const result = detect({
      ...workspaceFiles,
      'package.json': MANIFEST('root'),
      'pnpm-workspace.yaml': "packages:\n  - 'packages/*'\n  - '!packages/a'\n",
    });

    expect(result.paths).toEqual(['packages/b']);
    expect(result.origins).toEqual(['pnpm-workspace.yaml']);
  });

  it('adds the repository root when it has sources of its own', () => {
    const result = detect(
      {
        ...workspaceFiles,
        'package.json': MANIFEST('root', { workspaces: ['packages/*'] }),
        'src/main.ts': 'export {};\n',
      },
      { layout: { sourceRoots: ['src'] } },
    );

    expect(result.paths).toEqual(['.', 'packages/a', 'packages/b']);
  });

  it('leaves out a root that only holds the workspace manifest', () => {
    const result = detect({
      ...workspaceFiles,
      'package.json': MANIFEST('root', { workspaces: ['packages/*'] }),
    });

    expect(result.paths).not.toContain('.');
  });

  it('ignores a workspace file it cannot read', () => {
    const result = detect({
      ...workspaceFiles,
      'package.json': '{ broken',
      'pnpm-workspace.yaml': 'packages: [',
    });

    expect(result.declared).toBe(false);
    expect(result.multiple).toBe(false);
  });
});

describe('Python projects', () => {
  const PROJECT = (name) => `[project]\nname = "${name}"\nversion = "0.1.0"\n`;

  it('reads the members of a uv workspace and leaves out the excluded ones', () => {
    const result = detect({
      'pyproject.toml': '[tool.uv.workspace]\nmembers = ["libs/*"]\nexclude = ["libs/old"]\n',
      'libs/core/pyproject.toml': PROJECT('core'),
      'libs/cli/pyproject.toml': PROJECT('cli'),
      'libs/old/pyproject.toml': PROJECT('old'),
    });

    expect(result.paths).toEqual(['libs/cli', 'libs/core']);
    expect(result.origins).toEqual(['uv workspace']);
    expect(result.declared).toBe(true);
  });

  it('includes the root of a uv workspace that is itself a project', () => {
    const result = detect({
      'pyproject.toml': `${PROJECT('root')}\n[tool.uv.workspace]\nmembers = ["libs/*"]\n`,
      'libs/core/pyproject.toml': PROJECT('core'),
    });

    expect(result.paths).toEqual(['.', 'libs/core']);
  });

  it('keeps a Poetry root and members that use setup.py', () => {
    const result = detect({
      'pyproject.toml':
        '[tool.poetry]\nname = "root"\n\n[tool.uv.workspace]\nmembers = ["libs/*"]\n',
      'libs/legacy/setup.py': 'from setuptools import setup\n',
      'libs/cfg/setup.cfg': '[metadata]\nname = cfg\n',
    });

    expect(result.paths).toEqual(['.', 'libs/cfg', 'libs/legacy']);
  });

  it('does not split nested Python projects without a workspace, and names them', () => {
    const result = detect({
      'services/api/pyproject.toml': PROJECT('api'),
      'services/worker/pyproject.toml': PROJECT('worker'),
      'services/api/tests/fixtures/sample/pyproject.toml': PROJECT('sample'),
      'services/api/inner/pyproject.toml': PROJECT('inner'),
    });

    expect([result.declared, result.multiple, result.undeclared]).toEqual([
      false,
      false,
      ['services/api (Python project)', 'services/worker (Python project)'],
    ]);
  });

  it('ignores a pyproject.toml it cannot parse', () => {
    const result = detect({ 'pyproject.toml': '[project', 'a/pyproject.toml': PROJECT('a') });

    expect([result.multiple, result.undeclared]).toEqual([false, ['a (Python project)']]);
  });
});

describe('JVM builds', () => {
  it('treats a Gradle build with its subprojects as one project', () => {
    const result = detect({
      'settings.gradle': "include 'lib', 'app'",
      'lib/build.gradle': '',
      'app/build.gradle': '',
      'web/package.json': MANIFEST('web', { workspaces: [] }),
      'tools/py/pyproject.toml': '[project]\nname = "py"\n',
    });

    expect([result.multiple, result.undeclared]).toEqual([false, ['tools/py (Python project)']]);
  });

  it('names a Maven reactor and a Gradle build as one project each', () => {
    const result = detect({
      'services/billing/pom.xml': '<project><modules><module>core</module></modules></project>',
      'services/billing/core/pom.xml': '<project/>',
      'services/ledger/build.gradle.kts': '',
      'services/ledger/settings.gradle.kts': '',
    });

    expect(result.undeclared).toEqual([
      'services/billing (Maven build)',
      'services/ledger (Gradle build)',
    ]);
  });

  it('skips builds inside fixtures, test folders and dependency folders', () => {
    const result = detect({
      'app/build.gradle': '',
      'app/src/test/fixtures/x/pom.xml': '<project/>',
      'node_modules/dep/pom.xml': '<project/>',
      'tests/pom.xml': '<project/>',
      '.hidden/pom.xml': '<project/>',
    });

    expect(result.undeclared).toEqual(['app (Gradle build)']);
  });
});

describe('a mixed repository', () => {
  it('gates the workspace members and names the other projects', () => {
    const result = detect({
      'package.json': MANIFEST('root', { workspaces: ['web'] }),
      'web/package.json': MANIFEST('web'),
      'api/pyproject.toml': '[project]\nname = "api"\n',
      'svc/settings.gradle': '',
      'svc/app/build.gradle': '',
    });

    expect([result.paths, result.undeclared]).toEqual([
      ['web'],
      ['api (Python project)', 'svc (Gradle build)'],
    ]);
  });
});
