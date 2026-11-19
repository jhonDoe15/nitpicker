import { describe, expect, it } from 'vitest';
import { recipeProject } from '../source/test-support/recipe-project.mts';
import { unrunTestsRecipe as recipe } from './unrun-recipe.mts';
import {
  FAILSAFE_POM,
  GRADLE_GROOVY,
  GRADLE_KTS,
  GROOVY_TASK,
  JUPITER_TEST,
  KTS_TASK,
  ORDER_INTEGRATION_PATH,
  ORDER_INTEGRATION_TEST,
  ORDER_IT,
  ORDER_IT_PATH,
  POM,
  RULE,
  SET_TEST_PATH,
} from './test-support/unrun-sources.mts';

const ACCEPTED = /\.(?:java|kt)$|(?:^|\/)build\.gradle(?:\.kts)?$/u;

function run(files: Record<string, string>) {
  return recipeProject({ files, rule: RULE, accepted: ACCEPTED });
}

describe('unrunTestsRecipe', () => {
  it('is a review recipe for test-runtime/test-not-run in the Java preset', () => {
    expect([recipe.safety, recipe.scope, recipe.presets, recipe.rules]).toEqual([
      'review',
      'project',
      ['java'],
      [{ tool: 'test-runtime', rule: 'test-not-run' }],
    ]);
  });

  it('renames an integration test that a Maven module without Failsafe never collects', () => {
    const { result, read, exists } = run({ 'pom.xml': POM, [ORDER_IT_PATH]: ORDER_IT });

    expect(result.toolErrors).toEqual([]);
    expect(result.fixedFindings).toEqual([`${ORDER_IT_PATH}:1 ${RULE} (java-unrun-tests)`]);
    expect(exists(ORDER_IT_PATH)).toBe(false);
    expect(read(ORDER_INTEGRATION_PATH)).toBe(ORDER_INTEGRATION_TEST);
  });

  it('registers a Test task for the source set in a Kotlin DSL Gradle build', () => {
    const { result, read } = run({ 'build.gradle.kts': GRADLE_KTS, [SET_TEST_PATH]: JUPITER_TEST });

    expect(result.toolErrors).toEqual([]);
    expect(read('build.gradle.kts')).toBe(GRADLE_KTS + KTS_TASK);
  });

  it('registers a Test task for the source set in a Groovy DSL Gradle build of a module', () => {
    const { result, read } = run({
      'app/build.gradle': GRADLE_GROOVY,
      [`app/${SET_TEST_PATH}`]: JUPITER_TEST,
    });

    expect(result.toolErrors).toEqual([]);
    expect(read('app/build.gradle')).toBe(GRADLE_GROOVY + GROOVY_TASK);
  });

  it('leaves a class that Failsafe already runs', () => {
    const { result, read, exists } = run({ 'pom.xml': FAILSAFE_POM, [ORDER_IT_PATH]: ORDER_IT });

    expect(result.notes).toEqual([
      `${RULE} in ${ORDER_IT_PATH}:1: left as is, a pom of the project configures Failsafe or Surefire`,
    ]);
    expect(read(ORDER_IT_PATH)).toBe(ORDER_IT);
    expect(exists(ORDER_INTEGRATION_PATH)).toBe(false);
  });
});
