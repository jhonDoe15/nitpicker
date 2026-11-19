import { afterEach, describe, expect, it } from 'vitest';
import { kotlinProject } from '../test-support/kotlin-project.mts';
import { declaredKotlinVersions, hasNonNullExtremes } from './kotlin-version.mts';

const cleanups: (() => void)[] = [];

function rootOf(files: Readonly<Record<string, string>>): string {
  const { root, remove } = kotlinProject(files);
  cleanups.push(remove);
  return root;
}

afterEach(() => {
  for (const remove of cleanups.splice(0)) {
    remove();
  }
});

describe('declaredKotlinVersions', () => {
  it.each([
    ['build.gradle.kts', 'plugins {\n  kotlin("jvm") version "1.9.24"\n}\n', [[1, 9]]],
    ['build.gradle.kts', 'plugins { id("org.jetbrains.kotlin.jvm") version "2.0.0" }\n', [[2, 0]]],
    ['build.gradle', "plugins { id 'org.jetbrains.kotlin.jvm' version '1.6.21' }\n", [[1, 6]]],
    ['build.gradle', "classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:1.5.31'\n", [[1, 5]]],
    [
      'gradle/libs.versions.toml',
      '[versions]\nkotlin = "1.8.22"\ncoroutines = "1.4.0"\n',
      [[1, 8]],
    ],
    ['gradle.properties', 'kotlinVersion=1.7.10\nkotlin.code.style=official\n', [[1, 7]]],
    ['build.gradle', "ext.kotlin_version = '1.4.32'\n", [[1, 4]]],
    ['pom.xml', '<properties><kotlin.version>1.9.0</kotlin.version></properties>\n', [[1, 9]]],
    ['build.gradle.kts', 'languageVersion.set(KotlinVersion.KOTLIN_1_6)\n', [[1, 6]]],
    ['build.gradle.kts', 'kotlinOptions { languageVersion = "1.5" }\n', [[1, 5]]],
    ['build.gradle.kts', 'languageVersion.set(JavaLanguageVersion.of(17))\n', []],
    ['build.gradle.kts', 'freeCompilerArgs.add("-api-version=1.6")\n', [[1, 6]]],
    ['build.gradle.kts', 'freeCompilerArgs += listOf("-language-version", "1.5")\n', [[1, 5]]],
    ['pom.xml', '<arg>-language-version</arg>\n<arg>1.6</arg>\n', [[0, 0]]],
    ['gradle.properties', 'kotlinPluginVersion=1.5.0\n', [[0, 0]]],
    ['build.gradle.kts', '// kotlin("jvm") version "1.3.0"\n', []],
    ['gradle/libs.versions.toml', 'kotlin-logging = "3.0.5"\nkotlinx-coroutines = "1.6.4"\n', []],
  ])('reads %s: %s', (name, text, expected) => {
    expect(declaredKotlinVersions(rootOf({ [name]: text }))).toEqual(expected);
  });

  it('knows nothing outside a git work tree or without a project', () => {
    expect(declaredKotlinVersions(undefined)).toBeUndefined();
  });
});

describe('hasNonNullExtremes', () => {
  it('holds when every declared version is 1.7 or later', () => {
    const root = rootOf({
      'build.gradle.kts': 'plugins { kotlin("jvm") version "1.9.24" }\n',
      'app/build.gradle.kts': 'kotlinOptions { apiVersion = "1.7" }\n',
    });

    expect(hasNonNullExtremes(root)).toBe(true);
  });

  it.each([
    ['one module pins an older language version', 'kotlinOptions { languageVersion = "1.6" }\n'],
    ['no build file declares a version', 'plugins { id("my.convention") }\n'],
  ])('does not hold when %s', (_case, text) => {
    const root = rootOf({ 'app/build.gradle.kts': text });

    expect(hasNonNullExtremes(root)).toBe(false);
    expect(hasNonNullExtremes(undefined)).toBe(false);
  });
});
