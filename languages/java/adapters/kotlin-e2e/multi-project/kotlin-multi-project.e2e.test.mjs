import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import { pathsOf, pathsOutsideProject } from '../../java-e2e/test-support/project-paths.mjs';
import { gradle, kotlinE2eEnabled, kotlinPolicy } from '../test-support/kotlin-e2e-project.mjs';

const fixture = path.resolve(import.meta.dirname, '../../fixtures/kotlin-multi-project');

describe.skipIf(!kotlinE2eEnabled)('a Kotlin Gradle build of two projects', () => {
  let root;
  let findings;

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-multi-project-'));
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

  it('puts the folder of each project in the paths of the Kotlin and the Java tools', () => {
    expect(pathsOf(findings, 'detekt')).toContain('lib/src/main/kotlin/demo/lib/Counter.kt');
    expect(pathsOf(findings, 'ktlint')).toContain('app/src/main/kotlin/demo/app/Main.kt');
    expect(pathsOf(findings, 'pmd')).toContain('lib/src/main/java/demo/lib/Bridge.java');
  });
});
