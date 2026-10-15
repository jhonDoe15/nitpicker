import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeJavaSnapshot, GRADLE_FAILURE_RULE } from '../adapters/java-runner.mjs';

const roots = [];

const MAVEN_FAILURE = new RegExp(
  [
    '^Maven compile failed in \\S+: fake maven: -B -q test-compile',
    ' org\\.apache\\.maven\\.plugins:maven-help-plugin:\\S+:effective-pom -Doutput=\\S+',
    ' org\\.apache\\.maven\\.plugins:maven-dependency-plugin:\\S+:build-classpath',
    ' -Dmdep\\.outputFile=target/nitpicker/classpath-compile\\.txt -DincludeScope=compile$',
  ].join(''),
  'u',
);

const GRADLE_FAILURE = new RegExp(
  [
    '^Java preset failed in \\S+: fake maven: --console=plain --quiet --no-configuration-cache',
    ' -Pnitpicker\\.reportDir=\\S+ -I \\S+nitpicker\\.init\\.gradle nitpickerJava$',
  ].join(''),
  'u',
);

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
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform === 'win32')('a Maven project', () => {
  it('is built with Maven and its failure is reported as a tool error naming Maven', () => {
    const { root, command } = mavenProject();

    const [finding] = analyzeJavaSnapshot(root, {
      maven: command,
      gradle: '/nonexistent/gradle',
      policy: { preset: 'java' },
    }).findings;

    expect([finding.rule, finding.classification]).toEqual([GRADLE_FAILURE_RULE, 'tool-error']);
    expect(finding.message).toMatch(MAVEN_FAILURE);
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

    expect(finding.message).toMatch(GRADLE_FAILURE);
  });
});
