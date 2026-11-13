import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  fixtureGit,
  useGitFixtures,
} from '../../../../core/diff/git/test-support/git-repository.mjs';
import { affectedModules } from './affected/affected-modules.mjs';
import { comparisonRoots, readChangedFiles } from './comparison-changes.mjs';
import { comparisonMutationPlan } from './mutation-plan.mjs';

const LIB = 'lib/src/main/java/demo/lib';
const APP = 'app/src/main/java/demo/app';
const TOOLS = 'tools/src/main/java/demo/tools';
const MODULES = [
  { dir: 'lib', hasSources: true, requires: [] },
  { dir: 'app', hasSources: true, requires: ['lib'] },
  { dir: 'tools', hasSources: true, requires: [] },
];
const CLASS = (name, body) =>
  `package demo;\n\npublic class ${name} {\n  int value() {\n    return ${body};\n  }\n}\n`;
const BASE_FILES = {
  [`${LIB}/Counter.java`]: CLASS('Counter', '1'),
  [`${LIB}/Other.java`]: CLASS('Other', '2'),
  [`${APP}/Greeter.java`]: CLASS('Greeter', '3'),
  [`${TOOLS}/Tool.java`]: CLASS('Tool', '4'),
  'lib/src/test/java/demo/lib/CounterTest.java': 'package demo;\n\nclass CounterTest {}\n',
};

const { createGitRepository } = useGitFixtures();

function comparison(change) {
  const { root } = createGitRepository(BASE_FILES);
  const base = path.join(root, '.base-worktree');
  fixtureGit(root, ['worktree', 'add', '-q', '--detach', '.base-worktree', 'HEAD']);
  for (const [file, contents] of Object.entries(change)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), contents);
  }
  fixtureGit(root, ['add', '-A', '--', ':!.base-worktree']);
  fixtureGit(root, ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'head']);
  const policy = { snapshot: 'head', baselineRoot: base };
  const roots = comparisonRoots(root, policy);
  return {
    head: comparisonMutationPlan(root, policy),
    base: comparisonMutationPlan(base, { snapshot: 'base', policyRoot: root }),
    affected: [
      ...affectedModules({ modules: MODULES, changedFiles: readChangedFiles(roots) }),
    ].sort(),
  };
}

describe('a one-class change in a multi-module build', () => {
  it('mutates that class alone on head and nothing on base, in a module nothing depends on', () => {
    const { head, base, affected } = comparison({ [`${TOOLS}/Tool.java`]: CLASS('Tool', '5') });

    expect(affected).toEqual(['tools']);
    expect(head.scope).toEqual([`${TOOLS}/Tool.java`]);
    expect([...head.changedOnly.keys()]).toEqual([`${TOOLS}/Tool.java`]);
    expect(base.scope).toEqual([]);
  });

  it('mutates only the changed class of a module that others depend on, not its dependents', () => {
    const { head, base, affected } = comparison({ [`${LIB}/Counter.java`]: CLASS('Counter', '9') });

    expect(affected).toEqual(['app', 'lib']);
    expect(head.scope).toEqual([`${LIB}/Counter.java`]);
    expect(base.scope).toEqual([]);
  });

  it('mutates the classes a changed test reaches on both sides, in its own module only', () => {
    const { head, base, affected } = comparison({
      'lib/src/test/java/demo/lib/CounterTest.java':
        'package demo;\n\nclass CounterTest {\n  void again() {}\n}\n',
    });

    expect(affected).toEqual(['app', 'lib']);
    expect(head.scope).toEqual([`${LIB}/Counter.java`]);
    expect(base.scope).toEqual([`${LIB}/Counter.java`]);
  });
});
