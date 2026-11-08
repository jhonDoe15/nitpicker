import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { commit, fixtureGit } from '../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../core/diff/git/test-support/fixture-files.mjs';
import { runJavaDiff } from './java-diff.mjs';
import { fakeGradleRun } from './test-support/in-process-gradle.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function repository(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-diff-')));
  roots.push(root);
  fixtureGit(root, ['init', '-q', '--initial-branch=main']);
  writeFiles(root, files);
  commit(root, 'base');
  return root;
}

function diff(root, policy) {
  return runJavaDiff({
    repositoryRoot: root,
    requestedBaseRef: 'main',
    ...fakeGradleRun,
    policy: { preset: 'kotlin', ...policy },
  });
}

const BASE = {
  'build.gradle.kts': 'plugins { kotlin("jvm") }\nktlint\n',
  'src/main/kotlin/demo/K.kt': 'package demo\n\nval a = 1\n',
};
const LISTED = (tool) => ({ toolPrecedence: { [tool]: ['project', 'nitpicker'] } });

describe('the project configs a diff reads when only the head has them', () => {
  it('reads the detekt config from the head checkout for the base snapshot too', () => {
    const root = repository(BASE);
    fixtureGit(root, ['checkout', '-q', '-b', 'feature']);
    writeFiles(root, { 'config/detekt/detekt.yml': 'style:\n  MagicNumber:\n    active: false\n' });
    commit(root, 'add the detekt config');

    expect(diff(root, LISTED('detekt')).newEnforceable).toEqual([]);
  });

  it('reads the .editorconfig of the head checkout for the base snapshot too', () => {
    const root = repository(BASE);
    fixtureGit(root, ['checkout', '-q', '-b', 'feature']);
    writeFiles(root, { '.editorconfig': '[*.kt]\nindent_size = 2\n' });
    commit(root, 'add the editorconfig');

    expect(diff(root, LISTED('ktlint')).newEnforceable).toEqual([]);
  });

  it('still fails when the head has no config either, saying how to fix it', () => {
    const root = repository(BASE);
    fixtureGit(root, ['checkout', '-q', '-b', 'feature']);
    writeFiles(root, { 'src/main/kotlin/demo/Other.kt': 'package demo\n\nval b = 2\n' });
    commit(root, 'change');

    expect(() => diff(root, LISTED('detekt'))).toThrow(
      /"tools.detekt.precedence" lists "project" but a detekt config .* is missing: create it, or remove "project" from tools.detekt.precedence/u,
    );
  });
});

describe('the build-declared settings a diff reads when only the head declares them', () => {
  const JAVA_BASE = {
    'build.gradle': "plugins { id 'java' }\n",
    'src/main/java/demo/A.java': 'package demo;\n\nclass A {}\n',
  };
  const javaDiff = (root, precedence) =>
    diff(root, { preset: 'java', toolPrecedence: { spotbugs: precedence } });

  it('reads the SpotBugs settings of the head build for the base snapshot too', () => {
    const root = repository(JAVA_BASE);
    fixtureGit(root, ['checkout', '-q', '-b', 'feature']);
    writeFiles(root, {
      'build.gradle': "plugins { id 'java' }\nspotbugs { excludeFilter = file('exclude.xml') }\n",
      'exclude.xml': '<FindBugsFilter/>',
    });
    commit(root, 'declare a SpotBugs filter');

    expect(javaDiff(root, ['project', 'nitpicker']).newEnforceable).toEqual([]);
  });

  it('fails when the head build declares no SpotBugs settings either', () => {
    const root = repository(JAVA_BASE);
    fixtureGit(root, ['checkout', '-q', '-b', 'feature']);
    writeFiles(root, { 'src/main/java/demo/B.java': 'package demo;\n\nclass B {}\n' });
    commit(root, 'change');

    expect(() => javaDiff(root, ['nitpicker', 'project'])).toThrow(
      /"tools.spotbugs.precedence" lists "project" but SpotBugs settings in the build/u,
    );
  });
});
