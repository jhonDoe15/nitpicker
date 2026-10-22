import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../../diff/git/test-support/fixture-files.mjs';
import { projectFiles, useMonorepoFixtures, violation } from '../test-support/monorepo-harness.mjs';

const { repository, run } = useMonorepoFixtures();

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
        '  - api (python): skipped (no changed files)\n' +
        '  - tools/app (java): skipped (no changed files)\n' +
        'Combined report: <reports>/summary.json\n',
    );
    expect(result.json('web/new-findings.json')).toHaveLength(1);
    expect(result.json('summary.json')).toEqual({
      source: 'declared',
      overallStatus: 'completed',
      newEnforceableFindings: 1,
      counts: { projects: 3, run: 1, failed: 1, skipped: 2, passed: 0, errored: 0 },
      projects: [
        {
          path: 'web',
          preset: 'typescript',
          status: 'failed',
          reason: '1 changed file',
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
      elapsedMs: expect.any(Number),
    });
  });

  it('exits zero and runs nothing when no project changed', () => {
    const result = run(monorepo());

    expect(result.exitCode).toBe(0);
    expect(result.summary).toBe(
      'Monorepo summary: 3 skipped (3 projects)\n' +
        '  - web (typescript): skipped (no changed files)\n' +
        '  - api (python): skipped (no changed files)\n' +
        '  - tools/app (java): skipped (no changed files)\n' +
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
      'nitpicker failed: --project names docs, which is not a project of this repository. ' +
        'Projects: web, api, tools/app\n',
    );
  });

  it('refuses sharding at the top of a monorepo and says what to do', () => {
    const result = run(monorepo(), ['--shard-count', '2', '--shard-index', '0']);

    expect(result.exitCode).toBe(2);
    expect(result.err).toBe(
      'nitpicker failed: Sharding splits the analyzers of one project, ' +
        'so it does not apply at the top of a monorepo. ' +
        'Run one CI job per project with --project <path> (repeatable), ' +
        'or run nitpicker inside each project.\n',
    );
  });

  it('keeps one project when run inside it', () => {
    const root = monorepo();
    writeFiles(root, { 'web/src/a.ts': violation('web-finding') });

    const result = run(root, [], { currentProjectRoot: `${root}/web` });

    expect(result.exitCode).toBe(1);
    expect(result.out).not.toContain('Monorepo');
    expect(result.out).not.toContain('==');
  });
});
