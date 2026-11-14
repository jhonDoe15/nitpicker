import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../../../diff/git/test-support/fixture-files.mjs';
import { projectFiles, useMonorepoFixtures } from '../../test-support/monorepo-harness.mjs';

const { repository, run } = useMonorepoFixtures();

const manifest = (name, dependencies = {}) =>
  JSON.stringify({ name, version: '1.0.0', dependencies });

function statuses(result) {
  return Object.fromEntries(
    result.json('summary.json').projects.map(({ path: project, status }) => [project, status]),
  );
}

function nestedWorkspace(declaration, extra = {}) {
  return repository({
    'nitpicker.config.json': JSON.stringify({ projects: ['frontend', 'backend'] }),
    ...declaration,
    ...projectFiles('frontend/packages/a', {
      'package.json': manifest('a'),
      'src/index.ts': 'export {};\n',
    }),
    ...projectFiles('frontend/packages/b', {
      'package.json': manifest('b', { a: 'workspace:*' }),
      'src/index.ts': 'export {};\n',
    }),
    ...projectFiles('frontend/packages/c', {
      'package.json': manifest('c'),
      'src/index.ts': 'export {};\n',
    }),
    ...projectFiles('backend', { 'pyproject.toml': '[project]\nname = "api"\n', 'src/b.py': '' }),
    ...extra,
  });
}

const PNPM = {
  'frontend/package.json': JSON.stringify({ name: 'frontend', private: true }),
  'frontend/pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
};
const NPM = {
  'frontend/package.json': JSON.stringify({ name: 'frontend', workspaces: ['packages/*'] }),
};

describe('a listed folder that declares a workspace', () => {
  it.each([
    ['pnpm', PNPM, 'frontend/pnpm-workspace.yaml'],
    ['npm', NPM, 'frontend/package.json'],
  ])(
    'stands for the %s workspace members and runs the dependents of a change',
    (_, files, from) => {
      const root = nestedWorkspace(files);
      writeFiles(root, { 'frontend/packages/a/src/index.ts': 'export const a = 1;\n' });

      const result = run(root, ['--details']);

      expect(result.plan.split('\n')).toEqual([
        `Monorepo: 4 projects listed in "projects" of nitpicker.config.json (3 from ${from}).`,
        '  run  frontend/packages/a (typescript): 1 changed file',
        '  run  frontend/packages/b (typescript): depends on frontend/packages/a',
        '  skip frontend/packages/c (typescript): no changed files',
        '  skip backend (python): no changed files',
      ]);
      expect(result.exitCode).toBe(0);
    },
  );

  it('runs every member when the workspace lockfile changes', () => {
    const root = nestedWorkspace(PNPM, { 'frontend/pnpm-lock.yaml': "lockfileVersion: '9.0'\n" });
    writeFiles(root, { 'frontend/pnpm-lock.yaml': "lockfileVersion: '9.0'\n\n" });

    expect(statuses(run(root))).toEqual({
      'frontend/packages/a': 'passed',
      'frontend/packages/b': 'passed',
      'frontend/packages/c': 'passed',
      backend: 'skipped',
    });
  });

  it('stays one project with "expand": false', () => {
    const root = nestedWorkspace(PNPM, {
      'nitpicker.config.json': JSON.stringify({
        projects: [{ path: 'frontend', expand: false }, 'backend'],
      }),
    });

    expect(Object.keys(statuses(run(root)))).toEqual(['frontend', 'backend']);
  });
});

function nxRepository(extra = {}) {
  const nxProject = (name, implicitDependencies = []) =>
    JSON.stringify({ name, implicitDependencies });
  return repository({
    'package.json': JSON.stringify({ name: 'root', private: true }),
    'nx.json': '{}',
    ...projectFiles('apps/shop', {
      'project.json': nxProject('shop', ['ui']),
      'src/main.ts': 'export {};\n',
    }),
    ...projectFiles('apps/admin', {
      'project.json': nxProject('admin', ['data']),
      'src/main.ts': 'export {};\n',
    }),
    ...projectFiles('libs/ui', { 'project.json': nxProject('ui'), 'src/index.ts': 'export {};\n' }),
    ...projectFiles('libs/data', {
      'project.json': nxProject('data'),
      'src/index.ts': 'export {};\n',
    }),
    ...extra,
  });
}

describe('an Nx workspace', () => {
  it('gates each project from the top and runs the dependents of a changed lib', () => {
    const root = nxRepository();
    writeFiles(root, { 'libs/ui/src/index.ts': 'export const ui = 1;\n' });

    const result = run(root, ['--details']);

    expect(result.plan.split('\n')).toEqual([
      'Monorepo: 4 projects detected (Nx project.json). ' +
        'List them in "projects" of nitpicker.config.json to choose them; ' +
        '"projects": [] keeps this repository one project.',
      '  skip apps/admin (typescript): no changed files',
      '  run  apps/shop (typescript): depends on libs/ui',
      '  skip libs/data (typescript): no changed files',
      '  run  libs/ui (typescript): 1 changed file',
    ]);
    expect(result.exitCode).toBe(0);
  });

  it('matches project.json folders with a "projects" glob', () => {
    const root = nxRepository({
      'nitpicker.config.json': JSON.stringify({ projects: ['apps/*', 'libs/*'] }),
    });

    expect(Object.keys(statuses(run(root)))).toEqual([
      'apps/admin',
      'apps/shop',
      'libs/data',
      'libs/ui',
    ]);
  });
});

