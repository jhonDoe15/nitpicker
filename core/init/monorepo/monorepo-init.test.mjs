import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packageVersion } from '../../help/package-version.mts';
import { inspectRepository } from '../../projects/plan/inspect.mjs';
import { init, readText, useProjects } from '../test-support/projects.mjs';

const createProject = useProjects();
const WORKFLOW = '.github/workflows/nitpicker.yml';

const POLYGLOT = {
  'web/package.json': '{"name":"web"}\n',
  'web/src/index.ts': 'export const value = 1;\n',
  'api/pyproject.toml': '[project]\nname = "api"\nversion = "0.1.0"\n',
  'api/src/api/app.py': 'VALUE = 1\n',
  'service/settings.gradle': "rootProject.name = 'service'\n",
  'service/build.gradle': "plugins { id 'java' }\n",
  'service/src/main/java/App.java': 'class App {}\n',
};

function presetsOf(root) {
  const { plan } = inspectRepository({ root });
  return plan.projects.map(({ path: folder, preset, configError }) => ({
    folder,
    preset,
    configError,
  }));
}

describe('init at the top of a repository with several projects', () => {
  it('lists the projects in the top config and writes one workflow for every toolchain', () => {
    const root = createProject(POLYGLOT, { repository: true });

    const result = init(root, '--ci', 'github');

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(readText(root, 'nitpicker.config.json'))).toEqual({
      projects: [
        { path: 'api', preset: 'python' },
        { path: 'service', preset: 'java' },
        { path: 'web', preset: 'typescript' },
      ],
    });
    expect(
      ['web', 'api', 'service'].map((folder) =>
        existsSync(path.join(root, folder, 'nitpicker.config.json')),
      ),
    ).toEqual([false, false, false]);
    expect(presetsOf(root)).toEqual([
      { folder: 'api', preset: 'python', configError: undefined },
      { folder: 'service', preset: 'java', configError: undefined },
      { folder: 'web', preset: 'typescript', configError: undefined },
    ]);
    const workflow = readText(root, WORKFLOW);
    expect(workflow).toContain('uses: actions/setup-python@');
    expect(workflow).toContain('uses: actions/setup-java@');
    expect(workflow).toContain('working-directory: api');
    expect(workflow).toContain(`package: nitpicker@${packageVersion()}`);
    expect(workflow.match(/uses: jhonDoe15\/nitpicker@/gu)).toHaveLength(1);
    expect(result.stdoutText).toContain(
      'nitpicker init: a monorepo of 3 projects, found from their project files',
    );
    expect(result.stdoutText).toContain('created nitpicker.config.json');
    expect(result.stdoutText).toContain(`created ${WORKFLOW}`);
  });
  it('leaves every file it wrote as it is on a second run', () => {
    const root = createProject(POLYGLOT, { repository: true });
    init(root, '--ci', 'github');

    const again = init(root, '--ci', 'github');

    expect(again.exitCode).toBe(0);
    expect(again.stdoutText).toContain('nitpicker.config.json already lists the projects.');
    expect(again.stdoutText).toContain(`${WORKFLOW} is already set up`);
  });
  it('shows the projects list as a diff and keeps a top config that lists none', () => {
    const root = createProject(
      { ...POLYGLOT, 'nitpicker.config.json': '{ "exclude": ["docs/**"] }\n' },
      { repository: true },
    );

    const result = init(root);

    expect(result.exitCode).toBe(1);
    expect(readText(root, 'nitpicker.config.json')).toBe('{ "exclude": ["docs/**"] }\n');
    expect(result.stdoutText).toContain(
      'nitpicker.config.json exists and was not changed. It lists no projects, so a run here would not gate the projects below it.',
    );
    expect(result.stdoutText).toContain('+  "projects": [');
  });
  it('declares the preset only for a workspace package the run would get wrong', () => {
    const root = createProject(
      {
        'package.json': '{"name":"root","private":true,"workspaces":["packages/*"]}\n',
        'package-lock.json': '{"lockfileVersion":3}\n',
        'packages/a/package.json': '{"name":"a"}\n',
        'packages/a/src/index.ts': 'export const a = 1;\n',
        'packages/b/package.json': '{"name":"b"}\n',
        'packages/b/src/index.js': 'export const b = 1;\n',
      },
      { repository: true },
    );

    const result = init(root, '--ci', 'github');

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(root, 'nitpicker.config.json'))).toBe(false);
    expect(existsSync(path.join(root, 'packages/a/nitpicker.config.json'))).toBe(false);
    expect(JSON.parse(readText(root, 'packages/b/nitpicker.config.json'))).toEqual({
      preset: 'javascript',
    });
    expect(readText(root, WORKFLOW).match(/run: npm ci/gu)).toHaveLength(1);
    expect(result.stdoutText).toContain('the top config needs no "projects" list');
  });
  it('keeps a member config that declares another preset and shows the diff', () => {
    const root = createProject(
      {
        'package.json': '{"name":"root","private":true,"workspaces":["packages/*"]}\n',
        'packages/b/package.json': '{"name":"b"}\n',
        'packages/b/src/index.js': 'export const b = 1;\n',
        'packages/c/package.json': '{"name":"c"}\n',
        'packages/c/src/index.ts': 'export const c = 1;\n',
      },
      { repository: true },
    );
    writeFileSync(path.join(root, 'packages/b/nitpicker.config.json'), '{ "exclude": [] }\n');

    const result = init(root);

    expect(result.exitCode).toBe(1);
    expect(readText(root, 'packages/b/nitpicker.config.json')).toBe('{ "exclude": [] }\n');
    expect(result.stdoutText).toContain(
      'packages/b/nitpicker.config.json exists and was not changed.',
    );
  });
});
