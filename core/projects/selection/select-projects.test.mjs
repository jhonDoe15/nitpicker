import { describe, expect, it } from 'vitest';
import { selectProjects } from './select-projects.mjs';
import { isToolchainFileFor } from './toolchain-files.mjs';

function project(path, preset = 'typescript', sharedFiles = [], prefix = '.') {
  return {
    path,
    repoPath: prefix === '.' ? path : `${prefix}/${path}`,
    preset,
    sharedFiles,
  };
}

const PROJECTS = [
  project('web'),
  project('services/api', 'python'),
  project('services/app', 'java'),
  project('libs/core'),
];

const GRAPH = new Map([
  ['web', new Set(['libs/core'])],
  ['services/api', new Set()],
  ['services/app', new Set()],
  ['libs/core', new Set()],
]);

function choose(changed, extra = {}) {
  const { selection, outside } = selectProjects({
    projects: PROJECTS,
    changed,
    graph: GRAPH,
    ...extra,
  });
  return {
    outside,
    selected: Object.fromEntries(
      selection.map(({ path, selected, reason }) => [path, selected ? reason : null]),
    ),
  };
}

describe('projects with changed files', () => {
  it('selects the project holding a changed file and skips the rest', () => {
    expect(choose(['web/src/a.ts', 'web/src/b.ts']).selected).toEqual({
      web: '2 changed files',
      'services/api': null,
      'services/app': null,
      'libs/core': null,
    });
  });

  it('gives a file to the deepest project that contains it', () => {
    const projects = [project('.'), project('api')];
    const { selection } = selectProjects({
      projects,
      changed: ['api/x.py', 'README.md'],
      graph: new Map(),
    });

    expect(selection.map(({ path, reason }) => [path, reason])).toEqual([
      ['.', '1 changed file'],
      ['api', '1 changed file'],
    ]);
  });

  it('selects nothing when nothing changed', () => {
    expect(Object.values(choose([]).selected)).toEqual([null, null, null, null]);
  });
});

describe('projects that depend on a changed one', () => {
  it('are selected with the project they depend on named', () => {
    expect(choose(['libs/core/src/a.ts']).selected).toEqual({
      'libs/core': '1 changed file',
      web: 'depends on libs/core',
      'services/api': null,
      'services/app': null,
    });
  });
});

describe('files outside every project', () => {
  it('select the projects of the toolchain they belong to', () => {
    expect(choose(['pnpm-lock.yaml']).selected).toEqual({
      web: 'pnpm-lock.yaml changed',
      'libs/core': 'pnpm-lock.yaml changed',
      'services/api': null,
      'services/app': null,
    });
    expect(choose(['uv.lock']).selected['services/api']).toBe('uv.lock changed');
    expect(choose(['gradle/wrapper/gradle-wrapper.properties']).selected['services/app']).toBe(
      'gradle/wrapper/gradle-wrapper.properties changed',
    );
  });

  it('are listed when nothing uses them', () => {
    const { outside, selected } = choose(['README.md', 'docs/guide.md']);

    expect(outside).toEqual(['README.md', 'docs/guide.md']);
    expect(Object.values(selected)).toEqual([null, null, null, null]);
  });

  it('are not listed when they sit beside the monorepo in a larger repository', () => {
    const { outside } = choose(['other/readme.md', 'mono/README.md'], { prefix: 'mono' });

    expect(outside).toEqual(['mono/README.md']);
  });
});

describe('a shared config file', () => {
  it('selects the projects that extend it, wherever it lives', () => {
    const projects = [
      project('web', 'typescript', ['base.json']),
      project('api', 'python', ['base.json', 'team/py.json']),
      project('app', 'java'),
    ];
    const { selection, outside } = selectProjects({
      projects,
      changed: ['team/py.json', 'base.json'],
      graph: new Map(),
    });

    expect(selection.map(({ path, reason }) => [path, reason])).toEqual([
      ['web', 'shared config base.json changed'],
      ['api', 'shared config team/py.json changed'],
      ['app', 'no changed files'],
    ]);
    expect(outside).toEqual([]);
  });

  it('prefers the project own changes in the reason', () => {
    const { selection } = selectProjects({
      projects: [project('web', 'typescript', ['base.json'])],
      changed: ['base.json', 'web/a.ts'],
      graph: new Map(),
    });

    expect(selection[0].reason).toBe('1 changed file');
  });
});

describe('the root config and broken configs', () => {
  it('select every project when the root config changes', () => {
    const { selected } = choose(['nitpicker.config.json'], {
      rootConfigFiles: ['nitpicker.config.json', 'shared/base.json'],
    });

    expect(Object.values(selected)).toEqual(
      Array(4).fill('root config nitpicker.config.json changed'),
    );
  });

  it('select a project whose config has an error, changed or not', () => {
    const { selection } = selectProjects({
      projects: [{ ...project('web'), configError: 'bad' }, project('libs/core')],
      changed: [],
      graph: new Map(),
    });

    expect(selection.map(({ path, selected, reason }) => [path, selected, reason])).toEqual([
      ['web', true, 'its config has an error'],
      ['libs/core', false, 'no changed files'],
    ]);
  });
});

describe('--project and --all', () => {
  it('--project runs the named projects whether or not they changed, and nothing else', () => {
    const { selected } = choose(['web/a.ts'], { requested: ['services/api'] });

    expect(selected).toEqual({
      web: null,
      'services/api': 'requested with --project',
      'services/app': null,
      'libs/core': null,
    });
  });

  it('--project refuses a name that is not a project and lists the projects', () => {
    expect(() => choose([], { requested: ['nope', 'web'] })).toThrow(
      '--project names nope, which is not a project of this repository. ' +
        'Projects: web, services/api, services/app, libs/core',
    );
  });

  it('--all selects every project', () => {
    expect(Object.values(choose([], { all: true }).selected)).toEqual([
      '--all',
      '--all',
      '--all',
      '--all',
    ]);
  });

  it('--all with --project keeps to the named projects', () => {
    expect(choose([], { all: true, requested: ['web'] }).selected.web).toBe(
      'requested with --project',
    );
    expect(choose([], { all: true, requested: ['web'] }).selected['libs/core']).toBeNull();
  });
});

describe('toolchain files', () => {
  it.each([
    ['typescript', 'package.json', true],
    ['javascript', 'config/tsconfig.base.json', true],
    ['typescript', 'bun.lock', true],
    ['typescript', 'uv.lock', false],
    ['python', 'requirements-dev.txt', true],
    ['python', 'pyproject.toml', true],
    ['python', 'package.json', false],
    ['java', 'settings.gradle.kts', true],
    ['kotlin', 'gradle/libs.versions.toml', true],
    ['java', 'buildSrc/src/Plugin.kt', true],
    ['java', 'pom.xml', true],
    ['java', 'README.md', false],
    [undefined, 'yarn.lock', true],
  ])('%s: %s -> %s', (preset, file, expected) => {
    expect(isToolchainFileFor(preset, file)).toBe(expected);
  });
});
