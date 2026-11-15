import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../../diff/git/test-support/fixture-files.mts';
import { fixtureGit, useGitFixtures } from '../../../diff/git/test-support/git-repository.mts';
import { projectFiles, useMonorepoFixtures, violation } from '../test-support/monorepo-harness.mjs';

const { repository, run } = useMonorepoFixtures();
const git = useGitFixtures();
const COMMIT = ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q'];

function withSubmodule(root, folder) {
  const { root: library } = git.createGitRepository({ 'package.json': '{"name":"svc"}' });
  fixtureGit(root, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', library, folder]);
  fixtureGit(root, [...COMMIT, '-m', 'add submodule']);
  fixtureGit(root, ['branch', '-f', 'comparison-base', 'HEAD']);
  writeFiles(library, { 'index.js': 'export {};\n' });
  fixtureGit(library, ['add', '-A']);
  fixtureGit(library, [...COMMIT, '-m', 'change']);
  fixtureGit(`${root}/${folder}`, ['-c', 'protocol.file.allow=always', 'pull', '-q']);
  return root;
}

function monorepo(extra = {}) {
  return repository({
    'nitpicker.config.json': JSON.stringify({ projects: ['web', 'api', 'tools/app'] }),
    ...projectFiles('web', {
      'package.json': '{"name":"web","version":"1.0.0"}\n',
      'src/a.ts': 'export const a = 1;\n',
    }),
    ...projectFiles('api', {
      'pyproject.toml': '[project]\nname = "api"\nversion = "0.1.0"\n',
      'src/b.py': 'B = 1\n',
    }),
    ...projectFiles('tools/app', { 'pom.xml': '<project/>\n', 'src/App.java': 'class App {}\n' }),
    ...extra,
  });
}

function statuses(result) {
  return Object.fromEntries(
    result.json('summary.json').projects.map(({ path, status }) => [path, status]),
  );
}

describe('a run at the top of a monorepo', () => {
  it('runs only the projects with changed files and combines the result', () => {
    const root = monorepo();
    writeFiles(root, { 'web/src/a.ts': violation('web-finding') });

    const result = run(root);

    expect(result.exitCode).toBe(1);
    expect(statuses(result)).toEqual({ web: 'failed', api: 'skipped', 'tools/app': 'skipped' });
    expect(result.headings).toEqual(['== web (typescript) ==']);
    expect(result.summary).toBe(
      'Monorepo summary: 1 failed, 2 skipped (3 projects)\n' +
        '  ✖ web (typescript): 1 new enforceable violation\n' +
        '  - 2 projects: no changed files (--details lists them)\n' +
        'Combined report: <reports>/summary.json\n',
    );
    expect(result.json('web/new-findings.json')).toHaveLength(1);
    expect(result.json('summary.json')).toEqual({
      source: 'declared',
      overallStatus: 'completed',
      newEnforceableFindings: 1,
      counts: { projects: 3, run: 1, failed: 1, skipped: 2, passed: 0, errored: 0, incomplete: 0 },
      projects: [
        {
          path: 'web',
          preset: 'typescript',
          status: 'failed',
          reason: '1 changed file',
          overallStatus: 'completed',
          exitCode: 1,
          newEnforceableFindings: 1,
          toolErrors: 0,
          report: 'web',
          summary: 'web/summary.json',
        },
        { path: 'api', preset: 'python', status: 'skipped', reason: 'no changed files' },
        { path: 'tools/app', preset: 'java', status: 'skipped', reason: 'no changed files' },
      ],
      outsideProjects: [],
      notices: [],
      elapsedMs: expect.any(Number),
    });
  });

  it('exits zero and runs nothing when no project changed', () => {
    const result = run(monorepo());

    expect(result.exitCode).toBe(0);
    expect(result.summary).toBe(
      'Monorepo summary: 3 skipped (3 projects)\n' +
        '  - 3 projects: no changed files (--details lists them)\n' +
        'Combined report: <reports>/summary.json\n',
    );
    expect(result.json('summary.json').counts.run).toBe(0);
  });

  it('runs the python and java projects with their own preset when they change', () => {
    const root = monorepo();
    writeFiles(root, { 'api/src/b.py': 'B = 2\n', 'tools/app/src/App.java': 'class App {}\n\n' });

    const result = run(root);

    expect(result.exitCode).toBe(0);
    expect(statuses(result)).toEqual({ web: 'skipped', api: 'passed', 'tools/app': 'passed' });
    expect(result.headings).toEqual(['== api (python) ==', '== tools/app (java) ==']);
  });

  it('notes a changed file in a language the project preset does not check', () => {
    const root = monorepo();
    writeFiles(root, { 'api/scripts/build.ts': 'export const built = 1;\n' });
    const notice =
      '1 changed TypeScript file is in a language the python preset does not check, ' +
      'so nothing checks it: scripts/build.ts. ' +
      'To leave it unchecked, list it in "exclude" in nitpicker.config.json.';

    const result = run(root);

    expect(result.exitCode).toBe(0);
    expect(result.json('api/summary.json').notices).toEqual([notice]);
    expect(readFileSync(`${result.reports}/api/report.txt`, 'utf8')).toContain(notice);
    expect(run(root, [], { workingDirectory: `${root}/api` }).out).toContain(notice);
  });

  it('names a changed Git submodule instead of a plain outside file', () => {
    const root = withSubmodule(monorepo(), 'services/svc');

    const result = run(root);

    expect(result.exitCode).toBe(0);
    expect(result.out).not.toContain('Changed files outside every project');
    expect(result.json('summary.json').notices).toEqual([
      'services/svc is a Git submodule, which this run does not check: ' +
        'run nitpicker inside it to gate its own changes.',
    ]);
  });

  it('refuses a projects entry or a workspace glob that names a Git submodule', () => {
    const listed = withSubmodule(
      monorepo({ 'nitpicker.config.json': JSON.stringify({ projects: ['web', 'services/*'] }) }),
      'services/svc',
    );
    const workspace = withSubmodule(
      repository({
        'package.json': JSON.stringify({ name: 'top', workspaces: ['packages/*'] }),
        ...projectFiles('packages/a', { 'package.json': '{"name":"a"}', 'src/a.ts': '' }),
      }),
      'packages/svc',
    );

    expect(run(listed).exitCode).toBe(2);
    expect(run(listed).err).toBe(
      'nitpicker failed: nitpicker.config.json: "projects" entry services/* names services/svc, a Git submodule. ' +
        'Nitpicker does not gate a submodule from the repository around it: ' +
        'leave it out of "projects" and run nitpicker inside services/svc\n',
    );
    expect(run(workspace).err).toBe(
      'nitpicker failed: nitpicker.config.json: The package.json workspaces cover packages/svc, a Git submodule, ' +
        'which nitpicker does not gate from the repository around it. ' +
        'List the other projects in "projects" of nitpicker.config.json, and run nitpicker inside packages/svc ' +
        'for its own changes\n',
    );
  });

  it('exits 2 when a project fails to run, after running the others', () => {
    const root = monorepo();
    writeFiles(root, {
      'web/src/a.ts': violation('web-finding'),
      'api/nitpicker.config.json': '{"colour":"red"}',
      'api/src/b.py': 'B = 2\n',
    });

    const result = run(root, ['--project', 'api', '--project', 'tools/app']);

    expect(result.exitCode).toBe(2);
    expect(statuses(result)).toEqual({ web: 'skipped', api: 'error', 'tools/app': 'passed' });
    expect(result.err.split('. Allowed keys:')[0]).toBe(
      'nitpicker failed in api: nitpicker.config.json: unknown key "colour"',
    );
  });

  it('prints a project failure once on stderr and its first line in the summary', () => {
    const root = monorepo();
    writeFiles(root, {
      'api/nitpicker.config.json': '{"colour":"red"}',
      'api/src/b.py': 'B = 2\n',
    });

    const result = run(root);
    const message = result.err.replace('nitpicker failed in api: ', '').trim();

    expect(result.exitCode).toBe(2);
    expect(result.err.split(message)).toHaveLength(2);
    expect(result.out.split(message)).toHaveLength(2);
    expect(result.summary).toBe(
      'Monorepo summary: 1 incomplete, 2 skipped (3 projects)\n' +
        `  ! api (python): failed to run: ${message.split('\n')[0]} (api/report.txt)\n` +
        '  - 2 projects: no changed files (--details lists them)\n' +
        'Combined report: <reports>/summary.json\n',
    );
    expect(readFileSync(`${result.reports}/api/report.txt`, 'utf8')).toContain(message);
  });

  it('keeps the console short in a workspace of many packages', () => {
    const packages = Array.from({ length: 12 }, (_, index) => `p${String(index + 1)}`);
    const root = repository({
      'package.json': JSON.stringify({ name: 'top', workspaces: ['packages/*'] }),
      ...Object.assign(
        {},
        ...packages.map((name) =>
          projectFiles(`packages/${name}`, {
            'package.json': JSON.stringify({ name, version: '1.0.0' }),
            'src/index.ts': 'export const value = 1;\n',
          }),
        ),
      ),
    });
    writeFiles(root, { 'packages/p2/src/index.ts': 'export const value = 2;\n' });

    const result = run(root);
    const lines = result.out.split('\n').filter((line) => line !== '');
    const section = lines.findIndex((line) => line.startsWith('== '));
    const after = lines.findIndex((line) => line.startsWith('Monorepo summary:'));

    expect(result.exitCode).toBe(0);
    expect(lines.slice(0, section)).toHaveLength(3);
    expect(lines.slice(after)).toHaveLength(4);
    expect(result.json('summary.json').projects.map(({ path }) => path)).toEqual(
      packages.map((name) => `packages/${name}`),
    );
  });

  it('prefers the failing exit code over an incomplete run', () => {
    const root = monorepo();
    writeFiles(root, {
      'web/src/a.ts': violation('web-finding'),
      'api/nitpicker.config.json': '{"colour":"red"}',
      'api/src/b.py': 'B = 2\n',
    });

    const result = run(root);

    expect(result.exitCode).toBe(1);
    expect(statuses(result)).toEqual({ web: 'failed', api: 'error', 'tools/app': 'skipped' });
  });

  it('names a project only when it is one', () => {
    const result = run(monorepo(), ['--project', 'docs']);

    expect(result.exitCode).toBe(2);
    expect(result.err).toBe(
      'nitpicker failed: --project docs matches no project of this repository by folder, ' +
        'folder from the current one, or package name. nitpicker projects lists the projects.\n',
    );
  });

  it('refuses sharding at the top of a monorepo and says what to do', () => {
    const result = run(monorepo(), ['--shard-count', '2', '--shard-index', '0']);

    expect(result.exitCode).toBe(2);
    expect(result.err).toBe(
      'nitpicker failed: Sharding splits the analyzers of one project, so it does not apply at the top ' +
        'of a monorepo of 3 projects (web, api, tools/app). Run one CI job per project with ' +
        '--project <path>, shard a project from its folder (cd web && nitpicker --shard-count ...), ' +
        'or set "projects": [] in the root nitpicker.config.json to gate the repository as one project.\n',
    );
  });

  it('refuses --json at the top of a monorepo and says what to do', () => {
    const root = monorepo();

    const result = run(root, ['--json']);

    expect(result.exitCode).toBe(2);
    expect(result.err).toBe(
      `nitpicker failed: --json prints the result of one project, and ${root} is a monorepo ` +
        'of 3 projects (web, api, tools/app). Read the combined summary.json in the reports ' +
        'folder, or run --json in a project folder (cd web && nitpicker --json).\n',
    );
  });

  it('refuses paths that belong to the top folder instead of one project', () => {
    const root = monorepo({ 'docs/guide.ts': 'export const guide = 1;\n' });

    const result = run(root, ['docs/guide.ts'], { workingDirectory: root });

    expect(result.exitCode).toBe(2);
    expect(result.err).toBe(
      'nitpicker failed: Paths narrow one project, and these paths belong to the top folder of a ' +
        'monorepo of 3 projects (web, api, tools/app). Choose projects with --project <path>, or ' +
        'give paths in a project folder that has its own package.json or nitpicker.config.json.\n',
    );
  });

  it('keeps one project when run inside it', () => {
    const root = monorepo();
    writeFiles(root, { 'web/src/a.ts': violation('web-finding') });

    const result = run(root, [], { workingDirectory: `${root}/web` });

    expect(result.exitCode).toBe(1);
    expect(result.out).not.toContain('Monorepo');
    expect(result.out).not.toContain('==');
  });
});
