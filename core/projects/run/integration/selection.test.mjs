import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../../diff/git/test-support/fixture-files.mjs';
import { projectFiles, useMonorepoFixtures, violation } from '../test-support/monorepo-harness.mjs';

const { repository, run } = useMonorepoFixtures();

const manifest = (name, dependencies = {}) =>
  JSON.stringify({ name, version: '1.0.0', dependencies });

function workspaceRepository(extra = {}) {
  return repository({
    'package.json': JSON.stringify({ name: 'root', workspaces: ['packages/*'] }),
    ...projectFiles('packages/core', {
      'package.json': manifest('core'),
      'src/a.ts': 'export {};\n',
    }),
    ...projectFiles('packages/ui', {
      'package.json': manifest('ui', { core: 'workspace:*' }),
      'src/a.ts': 'export {};\n',
    }),
    ...projectFiles('packages/docs', {
      'package.json': manifest('docs'),
      'src/a.ts': 'export {};\n',
    }),
    ...extra,
  });
}

function statuses(result) {
  return Object.fromEntries(
    result.json('summary.json').projects.map(({ path: project, status }) => [project, status]),
  );
}

describe('projects found without a "projects" setting', () => {
  it('are detected from the workspaces and say so', () => {
    const root = workspaceRepository();
    writeFiles(root, { 'packages/docs/src/a.ts': violation('d') });

    const result = run(root);

    expect(result.plan.split('\n')).toEqual([
      'Monorepo: 3 projects detected (package.json workspaces). ' +
        'List them in "projects" of nitpicker.config.json to choose them; ' +
        '"projects": [] keeps this repository one project.',
      '  skip packages/core (typescript): no changed files',
      '  run  packages/docs (typescript): 1 changed file',
      '  skip packages/ui (typescript): no changed files',
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.json('summary.json').source).toBe('detected');
  });

  it('keep one project when the list is empty', () => {
    const root = workspaceRepository({
      'nitpicker.config.json': '{"projects":[]}',
      ...projectFiles('.'),
    });
    writeFiles(root, { 'packages/docs/src/a.ts': 'export const changed = 1;\n' });

    const result = run(root);

    expect(result.out).not.toContain('Monorepo');
    expect(result.exitCode).toBe(0);
  });
});

describe('projects that depend on a changed one', () => {
  it('run after it changes, and the ones nothing depends on are skipped', () => {
    const root = workspaceRepository();
    writeFiles(root, { 'packages/core/src/a.ts': violation('c') });

    const result = run(root);

    expect(statuses(result)).toEqual({
      'packages/core': 'failed',
      'packages/docs': 'skipped',
      'packages/ui': 'passed',
    });
    expect(result.plan.split('\n').slice(1)).toEqual([
      '  run  packages/core (typescript): 1 changed file',
      '  skip packages/docs (typescript): no changed files',
      '  run  packages/ui (typescript): depends on packages/core',
    ]);
  });

  it('do not pull in the project they depend on', () => {
    const root = workspaceRepository();
    writeFiles(root, { 'packages/ui/src/a.ts': 'export const ui = 1;\n' });

    expect(statuses(run(root))).toEqual({
      'packages/core': 'skipped',
      'packages/docs': 'skipped',
      'packages/ui': 'passed',
    });
  });
});

describe('files outside every project', () => {
  it('run the projects of a toolchain when its lockfile changes', () => {
    const root = workspaceRepository({ 'package-lock.json': '{}\n' });
    writeFiles(root, { 'package-lock.json': '{"lockfileVersion":3}\n', 'README.md': 'hi\n' });

    const result = run(root);

    expect(Object.values(statuses(result))).toEqual(['passed', 'passed', 'passed']);
    expect(result.json('summary.json').outsideProjects).toEqual(['README.md']);
    expect(result.plan.split('\n').slice(1)).toEqual([
      '  run  packages/core (typescript): package-lock.json changed',
      '  run  packages/docs (typescript): package-lock.json changed',
      '  run  packages/ui (typescript): package-lock.json changed',
      'Changed files outside every project, not checked: README.md',
    ]);
  });
});

describe('a project at the repository root', () => {
  it('has its report folder apart from the combined files', () => {
    const root = repository({
      'nitpicker.config.json': JSON.stringify({ projects: ['.', 'api'] }),
      ...projectFiles('.', { 'package.json': manifest('root'), 'src/a.ts': 'export {};\n' }),
      ...projectFiles('api', { 'package.json': manifest('api'), 'src/a.ts': 'export {};\n' }),
    });
    writeFiles(root, { 'src/a.ts': violation('r') });

    const result = run(root);

    expect(result.exitCode).toBe(1);
    expect(statuses(result)).toEqual({ '.': 'failed', api: 'skipped' });
    expect(result.json('_root/new-findings.json')).toHaveLength(1);
    expect(result.json('summary.json').projects[0].report).toBe('_root');
  });
});

describe('--project, --all and --defer-exit', () => {
  it('--project runs the named projects even without changes', () => {
    const result = run(workspaceRepository(), ['--project', './packages/docs/']);

    expect(statuses(result)).toEqual({
      'packages/core': 'skipped',
      'packages/docs': 'passed',
      'packages/ui': 'skipped',
    });
    expect(result.plan.split('\n').slice(1)).toEqual([
      '  skip packages/core (typescript): not requested',
      '  run  packages/docs (typescript): requested with --project',
      '  skip packages/ui (typescript): not requested',
    ]);
  });

  it('--all runs every project against the whole checkout', () => {
    const root = workspaceRepository();
    writeFiles(root, { 'packages/ui/src/a.ts': violation('u') });

    const result = run(root, ['--all'], { withoutBase: true });

    expect(result.exitCode).toBe(1);
    expect(statuses(result)).toEqual({
      'packages/core': 'passed',
      'packages/docs': 'passed',
      'packages/ui': 'failed',
    });
    expect(result.json('packages/ui/findings.json')).toHaveLength(1);
    expect(result.json('summary.json').newEnforceableFindings).toBe(1);
  });

  it('--defer-exit reports failures but exits zero', () => {
    const root = workspaceRepository();
    writeFiles(root, { 'packages/core/src/a.ts': violation('c') });

    const result = run(root, ['--defer-exit']);

    expect(result.exitCode).toBe(0);
    expect(result.json('summary.json').counts.failed).toBe(1);
  });

  it('--project outside a monorepo says what to do', () => {
    const root = repository({
      'package.json': manifest('solo'),
      ...projectFiles('.', { 'src/a.ts': 'export {};\n' }),
    });

    const result = run(root, ['--project', 'web']);

    expect(result.exitCode).toBe(2);
    expect(result.err).toBe(
      'nitpicker failed: --project needs a repository with several projects. ' +
        'List them in "projects" of nitpicker.config.json, or drop --project to check this one project.\n',
    );
  });
});

describe('reports of an earlier run', () => {
  it('are removed for a project that is skipped this time', () => {
    const root = workspaceRepository();
    writeFiles(root, { 'packages/core/src/a.ts': violation('c') });
    const first = run(root);
    const staleSummary = path.join(first.reports, 'packages/ui/summary.json');
    expect(existsSync(staleSummary)).toBe(true);
    writeFiles(root, { 'packages/core/src/a.ts': 'export {};\n' });

    const second = run(root, ['--output', first.reports]);

    expect(second.exitCode).toBe(0);
    expect(existsSync(staleSummary)).toBe(false);
  });
});

describe('commands that work on one project', () => {
  it('refuse to run at the top of a monorepo', () => {
    const root = workspaceRepository();

    const cache = run(root, [], { command: ['cache', 'publish'] });
    const aggregate = run(root, [], { command: ['aggregate'] });

    const expected = (command) =>
      `nitpicker: "${command}" works on one project, and <root> is a monorepo of 3 projects ` +
      '(packages/core, packages/docs, packages/ui). Run it in a project folder ' +
      `(cd packages/core && nitpicker ${command} ...), or set "projects": [] in the root ` +
      'nitpicker.config.json to gate the repository as one project.\n';
    expect([cache.exitCode, cache.err.replaceAll(root, '<root>')]).toEqual([2, expected('cache')]);
    expect([aggregate.exitCode, aggregate.err.replaceAll(root, '<root>')]).toEqual([
      2,
      expected('aggregate'),
    ]);
  });
});
