import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mts';
import { gradle, kotlinE2eEnabled, kotlinPolicy } from '../test-support/kotlin-e2e-project.mjs';

const fixture = path.resolve(import.meta.dirname, '../../fixtures/kotlin-android-project');
const androidSdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;

describe.skipIf(!kotlinE2eEnabled)('a Gradle build with an Android library in Kotlin', () => {
  let root;
  let findings;

  beforeAll(() => {
    if (androidSdk === undefined) {
      throw new Error('the Android e2e needs an Android SDK: set ANDROID_HOME or ANDROID_SDK_ROOT');
    }
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-android-'));
    cpSync(fixture, root, { recursive: true });
    findings = collectJavaFindings(root, { gradle, policy: kotlinPolicy });
  });

  afterAll(() => {
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs the review rules on the main and unit test sources', () => {
    expect(
      findings
        .filter(({ classification }) => classification === 'enforceable')
        .map(({ rule, path: file }) => `${rule} ${file}`)
        .toSorted(),
    ).toEqual([
      'DisabledTest lib/src/test/kotlin/demo/lib/PricesTest.kt',
      'StaticForwardingWrapper lib/src/main/kotlin/demo/lib/Prices.kt',
    ]);
  });

  it('reports no tool error', () => {
    expect(findings.filter(({ classification }) => classification === 'tool-error')).toEqual([]);
  });
});
