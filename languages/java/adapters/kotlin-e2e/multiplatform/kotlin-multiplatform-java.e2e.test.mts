import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gradle, kotlinE2eEnabled, kotlinPolicy } from '../__tests__/kotlin-e2e-project.mts';
import { collectJavaFindings } from '../test-support/views/kotlin-e2e-views.mts';
import type { Finding } from '../../../../../shared/values/findings.mts';

const fixture = path.resolve(
  import.meta.dirname,
  '../../fixtures/kotlin-multiplatform-java-project',
);

describe.skipIf(!kotlinE2eEnabled)('a Kotlin Multiplatform project that applies withJava()', () => {
  let root: string;
  let findings: Finding[];

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-multiplatform-java-'));
    cpSync(fixture, root, { recursive: true });
    findings = collectJavaFindings(root, { gradle, policy: kotlinPolicy });
  });

  afterAll(() => {
    if (typeof root === 'string') {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads the Kotlin sources, which the lint compiles with the common sources of the JVM target', () => {
    const summary = findings
      .filter(({ path: file }) => file.endsWith('.kt') || file.endsWith('.java'))
      .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`);

    expect(summary.toSorted()).toEqual(['kotlinc unchecked src/commonMain/kotlin/demo/Names.kt']);
  });
});
