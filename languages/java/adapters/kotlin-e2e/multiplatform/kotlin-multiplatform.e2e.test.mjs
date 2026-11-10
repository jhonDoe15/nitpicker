import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import { pathsOutsideProject } from '../../java-e2e/test-support/project-paths.mjs';
import { gradle, kotlinE2eEnabled, kotlinPolicy } from '../test-support/kotlin-e2e-project.mjs';

const fixture = path.resolve(import.meta.dirname, '../../fixtures/kotlin-multiplatform-project');
const PRICES = 'shared/src/commonMain/kotlin/demo/shared/Prices.kt';
const EXCLUDED = [
  'shared/src/commonMain/kotlin/demo/shared/LegacyPrices.kt',
  'app/src/main/kotlin/demo/app/GeneratedNames.kt',
];

const summary = (found) => found.map(({ rule, path: file }) => `${rule} ${file}`);

describe.skipIf(!kotlinE2eEnabled)('a Gradle build with a Kotlin Multiplatform project', () => {
  let root;
  let findings;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-multiplatform-'));
    cpSync(fixture, root, { recursive: true });
    findings = collectJavaFindings(root, { gradle, policy: kotlinPolicy });
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
    const shared = findings.filter(({ path: file }) => file.startsWith('shared/'));

    expect(summary(shared).toSorted()).toEqual([
      `BooleanFlagParameter ${PRICES}`,
      'DisabledTest shared/src/jvmTest/kotlin/demo/shared/PricesTest.kt',
      `StaticForwardingWrapper ${PRICES}`,
      `unused-option ${PRICES}`,
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

  it('notes that only the source checks ran on the Multiplatform project', () => {
    expect(
      findings
        .filter(({ rule }) => rule === 'build-note')
        .map(({ identity, classification }) => `${classification} ${identity.split(':')[0]}`),
    ).toEqual(['descriptive build-note']);
  });

  it('reports no tool error and no coverage finding for the Multiplatform project', () => {
    const shared = findings.filter(
      ({ identity, path: file }) => file.startsWith('shared/') || identity.endsWith('@:shared'),
    );

    expect(shared.filter(({ classification }) => classification === 'tool-error')).toEqual([]);
    expect(shared.filter(({ tool }) => ['crap', 'jacoco', 'pit'].includes(tool))).toEqual([]);
  });
});
