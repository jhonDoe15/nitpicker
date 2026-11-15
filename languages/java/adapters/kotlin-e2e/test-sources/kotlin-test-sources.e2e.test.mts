import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assigned } from '../test-support/views/assigned.mts';
import {
  commitBranch as commitProjectBranch,
  git,
  runJavaDiff,
  summarize,
} from '../__tests__/kotlin-e2e-project.mts';
import type { DiffResult, FileMap, KotlinPolicy } from '../__tests__/kotlin-e2e-project.mts';
import type { Finding } from '../../../../../shared/values/findings.mts';
import {
  LEGACY_TEST,
  LEGACY_TEST_MOVED,
  SHOUTING_TEST,
  SUPPRESSED_TEST,
} from './test-support/test-sources.mts';

const enabled = process.env['NITPICKER_KOTLIN_E2E'] === '1';
const gradle = process.env['NITPICKER_GRADLE'] ?? 'gradle';
const fixture = path.resolve(import.meta.dirname, '../../fixtures/kotlin-project');
const kotlinPolicy: KotlinPolicy = { preset: 'kotlin' };
const TESTS = 'src/test/kotlin/demo';

let repository: string | undefined;

function runGitIn(root: string, ...args: string[]) {
  git({ root }, ...args);
}

function commitBranch(root: string, name: string, files: FileMap) {
  commitProjectBranch({ root }, name, files);
}

const ofFile = (findings: Finding[], file: string) =>
  summarize(
    findings.filter(
      (finding) => path.basename(finding.path) === file && finding.tool !== 'test-runtime',
    ),
  );

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
    rmSync(assigned(repository, 'repository'), { recursive: true, force: true });
  });

  const diffOf = (policy: KotlinPolicy = kotlinPolicy) =>
    runJavaDiff({
      repositoryRoot: assigned(repository, 'repository'),
      requestedBaseRef: 'main',
      gradle,
      maven: undefined,
      spawn: undefined,
      initScript: undefined,
      policy,
    });
  let result: DiffResult | undefined;
  const defaultDiff = () => (result ??= diffOf());

  it('lints new test code with detekt and ktlint, keeping the rules detekt itself excludes for tests off', () => {
    expect(ofFile(defaultDiff().newEnforceable, 'ShoutingTest.kt')).toEqual([
      'detekt detekt.exceptions.TooGenericExceptionCaught ShoutingTest.kt',
      'detekt detekt.exceptions.TooGenericExceptionCaught ShoutingTest.kt',
      'detekt detekt.potential-bugs.UnsafeCallOnNullableType ShoutingTest.kt',
      'detekt detekt.style.ForbiddenMethodCall ShoutingTest.kt',
      'ktlint ktlint.standard:indent ShoutingTest.kt',
      'ktlint ktlint.standard:indent ShoutingTest.kt',
      'ktlint ktlint.standard:indent ShoutingTest.kt',
    ]);
  });

  it('reports each changed test that runs no production code', () => {
    expect(
      defaultDiff()
        .newEnforceable.filter(({ rule }) => rule === 'no-production-runtime')
        .map(({ path: file }) => path.basename(file))
        .sort(),
    ).toEqual(['ParsingTest.kt', 'ShoutingTest.kt', 'SuppressedTest.kt']);
  });

  it('keeps a legacy test finding baselined when its line moves', () => {
    const { newEnforceable, unchangedFindings } = defaultDiff();

    expect(ofFile(newEnforceable, 'ParsingTest.kt')).toEqual([]);
    expect(ofFile(unchangedFindings, 'ParsingTest.kt')).toEqual([
      'detekt detekt.exceptions.TooGenericExceptionCaught ParsingTest.kt',
    ]);
  });

  it('reports an inline suppression in a test file as the finding, without the detekt finding it hides', () => {
    expect(ofFile(defaultDiff().newEnforceable, 'SuppressedTest.kt')).toEqual([
      'detekt inline-suppression SuppressedTest.kt',
    ]);
  });

  it('lifts the broad-catch ban for test paths with an exception, and nothing else', () => {
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
  });
});
