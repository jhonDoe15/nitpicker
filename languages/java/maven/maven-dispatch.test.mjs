import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeJavaSnapshot, GRADLE_FAILURE_RULE } from '../adapters/java-runner.mjs';

const roots = [];

function mavenProject({ gradleFile } = {}) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-dispatch-')));
  roots.push(root);
  writeFileSync(path.join(root, 'pom.xml'), '<project/>');
  if (gradleFile !== undefined) {
    writeFileSync(path.join(root, gradleFile), '');
  }
  const command = path.join(root, 'fake-mvn.sh');
  writeFileSync(command, '#!/bin/sh\necho "fake maven: $*" >&2\nexit 1\n');
  chmodSync(command, 0o755);
  return { root, command };
}

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe.skipIf(process.platform === 'win32')('a Maven project', () => {
  it('is built with Maven and its failure is reported as a tool error naming Maven', () => {
    const { root, command } = mavenProject();

    const [finding] = analyzeJavaSnapshot(root, {
      maven: command,
      gradle: '/nonexistent/gradle',
      policy: { preset: 'java' },
    }).findings;

    expect(finding.rule).toBe(GRADLE_FAILURE_RULE);
    expect(finding.classification).toBe('tool-error');
    expect(finding.message).toContain('Maven compile failed');
    expect(finding.message).toContain('fake maven: -B -q test-compile');
    expect(finding.message).not.toMatch(/gradle/iu);
  });

  it('refuses the kotlin preset with a message about the build tool, not a Gradle error', () => {
    const { root, command } = mavenProject();

    const [finding] = analyzeJavaSnapshot(root, {
      maven: command,
      policy: { preset: 'kotlin' },
    }).findings;

    expect(finding.message).toBe(
      'The kotlin preset needs a Gradle build; this project builds with Maven',
    );
  });

  it('goes to Gradle when a Gradle build file is next to the pom.xml', () => {
    const { root, command } = mavenProject({ gradleFile: 'build.gradle' });

    const [finding] = analyzeJavaSnapshot(root, {
      maven: command,
      gradle: command,
      policy: { preset: 'java' },
    }).findings;

    expect(finding.message).toContain('Java preset failed');
    expect(finding.message).toContain('--console=plain');
  });
});
