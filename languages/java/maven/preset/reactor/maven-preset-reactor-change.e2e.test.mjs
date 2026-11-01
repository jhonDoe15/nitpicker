import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runJavaDiff } from '../../../adapters/java-diff.mjs';
import { commitBranch, runGitIn } from '../../../adapters/test-support/gradle-e2e.mjs';
import {
  useMavenPresetProject,
  enabled,
  maven,
  fixtures,
  EMPTY_CATCH,
  copyOf,
} from '../../__tests__/maven-preset-project.mjs';

describe.skipIf(!enabled)('Java preset on a Maven reactor change', () => {
  useMavenPresetProject();
  it('fails a change only on what it adds', () => {
    const repository = copyOf(path.join(fixtures, 'multi-module'));
    runGitIn(repository, 'init', '-q', '-b', 'main');
    runGitIn(repository, 'add', '-A');
    runGitIn(repository, 'commit', '-q', '-m', 'base');
    commitBranch(repository, 'parser', { 'app/src/main/java/demo/app/Parser.java': EMPTY_CATCH });
    const result = runJavaDiff({
      repositoryRoot: repository,
      requestedBaseRef: 'main',
      maven,
      policy: {},
    });
    const failing = result.newEnforceable.map(
      ({ tool, rule, path: file }) => `${tool} ${rule} ${file}`,
    );

    expect(failing).toEqual(
      ['errorprone EmptyCatch', 'pit mutant-nocoverage'].map(
        (finding) => `${finding} app/src/main/java/demo/app/Parser.java`,
      ),
    );
  }, 180_000);
});
