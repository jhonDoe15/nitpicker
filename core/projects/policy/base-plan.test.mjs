import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { inspectRepository } from '../plan/inspect.mjs';
import { basePlanOf, planInputsChanged } from './base-plan.mjs';

const git = useGitFixtures();

function repository(files) {
  return git.createGitRepository(files, { prefix: 'nitpicker-base-plan-' });
}

function shapeOf(plan) {
  return {
    source: plan.source,
    rootConfig: plan.rootConfig,
    projects: plan.projects.map(({ path, preset, overlay, sharedFiles, configError }) => ({
      path,
      preset,
      overlay,
      sharedFiles,
      configError,
    })),
    undeclared: plan.undeclared,
  };
}

const WORKSPACE = {
  'package.json': '{"private":true,"workspaces":["packages/*"]}',
  'src/root.ts': 'export {};\n',
  'shared/base.json': '{"thresholds":{"fileLines":250}}',
  'packages/a/package.json': '{"name":"a"}',
  'packages/a/nitpicker.config.json': '{"extends":"../../shared/base.json"}',
  'packages/a/src/a.ts': 'export {};\n',
  'packages/b/pyproject.toml': '[project]\nname = "b"\n',
  'packages/b/nitpicker.config.json': '{"preset":"python"}',
  'packages/k/build.gradle.kts': '',
  'packages/k/nitpicker.config.json': '{"preset":"kotlin"}',
  'packages/k/src/A.kt': '',
};

describe('the plan of the base', () => {
  it('is the plan a checkout of the base gives, read from its plan files alone', () => {
    const { root, baseSha } = repository(WORKSPACE);

    const fromTree = basePlanOf({ repositoryRoot: root, prefix: '.', mergeBaseSha: baseSha });

    expect(fromTree.error).toBeUndefined();
    expect(shapeOf(fromTree.plan)).toEqual(shapeOf(inspectRepository({ root }).plan));
  });

  it('reads the base of a monorepo that sits in a folder of the repository', () => {
    const files = Object.fromEntries(
      Object.entries(WORKSPACE).map(([file, text]) => [`apps/${file}`, text]),
    );
    const { root, baseSha } = repository(files);

    const { plan } = basePlanOf({ repositoryRoot: root, prefix: 'apps', mergeBaseSha: baseSha });

    expect(shapeOf(plan)).toEqual(shapeOf(inspectRepository({ root: `${root}/apps` }).plan));
    expect(plan.projects.map(({ path, preset }) => [path, preset])).toEqual([
      ['.', 'typescript'],
      ['packages/a', 'typescript'],
    ]);
  });

  it('returns the error of a base whose projects cannot be read', () => {
    const { root, baseSha } = repository({ 'nitpicker.config.json': '{"projects":["gone"]}' });

    const result = basePlanOf({ repositoryRoot: root, prefix: '.', mergeBaseSha: baseSha });

    expect([result.plan, result.error instanceof Error]).toEqual([undefined, true]);
  });
});

describe('a change that can change the plan', () => {
  function changedAfter(files, changed) {
    const { root, baseSha } = repository(WORKSPACE);
    writeFiles(root, files);
    return planInputsChanged({ repositoryRoot: root, mergeBaseSha: baseSha, changed });
  }

  it('is not an edit of a source file or a new file no plan reads', () => {
    expect(
      changedAfter({ 'packages/a/src/a.ts': 'export const a = 1;\n', 'notes.md': '' }, [
        'notes.md',
        'packages/a/src/a.ts',
      ]),
    ).toBe(false);
  });

  it('is a new project file or a new source file', () => {
    expect(changedAfter({ 'tools/package.json': '{}' }, ['tools/package.json'])).toBe(true);
    expect(changedAfter({ 'packages/k/src/B.java': '' }, ['packages/k/src/B.java'])).toBe(true);
  });
});
