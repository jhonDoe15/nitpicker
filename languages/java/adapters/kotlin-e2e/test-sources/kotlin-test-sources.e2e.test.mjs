import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runJavaDiff } from '../../java-diff.mjs';
import {
  commitBranch,
  GRADLE_STEP_TIMEOUT_MS,
  runGitIn,
  summarize,
} from '../../test-support/gradle-e2e.mjs';
import {
  LEGACY_TEST,
  LEGACY_TEST_MOVED,
  SHOUTING_TEST,
  SUPPRESSED_TEST,
} from './test-support/test-sources.mjs';

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixture = path.resolve(import.meta.dirname, '../../fixtures/kotlin-project');
const kotlinPolicy = { preset: 'kotlin' };
const TESTS = 'src/test/kotlin/demo';

let repository;

const ofFile = (findings, file) =>
  summarize(findings.filter((finding) => path.basename(finding.path) === file));

describe.skipIf(!enabled)('Kotlin preset on test sources', () => {
  beforeAll(() => {
    repository = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-tests-'));
    cpSync(fixture, repository, { recursive: true });
    writeFileSync(path.join(repository, '.gitignore'), '/build/\n/.gradle/\n/.kotlin/\n');
    runGitIn(repository, 'init', '-q', '-b', 'main');
    writeFileSync(path.join(repository, TESTS, 'ParsingTest.kt'), LEGACY_TEST);
    runGitIn(repository, 'add', '-A');
    runGitIn(repository, 'commit', '-q', '-m', 'base with a legacy test finding');
    commitBranch(repository, 'tests', {
      [`${TESTS}/ParsingTest.kt`]: LEGACY_TEST_MOVED,
      [`${TESTS}/ShoutingTest.kt`]: SHOUTING_TEST,
      [`${TESTS}/SuppressedTest.kt`]: SUPPRESSED_TEST,
    });
  });

  afterAll(() => {
    rmSync(repository, { recursive: true, force: true });
  });

  const diffOf = (policy = kotlinPolicy) =>
    runJavaDiff({ repositoryRoot: repository, requestedBaseRef: 'main', gradle, policy });
  let result;
  const defaultDiff = () => (result ??= diffOf());

  it(
    'lints new test code with detekt and ktlint, keeping the rules detekt itself excludes for tests off',
    () => {
      expect(ofFile(defaultDiff().newEnforceable, 'ShoutingTest.kt')).toEqual([
        'detekt detekt.exceptions.TooGenericExceptionCaught ShoutingTest.kt',
        'detekt detekt.potential-bugs.UnsafeCallOnNullableType ShoutingTest.kt',
        'detekt detekt.style.ForbiddenMethodCall ShoutingTest.kt',
        'ktlint ktlint.standard:indent ShoutingTest.kt',
        'ktlint ktlint.standard:indent ShoutingTest.kt',
        'ktlint ktlint.standard:indent ShoutingTest.kt',
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'keeps a legacy test finding baselined when its line moves',
    () => {
      const { newEnforceable, unchangedFindings } = defaultDiff();

      expect(ofFile(newEnforceable, 'ParsingTest.kt')).toEqual([]);
      expect(ofFile(unchangedFindings, 'ParsingTest.kt')).toEqual([
        'detekt detekt.exceptions.TooGenericExceptionCaught ParsingTest.kt',
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'reports an inline suppression in a test file as the finding, without the detekt finding it hides',
    () => {
      expect(ofFile(defaultDiff().newEnforceable, 'SuppressedTest.kt')).toEqual([
        'detekt inline-suppression SuppressedTest.kt',
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'lifts the broad-catch ban for test paths with an exception, and nothing else',
    () => {
      const lifted = diffOf({
        ...kotlinPolicy,
        exceptions: [
          {
            rule: 'detekt.exceptions.TooGenericExceptionCaught',
            glob: `${TESTS}/ShoutingTest.kt`,
          },
        ],
      });

      expect(ofFile(lifted.newEnforceable, 'ShoutingTest.kt')).toEqual([
        'detekt detekt.potential-bugs.UnsafeCallOnNullableType ShoutingTest.kt',
        'detekt detekt.style.ForbiddenMethodCall ShoutingTest.kt',
        'ktlint ktlint.standard:indent ShoutingTest.kt',
        'ktlint ktlint.standard:indent ShoutingTest.kt',
        'ktlint ktlint.standard:indent ShoutingTest.kt',
      ]);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
