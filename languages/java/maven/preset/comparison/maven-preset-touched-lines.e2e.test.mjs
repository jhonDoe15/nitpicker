import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe } from 'vitest';
import { runJavaDiff } from '../../../adapters/java-diff.mjs';
import { commitBranch, runGitIn } from '../../../adapters/test-support/gradle-e2e.mjs';
import {
  TOUCHED_BASE,
  TOUCHED_HEAD,
  touchedLineCases,
} from '../../../adapters/java-e2e/preset/comparison/touched-lines-cases.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const maven = process.env.NITPICKER_MAVEN;
const gradleFixture = path.join(import.meta.dirname, '../../../adapters/fixtures/gradle-project');
const pom = path.join(import.meta.dirname, '../../fixtures/single');

function createRepository() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-touched-'));
  cpSync(gradleFixture, root, { recursive: true });
  cpSync(pom, root, { recursive: true });
  for (const name of ['build.gradle', 'settings.gradle']) {
    rmSync(path.join(root, name));
  }
  writeFileSync(path.join(root, '.gitignore'), 'target/\n');
  for (const [file, text] of Object.entries(TOUCHED_BASE)) {
    writeFileSync(path.join(root, file), text);
  }
  runGitIn(root, 'init', '-q', '-b', 'main');
  runGitIn(root, 'add', '-A');
  runGitIn(root, 'commit', '-q', '-m', 'legacy uncovered branches');
  commitBranch(root, 'touches', TOUCHED_HEAD);
  return root;
}

describe.skipIf(!enabled)(
  'Java changed-branch coverage on a Maven build, on lines a change did not really edit',
  () => {
    let repository;
    let result;

    beforeAll(() => {
      repository = createRepository();
      result = runJavaDiff({
        repositoryRoot: repository,
        requestedBaseRef: 'main',
        maven,
        policy: { preset: 'java' },
      });
    }, 180_000);

    afterAll(() => {
      rmSync(repository, { recursive: true, force: true });
    });

    touchedLineCases(() => result);
  },
);
