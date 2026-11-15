import path from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  commitBranch,
  copyJdkWithNativeImage,
  git,
  gradle,
  initializeProject,
  JDK_PROBE,
  kotlinE2eEnabled,
  kotlinPolicy,
  removeProject,
  TOOLCHAIN_PROBE,
} from './__tests__/kotlin-e2e-project.mts';
import {
  analyzeWithIncludedBuild,
  collectJavaFindings,
} from './test-support/views/kotlin-e2e-views.mts';
import type { KotlinProject } from './__tests__/kotlin-e2e-project.mts';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset JDK selection end to end', () => {
  let project: KotlinProject;
  let toolchainJdk: string;

  beforeAll(() => {
    project = initializeProject();
    const buildScript = readFileSync(path.join(project.root, 'build.gradle.kts'), 'utf8');
    commitBranch(project, 'jdk-plain', { 'build.gradle.kts': `${buildScript}${JDK_PROBE}` });
    toolchainJdk = copyJdkWithNativeImage(
      path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-jdk-')), 'jdk'),
    );
    commitBranch(project, 'jdk-toolchain', {
      'build.gradle.kts': `${buildScript}${JDK_PROBE}${TOOLCHAIN_PROBE}`,
      'gradle.properties': `${readFileSync(path.join(project.root, 'gradle.properties'), 'utf8')}org.gradle.java.installations.paths=${toolchainJdk}\n`,
    });
  });
  afterAll(() => {
    removeProject(project);
    rmSync(path.dirname(toolchainJdk), { recursive: true, force: true });
  });
  it('resolves detekt types against the JDK that runs Gradle when the project declares no toolchain, and against its toolchain JDK when it does', () => {
    const jdkOf = (branch: string) => {
      git(project, 'checkout', '-q', branch);
      collectJavaFindings(project.root, { gradle, policy: kotlinPolicy });
      const read = (name: string) => readFileSync(path.join(project.root, 'build', name), 'utf8');
      return { detekt: read('jdk-home.txt'), gradle: read('gradle-jvm-home.txt') };
    };

    const plain = jdkOf('jdk-plain');
    const toolchain = jdkOf('jdk-toolchain');

    expect(plain.detekt).toBe(plain.gradle);
    expect([toolchain.detekt, toolchain.detekt === toolchain.gradle]).toEqual([
      toolchainJdk,
      false,
    ]);
    expect(readFileSync(path.join(project.root, 'build/toolchain-home.txt'), 'utf8')).toBe(
      toolchainJdk,
    );
  });
});

describe.skipIf(!kotlinE2eEnabled)(
  'Kotlin preset on plugins from an included build-logic build',
  () => {
    it('leaves the plugin build unconfigured and analyzes the root build', () => {
      const result = analyzeWithIncludedBuild(
        path.join(import.meta.dirname, '..', 'fixtures', 'build-logic-kotlin'),
        { gradle, policy: kotlinPolicy },
      );

      expect([result.status, result.mutations], result.output).toEqual([0, []]);
      expect(
        result.findings
          .filter((finding) => finding.rule === 'detekt.style.UnusedPrivateProperty')
          .map((finding) => finding.path),
      ).toEqual(['src/main/kotlin/demo/Counter.kt']);
      expect(result.nested).toEqual([]);
    }, 180_000);
  },
);
