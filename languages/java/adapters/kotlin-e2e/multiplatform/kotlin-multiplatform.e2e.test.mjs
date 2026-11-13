import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import { pathsOutsideProject } from '../../java-e2e/test-support/project-paths.mjs';
import { gradle, kotlinE2eEnabled, kotlinPolicy } from '../test-support/kotlin-e2e-project.mjs';
import { byText } from '../../../../../shared/text-order/by-text.mjs';

const fixture = path.resolve(import.meta.dirname, '../../fixtures/kotlin-multiplatform-project');
const PRICES = 'shared/src/commonMain/kotlin/demo/shared/Prices.kt';
const NAMES = 'shared/src/commonMain/kotlin/demo/shared/Names.kt';
const GRADES = 'shared/src/commonMain/kotlin/demo/shared/Grades.kt';
const BUMP = 'shared/src/jvmMain/kotlin/demo/shared/Bump.kt';
const EXCLUDED = [
  'shared/src/commonMain/kotlin/demo/shared/LegacyPrices.kt',
  'app/src/main/kotlin/demo/app/GeneratedNames.kt',
];

const summary = (found) => found.map(({ rule, path: file }) => `${rule} ${file}`);
const withoutCoverage = (found) =>
  found.filter(({ tool }) => !['jacoco', 'crap', 'pit'].includes(tool));

describe.skipIf(!kotlinE2eEnabled)('a Gradle build with a Kotlin Multiplatform project', () => {
  let root;
  let findings;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-multiplatform-'));
    cpSync(fixture, root, { recursive: true });
    findings = collectJavaFindings(root, {
      gradle,
      policy: { ...kotlinPolicy, kotlin: { formatter: 'ktlint' } },
    });
  });

  afterAll(() => {
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('names every finding by a file or folder relative to the build root', () => {
    expect(pathsOutsideProject(root, findings)).toEqual([]);
  });

  it('runs the review rules and the source checks on the common and JVM source sets', () => {
    const shared = findings.filter(({ path: file }) => file.startsWith('shared/') && file !== BUMP);

    expect(summary(withoutCoverage(shared)).toSorted()).toEqual([
      `BooleanFlagParameter ${PRICES}`,
      'DisabledTest shared/src/jvmTest/kotlin/demo/shared/PricesTest.kt',
      `StaticForwardingWrapper ${PRICES}`,
      `unchecked ${NAMES}`,
      `unused-option ${PRICES}`,
    ]);
  });

  it('runs detekt with the JVM classpath and the format check on the Multiplatform project', () => {
    const bump = findings.filter(({ path: file }) => file === BUMP);

    expect(summary(withoutCoverage(bump)).toSorted()).toEqual([
      `detekt.style.ForbiddenMethodCall ${BUMP}`,
      `ktlint.standard:blank-line-before-declaration ${BUMP}`,
      `ktlint.standard:fun-keyword-spacing ${BUMP}`,
      `ktlint.standard:no-multi-spaces ${BUMP}`,
    ]);
  });

  it('reads the calls of the JVM project that set a default of the Multiplatform project', () => {
    expect(findings.filter(({ identity }) => identity === 'unused-option:greet.loud')).toEqual([]);
  });

  it('reads no call of a file that the build excludes from its source set', () => {
    expect(findings.filter(({ identity }) => identity === 'unused-option:pad.width')).toHaveLength(
      1,
    );
  });

  it('reports no finding on a file that the build excludes from its source set', () => {
    expect(findings.filter(({ path: file }) => EXCLUDED.includes(file))).toEqual([]);
  });

  it('names what ran and what did not on the Multiplatform project', () => {
    expect(
      findings
        .filter(({ rule }) => rule === 'build-note')
        .map(({ identity, classification, message }) => [
          classification,
          identity.split(':')[0],
          message,
        ]),
    ).toEqual([
      [
        'descriptive',
        'build-note',
        'The Android or Multiplatform project :shared gets the source checks, the format check, detekt, ' +
          'the kotlinc lint, the tests of the JVM target, coverage and CRAP; mutation testing, the .java ' +
          'files do not run on it.',
      ],
    ]);
  });

  it('runs the tests of the JVM target and reads their coverage and CRAP', () => {
    const covered = findings.filter(({ path: file }) => file.startsWith('shared/'));

    expect(
      covered
        .filter(({ tool }) => tool === 'jacoco')
        .map(({ rule, path: file }) => `${rule} ${file}`)
        .toSorted(byText),
    ).toEqual([
      `changed-branch-coverage ${GRADES}`,
      `changed-branch-coverage ${PRICES}`,
      `line-coverage ${GRADES}`,
      `line-coverage ${NAMES}`,
      `line-coverage ${PRICES}`,
      `line-coverage ${BUMP}`,
      `uncovered-method ${GRADES}`,
      `uncovered-method ${NAMES}`,
      `uncovered-method ${PRICES}`,
      `uncovered-method ${PRICES}`,
      `uncovered-method ${PRICES}`,
      `uncovered-method ${PRICES}`,
      `uncovered-method ${PRICES}`,
      `uncovered-method ${BUMP}`,
      `uncovered-method ${BUMP}`,
    ]);
    expect(covered.filter(({ tool }) => tool === 'crap').map(({ path: file }) => file)).toEqual([
      GRADES,
    ]);
  });

  it('reports no tool error for the Multiplatform project', () => {
    const shared = findings.filter(
      ({ identity, path: file }) => file.startsWith('shared/') || identity.endsWith('@:shared'),
    );

    expect(shared.filter(({ classification }) => classification === 'tool-error')).toEqual([]);
    expect(shared.filter(({ tool }) => tool === 'pit')).toEqual([]);
  });
});
