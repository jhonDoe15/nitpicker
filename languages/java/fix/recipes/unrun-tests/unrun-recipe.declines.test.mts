import { describe, expect, it } from 'vitest';
import { recipeProject } from '../source/test-support/recipe-project.mts';
import {
  FAILSAFE_POM,
  GRADLE_KTS,
  JUPITER_TEST,
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
  const { result, read } = recipeProject({ files, rule: RULE, accepted: ACCEPTED });
  return { notes: result.notes, errors: result.toolErrors, read };
}

describe('unrunTestsRecipe declines', () => {
  it('leaves a class that another file mentions by name', () => {
    const suite = 'package shop;\n\nclass Suite {\n  Class<?> first = OrderIT.class;\n}\n';
    const { notes, read } = run({
      'pom.xml': POM,
      [ORDER_IT_PATH]: ORDER_IT,
      'src/test/java/shop/Suite.java': suite,
    });

    expect(notes).toEqual([
      `${RULE} in ${ORDER_IT_PATH}:1: left as is, src/test/java/shop/Suite.java mentions OrderIT`,
    ]);
    expect(read(ORDER_IT_PATH)).toBe(ORDER_IT);
  });

  it('leaves a class whose collected name is taken', () => {
    const { notes, read } = run({
      'pom.xml': POM,
      [ORDER_IT_PATH]: ORDER_IT,
      [ORDER_INTEGRATION_PATH]: ORDER_INTEGRATION_TEST,
    });

    expect(notes).toEqual([
      `${RULE} in ${ORDER_IT_PATH}:1: left as is, ${ORDER_INTEGRATION_PATH} exists`,
    ]);
    expect(read(ORDER_IT_PATH)).toBe(ORDER_IT);
  });

  it('leaves a source set that the build file does not declare', () => {
    const { notes, read } = run({
      'build.gradle.kts': 'plugins {\n    java\n}\n',
      [SET_TEST_PATH]: JUPITER_TEST,
    });

    expect(notes).toEqual([
      `${RULE} in ${SET_TEST_PATH}:1: left as is, integrationTest is not declared in this build file`,
    ]);
    expect(read('build.gradle.kts')).toBe('plugins {\n    java\n}\n');
  });

  it('leaves a source set that the build file already gives a test task', () => {
    const build = `${GRADLE_KTS}\ntasks.register<Test>("integrationTest") {\n}\n`;
    const { notes, read } = run({ 'build.gradle.kts': build, [SET_TEST_PATH]: JUPITER_TEST });

    expect(notes).toEqual([
      `${RULE} in ${SET_TEST_PATH}:1: left as is, this build file already configures a test task for integrationTest`,
    ]);
    expect(read('build.gradle.kts')).toBe(build);
  });

  it('leaves an abstract base class, which no runner collects', () => {
    const base = ORDER_IT.replace('class OrderIT', 'abstract class OrderIT').replace(
      '  OrderIT() {}\n\n',
      '',
    );
    const { notes, read } = run({ 'pom.xml': POM, [ORDER_IT_PATH]: base });

    expect(notes).toEqual([]);
    expect(read(ORDER_IT_PATH)).toBe(base);
  });

  it('leaves a source set that a root script configures for every project', () => {
    const { notes, read } = run({
      'build.gradle.kts': 'subprojects {\n}\n',
      'app/build.gradle.kts': GRADLE_KTS,
      [`app/${SET_TEST_PATH}`]: JUPITER_TEST,
    });

    expect(notes).toEqual([
      `${RULE} in app/${SET_TEST_PATH}:1: left as is, another build script may already configure a test task for it`,
    ]);
    expect(read('app/build.gradle.kts')).toBe(GRADLE_KTS);
  });

  it('leaves a class when a pom of another module configures Failsafe', () => {
    const { notes, read } = run({
      'pom.xml': POM,
      'parent/pom.xml': FAILSAFE_POM,
      [ORDER_IT_PATH]: ORDER_IT,
    });

    expect(notes).toEqual([
      `${RULE} in ${ORDER_IT_PATH}:1: left as is, a pom of the project configures Failsafe or Surefire`,
    ]);
    expect(read(ORDER_IT_PATH)).toBe(ORDER_IT);
  });

  it('leaves a class whose name Surefire already collects', () => {
    const path = 'src/test/java/shop/ITunesTest.java';
    const text = ORDER_IT.replaceAll('OrderIT', 'ITunesTest');
    const { notes, read } = run({ 'pom.xml': POM, [path]: text });

    expect(notes).toEqual([]);
    expect(read(path)).toBe(text);
  });

  it('adds the task once, with no note on the next pass', () => {
    const { notes } = run({ 'build.gradle.kts': GRADLE_KTS, [SET_TEST_PATH]: JUPITER_TEST });

    expect(notes).toEqual([]);
  });

  it('leaves a module whose pom configures Surefire includes', () => {
    const pom = POM.replace(
      '</project>',
      '  <build><plugins><plugin><artifactId>maven-surefire-plugin</artifactId></plugin></plugins></build>\n</project>',
    );
    const { notes, read } = run({ 'pom.xml': pom, [ORDER_IT_PATH]: ORDER_IT });

    expect(notes).toEqual([
      `${RULE} in ${ORDER_IT_PATH}:1: left as is, a pom of the project configures Failsafe or Surefire`,
    ]);
    expect(read(ORDER_IT_PATH)).toBe(ORDER_IT);
  });

  it('does not take a lambda parameter of the build file for the source set', () => {
    const build = 'plugins {\n    java\n}\n\nlist.forEach { it.run() }\n';
    const path = 'src/it/java/shop/OrderTest.java';
    const { notes, read } = run({ 'build.gradle.kts': build, [path]: JUPITER_TEST });

    expect(notes).toEqual([
      `${RULE} in ${path}:1: left as is, it is not declared in this build file`,
    ]);
    expect(read('build.gradle.kts')).toBe(build);
  });
});
