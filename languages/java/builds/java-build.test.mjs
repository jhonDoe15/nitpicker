import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectJavaBuild, readPinnedTools } from './java-build.mjs';

const roots = [];

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-build-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('detectJavaBuild', () => {
  it.each([
    [[], 'gradle'],
    [['build.gradle'], 'gradle'],
    [['pom.xml'], 'maven'],
    [['pom.xml', 'mvnw'], 'maven'],
    [['pom.xml', 'settings.gradle.kts'], 'gradle'],
    [['pom.xml', 'build.gradle', 'mvnw'], 'maven'],
    [['pom.xml', 'build.gradle', 'mvnw', 'gradlew'], 'gradle'],
  ])('with %j picks %s', (files, expected) => {
    const root = project(Object.fromEntries(files.map((name) => [name, ''])));

    expect(detectJavaBuild(root)).toBe(expected);
  });
});

describe('readPinnedTools', () => {
  it('reads the versions pinned in the Gradle init script', () => {
    expect(Object.keys(readPinnedTools())).toEqual([
      'pmd',
      'spotbugs',
      'googleJavaFormat',
      'palantirJavaFormat',
      'jacoco',
      'checkstyle',
      'lizard',
      'pitest',
      'pitestJunit5',
      'pitestTestng',
      'archunit',
      'asm',
      'detekt',
      'detektKotlin',
      'ktlint',
      'ktfmt',
      'kotlinCompiler',
      'errorProne',
      'nullAway',
    ]);
  });

  it('fails when the init script pins nothing', () => {
    const script = path.join(project({ 'init.gradle': 'def other = 1\n' }), 'init.gradle');

    expect(() => readPinnedTools(script)).toThrow(
      new Error(`No pinned tool versions found in ${script}`),
    );
  });
});
