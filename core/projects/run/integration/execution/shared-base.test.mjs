import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeFiles } from '../../../../diff/git/test-support/fixture-files.mjs';
import {
  projectFiles,
  useMonorepoFixtures,
  violation,
} from '../../test-support/monorepo-harness.mjs';

const { repository, run, temporaryRoot } = useMonorepoFixtures();
const WORKER = path.join(import.meta.dirname, '../../execution/test-support/project-worker.mjs');
const BASE_WORKTREE = /built-in: git worktree add --detach \S+\/base [0-9a-f]{40}$/u;

afterEach(() => {
  vi.unstubAllEnvs();
});

function services(extra = {}) {
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

function changeAll(root) {
  writeFiles(root, {
    'web/src/a.ts': violation('web-finding'),
    'api/src/b.py': 'B = 2\n',
    'tools/app/src/App.java': 'class App { }\n',
  });
}

function traced() {
  const file = path.join(temporaryRoot('nitpicker-git-trace-'), 'trace.txt');
  writeFileSync(file, '');
  vi.stubEnv('GIT_TRACE', file);
  return () =>
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => BASE_WORKTREE.test(line));
}

describe('one base worktree for the projects of a monorepo run', () => {
  it('checks out the base once and finds what a run of each project alone finds', () => {
    const root = services();
    changeAll(root);
    const alone = run(root, ['--project', 'web']);
    const baseWorktrees = traced();

    const shared = run(root, ['--jobs', '1']);

    expect(baseWorktrees()).toHaveLength(1);
    expect(shared.exitCode).toBe(1);
    expect(shared.json('web/new-findings.json')).toEqual(alone.json('web/new-findings.json'));
    expect(shared.json('summary.json').projects.map(({ status }) => status)).toEqual([
      'failed',
      'passed',
      'passed',
    ]);
  });
  it('shares the base with projects that run at the same time', async () => {
    const root = services();
    changeAll(root);
    const baseWorktrees = traced();

    const shared = await run(root, ['--jobs', '3'], { projectWorker: WORKER });

    expect(baseWorktrees()).toHaveLength(1);
    expect(shared.exitCode).toBe(1);
  });
  it('gives a project that holds other projects a base of its own', () => {
    const root = services({
      'nitpicker.config.json': JSON.stringify({ projects: ['.', 'web', 'api'] }),
      ...projectFiles('.', { 'package.json': '{"name":"root","version":"1.0.0"}\n' }),
      'src/c.ts': 'export const c = 1;\n',
    });
    writeFiles(root, {
      'src/c.ts': 'export const c = 2;\n',
      'web/src/a.ts': 'export const a = 2;\n',
      'api/src/b.py': 'B = 2\n',
    });
    const baseWorktrees = traced();

    const result = run(root, ['--jobs', '1']);

    expect(result.json('summary.json').projects.map(({ status }) => status)).toEqual([
      'passed',
      'passed',
      'passed',
    ]);
    expect(baseWorktrees()).toHaveLength(2);
  });
});
