import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import { gradle, kotlinE2eEnabled, kotlinPolicy } from '../test-support/kotlin-e2e-project.mjs';

const fixture = path.resolve(import.meta.dirname, '../../fixtures/kotlin-project');

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset unused declared dependency end to end', () => {
  let root;
  let findings;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-dependencies-'));
    cpSync(fixture, root, { recursive: true });
    findings = collectJavaFindings(root, { gradle, policy: kotlinPolicy });
  });

  afterAll(() => {
    if (root !== undefined) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports a Multiplatform coordinate whose archives sit in its JVM variant module', () => {
    expect(
      findings
        .filter(({ rule }) => rule === 'unused-declared-dependency')
        .map(({ identity, path: file }) => `${identity} ${file}`),
    ).toEqual(['unused:org.jetbrains.kotlinx:kotlinx-coroutines-core build.gradle.kts']);
  });
});
