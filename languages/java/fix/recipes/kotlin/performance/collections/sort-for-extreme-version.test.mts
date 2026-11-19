import { describe, expect, it } from 'vitest';
import { applyRecipe } from '../../test-support/apply-recipe.mts';
import { kotlinProject } from '../../test-support/kotlin-project.mts';
import { sortForExtremeRecipe } from './sort-for-extreme.mts';

const THROWING = 'val a = xs.sorted().first()\n';
const NULLABLE = 'val a = xs.sorted().firstOrNull()\n';

function fixedIn(files: Readonly<Record<string, string>>, text: string): string {
  const project = kotlinProject(files);
  try {
    return applyRecipe(sortForExtremeRecipe, text, undefined, project.root);
  } finally {
    project.remove();
  }
}

describe('sortForExtremeRecipe and the Kotlin version of the project', () => {
  it.each([
    [
      'declares Kotlin 1.6',
      { 'build.gradle.kts': 'plugins {\n    kotlin("jvm") version "1.6.21"\n}\n' },
    ],
    ['declares no Kotlin version', { 'build.gradle.kts': 'plugins {\n    kotlin("jvm")\n}\n' }],
    [
      'declares a new and an old version',
      {
        'build.gradle.kts': 'plugins {\n    kotlin("jvm") version "2.0.0"\n}\n',
        'legacy/build.gradle': "ext.kotlin_version = '1.4.32'\n",
      },
    ],
    [
      'compiles for language version 1.6',
      {
        'build.gradle.kts':
          'plugins {\n    kotlin("jvm") version "1.9.24"\n}\nkotlin { compilerOptions { languageVersion.set(KotlinVersion.KOTLIN_1_6) } }\n',
      },
    ],
  ])('keeps first() of a sorted list in a project that %s', (_case, files) => {
    expect(fixedIn(files, THROWING)).toBe(THROWING);
  });

  it('keeps first() of a sorted list without a project to read', () => {
    expect(applyRecipe(sortForExtremeRecipe, THROWING)).toBe(THROWING);
  });

  it('rewrites firstOrNull() whatever the version is', () => {
    expect(applyRecipe(sortForExtremeRecipe, NULLABLE)).toBe(
      'val a = xs.minWithOrNull(naturalOrder())\n',
    );
  });

  it('rewrites first() in a Maven project on Kotlin 1.9', () => {
    const pom = '<properties>\n  <kotlin.version>1.9.24</kotlin.version>\n</properties>\n';
    expect(fixedIn({ 'pom.xml': pom }, THROWING)).toBe('val a = xs.minWith(naturalOrder())\n');
  });
});
