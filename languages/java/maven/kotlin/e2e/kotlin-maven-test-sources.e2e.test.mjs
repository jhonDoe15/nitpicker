import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LEGACY_TEST,
  LEGACY_TEST_MOVED,
  SHOUTING_TEST,
  SUPPRESSED_TEST,
} from '../../../adapters/kotlin-e2e/test-sources/test-support/test-sources.mjs';
import {
  commitBranch,
  git,
  initializeMavenProject,
  kotlinE2eEnabled,
  kotlinPolicy,
  mavenDiffOf,
  removeProject,
  summarize,
  writeAll,
} from './test-support/kotlin-maven-project.mjs';

const TESTS = 'src/test/kotlin/demo';

const ofFile = (findings, file) =>
  summarize(findings.filter((finding) => path.basename(finding.path) === file));

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset on Maven: test sources', () => {
  let project;
  let result;

  beforeAll(() => {
    project = initializeMavenProject();
    writeAll(project, { [`${TESTS}/ParsingTest.kt`]: LEGACY_TEST });
    git(project, 'add', '-A');
    git(project, 'commit', '-q', '-m', 'base with a legacy test finding');
    commitBranch(project, 'tests', {
      [`${TESTS}/ParsingTest.kt`]: LEGACY_TEST_MOVED,
      [`${TESTS}/ShoutingTest.kt`]: SHOUTING_TEST,
      [`${TESTS}/SuppressedTest.kt`]: SUPPRESSED_TEST,
    });
    result = mavenDiffOf(project, 'tests');
  });

  afterAll(() => {
    removeProject(project);
  });

  it('lints new test code with detekt and ktlint, keeping the rules detekt itself excludes for tests off', () => {
    expect(ofFile(result.newEnforceable, 'ShoutingTest.kt')).toEqual([
      'detekt detekt.exceptions.TooGenericExceptionCaught ShoutingTest.kt',
      'detekt detekt.exceptions.TooGenericExceptionCaught ShoutingTest.kt',
      'detekt detekt.potential-bugs.UnsafeCallOnNullableType ShoutingTest.kt',
      'detekt detekt.style.ForbiddenMethodCall ShoutingTest.kt',
      'ktlint ktlint.standard:indent ShoutingTest.kt',
      'ktlint ktlint.standard:indent ShoutingTest.kt',
      'ktlint ktlint.standard:indent ShoutingTest.kt',
    ]);
  });

  it('keeps a legacy test finding baselined when its line moves', () => {
    expect(ofFile(result.newEnforceable, 'ParsingTest.kt')).toEqual([]);
    expect(ofFile(result.unchangedFindings, 'ParsingTest.kt')).toEqual([
      'detekt detekt.exceptions.TooGenericExceptionCaught ParsingTest.kt',
    ]);
  });

  it('reports an inline suppression in a test file as the finding, without the detekt finding it hides', () => {
    expect(ofFile(result.newEnforceable, 'SuppressedTest.kt')).toEqual([
      'detekt inline-suppression SuppressedTest.kt',
    ]);
  });

  it('lifts the broad-catch ban for test paths with an exception, and nothing else', () => {
    const lifted = mavenDiffOf(project, 'tests', {
      policy: {
        ...kotlinPolicy,
        exceptions: [
          {
            rule: 'detekt.exceptions.TooGenericExceptionCaught',
            glob: `${TESTS}/ShoutingTest.kt`,
          },
        ],
      },
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