describe('an Angular workspace', () => {
  it('gates each project of angular.json from the top', () => {
    const angular = { projects: { shop: { root: 'projects/shop' }, ui: { root: 'projects/ui' } } };
    const root = repository({
      'package.json': JSON.stringify({ name: 'root', private: true }),
      'angular.json': JSON.stringify(angular),
      ...projectFiles('projects/shop', { 'src/main.ts': 'export {};\n' }),
      ...projectFiles('projects/ui', { 'src/index.ts': 'export {};\n' }),
    });
    writeFiles(root, { 'projects/ui/src/index.ts': 'export const ui = 1;\n' });

    expect(statuses(run(root))).toEqual({ 'projects/shop': 'skipped', 'projects/ui': 'passed' });
  });
});

describe('a Gradle composite build of services', () => {
  it('gates each included service from the top and runs only the changed one', () => {
    const root = repository({
      'settings.gradle': "includeBuild('services/orders')\nincludeBuild('services/users')\n",
      ...projectFiles('services/orders', {
        'settings.gradle': '',
        'src/main/java/Orders.java': 'class Orders {}\n',
      }),
      ...projectFiles('services/users', {
        'settings.gradle': '',
        'src/main/java/Users.java': 'class Users {}\n',
      }),
    });
    writeFiles(root, { 'services/users/src/main/java/Users.java': 'class Users { }\n' });

    expect(statuses(run(root))).toEqual({
      'services/orders': 'skipped',
      'services/users': 'passed',
    });
  });
});

describe('one folder gated by two presets', () => {
  function jhipster() {
    return repository({
      'nitpicker.config.json': JSON.stringify({
        projects: [
          { path: '.', preset: 'java' },
          { path: '.', preset: 'typescript' },
        ],
      }),
      ...projectFiles('.', {
        'pom.xml': '<project/>\n',
        'package.json': '{"name":"shop","version":"1.0.0"}\n',
        'src/main/java/Shop.java': 'class Shop {}\n',
        'src/main/webapp/app/main.ts': 'export {};\n',
      }),
    });
  }

  it('runs each preset for the files of its language, with its own reports', () => {
    const root = jhipster();
    writeFiles(root, {
      'src/main/java/Shop.java': 'class Shop { }\n',
      'src/main/webapp/app/main.ts': 'export const changed = 1;\n',
    });

    const result = run(root);

    expect(result.headings).toEqual(['== .@java (java) ==', '== .@typescript (typescript) ==']);
    expect(statuses(result)).toEqual({ '.@java': 'passed', '.@typescript': 'passed' });
    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(result.reports, '_root@java', 'summary.json'))).toBe(true);
    expect(existsSync(path.join(result.reports, '_root@typescript', 'summary.json'))).toBe(true);
  });

  it('runs only the preset of the changed language', () => {
    const root = jhipster();
    writeFiles(root, { 'src/main/webapp/app/main.ts': 'export const changed = 1;\n' });

    expect(statuses(run(root))).toEqual({ '.@java': 'skipped', '.@typescript': 'passed' });
  });

  it('refuses one folder twice without two presets', () => {
    const root = repository({
      'nitpicker.config.json': JSON.stringify({ projects: ['.', { path: '.', preset: 'java' }] }),
      ...projectFiles('.', { 'pom.xml': '<project/>\n' }),
    });

    expect(run(root).err).toContain(
      '"projects" lists . twice. To gate one folder with two presets, give each entry its own "preset"',
    );
  });
});

describe('TypeScript projects wired through tsconfig paths', () => {
  it('runs the app that imports a changed library and says why', () => {
    const root = repository({
      'package.json': JSON.stringify({ name: 'root', workspaces: ['apps/*', 'libs/*'] }),
      'tsconfig.base.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@acme/ui': ['libs/ui/src/index.ts'] } },
      }),
      ...projectFiles('apps/web', {
        'package.json': manifest('web'),
        'tsconfig.json': JSON.stringify({ extends: '../../tsconfig.base.json' }),
        'src/main.ts': "export { button } from '@acme/ui';\n",
      }),
      ...projectFiles('libs/ui', {
        'package.json': manifest('ui'),
        'src/index.ts': 'export const button = 1;\n',
      }),
    });
    writeFiles(root, { 'libs/ui/src/index.ts': 'export const button = 2;\n' });

    expect(run(root).plan.split('\n').slice(1)).toEqual([
      '  run  apps/web (typescript): depends on libs/ui (tsconfig paths)',
      '  run  libs/ui (typescript): 1 changed file',
    ]);
  });
});

describe('JVM projects that depend on each other by coordinates', () => {
  it('runs the Maven service when the library it depends on changes', () => {
    const pom = (artifact, dependencies = '') =>
      `<project><groupId>com.acme</groupId><artifactId>${artifact}</artifactId>` +
      `<dependencies>${dependencies}</dependencies></project>\n`;
    const root = repository({
      'nitpicker.config.json': JSON.stringify({ projects: ['libs/*', 'services/*'] }),
      ...projectFiles('libs/common', { 'pom.xml': pom('common'), 'src/A.java': 'class A {}\n' }),
      ...projectFiles('services/orders', {
        'pom.xml': pom(
          'orders',
          '<dependency><groupId>com.acme</groupId><artifactId>common</artifactId></dependency>',
        ),
        'src/B.java': 'class B {}\n',
      }),
    });
    writeFiles(root, { 'libs/common/src/A.java': 'class A { }\n' });

    expect(run(root).plan.split('\n').slice(1)).toEqual([
      '  run  libs/common (java): 1 changed file',
      '  run  services/orders (java): depends on libs/common (com.acme:common)',
    ]);
  });
});
