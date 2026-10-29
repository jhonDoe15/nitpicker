import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../diff/git/test-support/git-repository.mjs';
import { dependencyGraph, dependentsOf, deepestProject } from './graph.mjs';

const git = useGitFixtures();

function layout(files) {
  const root = git.temporaryRoot('nitpicker-graph-');
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  }
  return root;
}

function edges(files, projects) {
  const graph = dependencyGraph(layout(files), projects);
  return Object.fromEntries([...graph].map(([project, needs]) => [project, [...needs].toSorted()]));
}

const manifest = (name, dependencies = {}, extra = {}) =>
  JSON.stringify({ name, dependencies, ...extra });

describe('JavaScript workspace dependencies', () => {
  it('follows dependencies that name another workspace package, whatever the protocol', () => {
    expect(
      edges(
        {
          'ui/package.json': manifest('@acme/ui'),
          'util/package.json': manifest('@acme/util'),
          'web/package.json': manifest(
            'web',
            { '@acme/ui': 'workspace:*', react: '^19.0.0' },
            { devDependencies: { '@acme/util': '^1.0.0' } },
          ),
        },
        ['ui', 'util', 'web'],
      ),
    ).toEqual({ ui: [], util: [], web: ['ui', 'util'] });
  });

  it('follows file, link and portal specifiers to the project holding the folder', () => {
    expect(
      edges(
        {
          'libs/core/package.json': manifest('core'),
          'app/package.json': manifest('app', {
            a: 'file:../libs/core/dist',
            b: 'link:../libs/core',
            c: 'portal:../../outside',
          }),
        },
        ['libs/core', 'app'],
      ),
    ).toEqual({ 'libs/core': [], app: ['libs/core'] });
  });

  it('follows an npm alias to the workspace package it names', () => {
    expect(
      edges(
        {
          'ui/package.json': manifest('@acme/ui'),
          'web/package.json': manifest('web', { ui: 'npm:@acme/ui@^1.0.0', left: 'npm:leftpad@1' }),
        },
        ['ui', 'web'],
      ),
    ).toEqual({ ui: [], web: ['ui'] });
  });

  it('copes with a manifest that cannot be read or has no name', () => {
    expect(
      edges({ 'a/package.json': '{ broken', 'b/package.json': '[]', 'c/package.json': '{}' }, [
        'a',
        'b',
        'c',
      ]),
    ).toEqual({ a: [], b: [], c: [] });
  });
});

describe('Python dependencies', () => {
  const pyproject = (name, tail = '') => `[project]\nname = "${name}"\n${tail}`;

  it('follows uv workspace sources and path sources', () => {
    expect(
      edges(
        {
          'libs/Core_Lib/pyproject.toml': pyproject('Core_Lib'),
          'libs/other/pyproject.toml': pyproject('other'),
          'api/pyproject.toml': pyproject(
            'api',
            'dependencies = ["core-lib", "other"]\n[tool.uv.sources]\n' +
              'core-lib = { workspace = true }\nother = { path = "../libs/other" }\nplain = "x"\n',
          ),
        },
        ['libs/Core_Lib', 'libs/other', 'api'],
      ),
    ).toEqual({ 'libs/Core_Lib': [], 'libs/other': [], api: ['libs/Core_Lib', 'libs/other'] });
  });

  it('follows Poetry path dependencies in every group', () => {
    expect(
      edges(
        {
          'lib/pyproject.toml': '[tool.poetry]\nname = "lib"\n',
          'api/pyproject.toml':
            '[tool.poetry]\nname = "api"\n[tool.poetry.dependencies]\nlib = { path = "../lib" }\n' +
            'python = "^3.12"\n[tool.poetry.group.dev.dependencies]\nx = "1"\n',
          'cli/pyproject.toml':
            '[tool.poetry]\nname = "cli"\n[tool.poetry.group.dev.dependencies]\nlib = { path = "../lib" }\n',
        },
        ['lib', 'api', 'cli'],
      ),
    ).toEqual({ lib: [], api: ['lib'], cli: ['lib'] });
  });

  it('does not treat a plain dependency on a similarly named package as local', () => {
    expect(
      edges(
        {
          'lib/pyproject.toml': pyproject('lib'),
          'api/pyproject.toml': pyproject('api', 'dependencies = ["lib"]\n'),
        },
        ['lib', 'api'],
      ),
    ).toEqual({ lib: [], api: [] });
  });
});

describe('JVM build dependencies', () => {
  it('follows included builds and Maven parents outside the build', () => {
    expect(
      edges(
        {
          'shared/settings.gradle': '',
          'svc/settings.gradle': "includeBuild '../shared'\nincludeBuild('./inner')\n",
          'kt/settings.gradle.kts': 'includeBuild(file("../shared"))\n',
          'mvn/pom.xml':
            '<project><parent><relativePath>../shared/pom.xml</relativePath></parent>' +
            '<modules><module>inner</module></modules></project>',
        },
        ['shared', 'svc', 'kt', 'mvn'],
      ),
    ).toEqual({ shared: [], svc: ['shared'], kt: ['shared'], mvn: ['shared'] });
  });
});

describe('dependents', () => {
  const graph = new Map([
    ['core', new Set()],
    ['lib', new Set(['core'])],
    ['app', new Set(['lib'])],
    ['other', new Set()],
  ]);

  it('reaches everything that depends on a changed project, directly or not', () => {
    expect(dependentsOf(graph, new Set(['core']))).toEqual(
      new Map([
        ['lib', 'core'],
        ['app', 'lib'],
      ]),
    );
  });

  it('adds nothing for a project nobody depends on', () => {
    expect(dependentsOf(graph, new Set(['app', 'other']))).toEqual(new Map());
  });

  it('terminates on a cycle', () => {
    const cyclic = new Map([
      ['a', new Set(['b'])],
      ['b', new Set(['a'])],
    ]);

    expect(dependentsOf(cyclic, new Set(['a']))).toEqual(new Map([['b', 'a']]));
  });
});

describe('deepestProject', () => {
  it('picks the project nearest to a folder, and the root last', () => {
    expect(deepestProject(['.', 'a', 'a/b'], 'a/b/c')).toBe('a/b');
    expect(deepestProject(['.', 'a'], 'x/y')).toBe('.');
    expect(deepestProject(['a'], 'x')).toBeUndefined();
  });
});
