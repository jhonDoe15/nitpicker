import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe } from 'vitest';
import { runJavaDiff } from '../../../../java-diff.mts';
import { textOf } from '../../../../../../../shared/values/readers.mts';
import { commitBranch, runGitIn } from '../../../../test-support/gradle-e2e.mts';
import { TOUCHED_BASE, TOUCHED_HEAD, touchedLineCases } from './touched-lines-cases.mts';

type Touched = ReturnType<Parameters<typeof touchedLineCases>[0]>;

function touchedOf(outcome: ReturnType<typeof runJavaDiff>): Touched {
  return {
    newFindings: outcome.newFindings.map(({ rule, path: file, message, location }) => ({
      rule,
      path: file,
      message: textOf(message),
      ...(location === undefined ? {} : { location }),
    })),
  };
}

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';

describe.skipIf(!enabled)(
  'Java changed-branch coverage on lines a change did not really edit',
  () => {
    let repository: string;
    let result: ReturnType<typeof runJavaDiff>;

    beforeAll(() => {
      repository = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-touched-'));
      cpSync(path.resolve(import.meta.dirname, '../../../../fixtures/gradle-project'), repository, {
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

    touchedLineCases(() => touchedOf(result));
  },
);
