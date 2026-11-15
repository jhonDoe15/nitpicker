import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings, runJavaDiff } from '../../../adapters/java-diff.mjs';
import { commitBranch, runGitIn } from '../../../adapters/test-support/gradle-e2e.mjs';
import {
  useMavenPresetProject,
  enabled,
  maven,
  fixtures,
  EMPTY_CATCH,
  copyOf,
} from '../../__tests__/maven-preset-project.mts';

describe.skipIf(!enabled)('Java preset on one module of a Maven reactor', () => {
  useMavenPresetProject();
  let repository;

  beforeAll(() => {
    repository = copyOf(path.join(fixtures, 'multi-module'));
    runGitIn(repository, 'init', '-q', '-b', 'main');
    runGitIn(repository, 'add', '-A');
    runGitIn(repository, 'commit', '-q', '-m', 'base');
    commitBranch(repository, 'parser', { 'app/src/main/java/demo/app/Parser.java': EMPTY_CATCH });
  });

  it('gates the module from the reactor in a comparison and reports only that module', () => {
    const result = runJavaDiff({
      repositoryRoot: repository,
      projectRelativePath: 'app',
      requestedBaseRef: 'main',
      maven,
      policy: {},
    });

    expect(
      result.newEnforceable.map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`),
    ).toEqual(
      ['errorprone EmptyCatch', 'pit mutant-nocoverage'].map(
        (finding) => `${finding} src/main/java/demo/app/Parser.java`,
      ),
    );
    expect(
      result.newFindings.filter(({ classification }) => classification === 'tool-error'),
    ).toEqual([]);
  }, 180_000);

  it('gates the module from the reactor with --all and reports only that module', () => {
    const all = collectJavaFindings(path.join(repository, 'app'), { maven, policy: {} });

    const flagged = all.filter(({ tool }) => tool === 'errorprone').map(({ path: file }) => file);

    expect([...new Set(flagged)].toSorted((left, right) => left.localeCompare(right))).toEqual([
      'src/main/java/demo/app/Main.java',
      'src/main/java/demo/app/Parser.java',
    ]);
    expect(all.filter(({ path: file }) => file.startsWith('app/'))).toEqual([]);
    expect(all.filter(({ path: file }) => file.includes('core'))).toEqual([]);
  }, 180_000);
});
