import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe } from 'vitest';
import { runJavaDiff } from '../../../java-diff.mjs';
import { commitBranch, runGitIn } from '../../../test-support/gradle-e2e.mjs';
import { TOUCHED_BASE, TOUCHED_HEAD, touchedLineCases } from './touched-lines-cases.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';

describe.skipIf(!enabled)(
  'Java changed-branch coverage on lines a change did not really edit',
  () => {
    let repository;
    let result;

    beforeAll(() => {
      repository = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-touched-'));
      cpSync(path.resolve(import.meta.dirname, '../../../fixtures/gradle-project'), repository, {
        recursive: true,
      });
      writeFileSync(path.join(repository, '.gitignore'), 'build/\n.gradle/\n');
      for (const [file, text] of Object.entries(TOUCHED_BASE)) {
        writeFileSync(path.join(repository, file), text);
      }
      runGitIn(repository, 'init', '-q', '-b', 'main');
      runGitIn(repository, 'add', '-A');
      runGitIn(repository, 'commit', '-q', '-m', 'legacy uncovered branches');
      commitBranch(repository, 'touches', TOUCHED_HEAD);
      result = runJavaDiff({ repositoryRoot: repository, requestedBaseRef: 'main', gradle });
    }, 180_000);

    afterAll(() => {
      rmSync(repository, { recursive: true, force: true });
    });

    touchedLineCases(() => result);
  },
);
