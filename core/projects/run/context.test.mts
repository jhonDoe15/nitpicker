import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { analyzersByProject } from './context.mts';
import type { MonorepoCli, MonorepoPlan, PlanProject } from '../project-types.mts';
import type { Analyzer } from '../../../shared/values/analyzers.mts';

const scratch = mkdtempSync(path.join(tmpdir(), 'nitpicker-analyzer-names-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function project(root: string, folder: string, config: string): PlanProject {
  const absolute = path.join(root, folder);
  mkdirSync(absolute, { recursive: true });
  writeFileSync(path.join(absolute, 'nitpicker.config.json'), config);
  return {
    path: folder,
    absolute,
    repoPath: folder,
    overlay: undefined,
    preset: 'typescript',
    sharedFiles: [],
  };
}

function planOf(configs: Readonly<Record<string, string>>): MonorepoPlan {
  const root = mkdtempSync(path.join(scratch, 'plan-'));
  return {
    root,
    repositoryRoot: root,
    prefix: '.',
    rootConfig: {},
    source: 'declared',
    projects: Object.entries(configs).map(([folder, config]) => project(root, folder, config)),
    undeclared: [],
  };
}

function cliFor(analyzerNames: readonly string[]): MonorepoCli {
  const analyzers = [{ name: 'lint' }, { name: 'format' }].map((analyzer): Analyzer =>
    Object.assign(Object.create(null), analyzer),
  );
  return Object.assign(Object.create(null), { options: { analyzerNames }, analyzers });
}

const UNREADABLE = '{ "disable": 5 }';

describe('the requested analyzers of a monorepo run', () => {
  it('are resolved for the selected projects only', () => {
    const plan = planOf({ app: '{}', docs: '{ "disable": ["lint"] }', broken: UNREADABLE });

    expect([...analyzersByProject(plan, cliFor(['lint']), new Set(['app', 'docs']))]).toEqual([
      ['app', ['lint']],
      ['docs', []],
    ]);
  });

  it('skip a selected project that turned the requested analyzer off', () => {
    const plan = planOf({ app: '{}', docs: '{ "disable": ["lint"] }' });

    expect([...analyzersByProject(plan, cliFor(['lint']), new Set(['docs']))]).toEqual([
      ['docs', []],
    ]);
  });

  it('reject a name no project in the monorepo knows', () => {
    const plan = planOf({ app: '{}', docs: '{}' });

    expect(() => analyzersByProject(plan, cliFor(['lnit']), new Set(['app']))).toThrow(
      /^Unknown --analyzer: lnit\. Known analyzers of the projects in this monorepo: /u,
    );
  });

  it('are still checked against every project when none is selected', () => {
    const plan = planOf({ app: '{}', docs: '{}' });

    expect(() => analyzersByProject(plan, cliFor(['lnit']), new Set())).toThrow(
      /^Unknown --analyzer: lnit\. Known analyzers of the projects in this monorepo: /u,
    );
    expect(analyzersByProject(plan, cliFor([]), new Set()).size).toBe(0);
  });
});
