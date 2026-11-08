import { describe, expect, it } from 'vitest';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { gradleAppliesKotlin } from './kotlin-plugin.mjs';

const { temporaryRoot } = useGitFixtures();
const CATALOG = 'gradle/libs.versions.toml';

function applies(files) {
  const root = temporaryRoot('nitpicker-kotlin-plugin-');
  writeFiles(root, files);
  return gradleAppliesKotlin(root);
}

describe('the Kotlin JVM plugin in a Gradle build', () => {
  it.each([
    ['kotlin("jvm")', { 'build.gradle.kts': 'plugins {\n    kotlin("jvm") version "2.1.0"\n}\n' }],
    ['the plugin id', { 'build.gradle': "plugins {\n    id 'org.jetbrains.kotlin.jvm'\n}\n" }],
    ['apply plugin', { 'app/build.gradle': "apply plugin: 'kotlin'\n" }],
    ['apply(plugin = ...)', { 'build.gradle.kts': 'apply(plugin = "org.jetbrains.kotlin.jvm")\n' }],
  ])('is applied through %s', (_name, files) => {
    expect(applies(files)).toBe(true);
  });

  it.each([
    ['a table', 'kotlin-jvm = { id = "org.jetbrains.kotlin.jvm", version.ref = "kotlin" }'],
    ['a string', 'kotlin-jvm = "org.jetbrains.kotlin.jvm:2.1.0"'],
  ])('is applied through a libs catalog alias written as %s', (_name, entry) => {
    const files = {
      [CATALOG]: `[versions]\nkotlin = "2.1.0"\n\n[plugins]\n${entry}\n`,
      'build.gradle.kts': 'plugins {\n    alias(libs.plugins.kotlin.jvm)\n}\n',
    };

    expect(applies(files)).toBe(true);
  });

  it('is applied through a catalog that settings declares from another file', () => {
    const files = {
      'settings.gradle.kts':
        'dependencyResolutionManagement {\n  versionCatalogs {\n    create("deps") { from(files("gradle/deps.versions.toml")) }\n  }\n}\n',
      'gradle/deps.versions.toml': '[plugins]\nkotlin = { id = "org.jetbrains.kotlin.jvm" }\n',
      'build.gradle.kts': 'plugins { alias(deps.plugins.kotlin) }\n',
    };

    expect(applies(files)).toBe(true);
  });

  it.each([
    [
      'a precompiled script plugin in buildSrc',
      { 'buildSrc/src/main/kotlin/kotlin-conventions.gradle.kts': 'plugins { kotlin("jvm") }\n' },
    ],
    [
      'a plugin class in build-logic',
      {
        'build-logic/src/main/kotlin/KotlinConventions.kt':
          'class KotlinConventions : Plugin<Project> {\n    override fun apply(target: Project) {\n        target.pluginManager.apply("org.jetbrains.kotlin.jvm")\n    }\n}\n',
      },
    ],
  ])('is applied through %s', (_name, files) => {
    expect(applies(files)).toBe(true);
  });

  it.each([
    [
      'another catalog plugin',
      {
        [CATALOG]: '[plugins]\nspotless = { id = "com.diffplug.spotless" }\n',
        'build.gradle.kts': 'plugins { alias(libs.plugins.spotless) }\n',
      },
    ],
    [
      'a declaration with apply false',
      { 'build.gradle.kts': 'plugins {\n    kotlin("jvm") version "2.1.0" apply false\n}\n' },
    ],
    [
      'the Android plugin, which the kotlin preset does not run on',
      { 'build.gradle.kts': 'plugins { id("org.jetbrains.kotlin.android") }\n' },
    ],
    [
      'a version in pluginManagement',
      {
        'settings.gradle.kts':
          'pluginManagement {\n  plugins { id("org.jetbrains.kotlin.jvm") version "2.1.0" }\n}\n',
        'build.gradle.kts': 'plugins { java }\n',
      },
    ],
    [
      'a catalog it cannot read',
      {
        [CATALOG]: '[plugins\n',
        'build.gradle.kts': 'plugins { alias(libs.plugins.kotlin.jvm) }\n',
      },
    ],
  ])('is not applied with %s', (_name, files) => {
    expect(applies(files)).toBe(false);
  });
});
