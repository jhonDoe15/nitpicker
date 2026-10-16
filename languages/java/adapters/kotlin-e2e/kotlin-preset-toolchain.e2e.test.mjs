import path from 'node:path';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
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
} from './test-support/kotlin-e2e-project.mjs';

describe.skipIf(!kotlinE2eEnabled)('Kotlin preset JDK selection end to end', () => {
  let project;
  let toolchainJdk;

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
    const jdkOf = (branch) => {
      git(project, 'checkout', '-q', branch);
      collectJavaFindings(project.root, { gradle, policy: kotlinPolicy });
      const read = (name) => readFileSync(path.join(project.root, 'build', name), 'utf8');
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
