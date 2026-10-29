import { describe, expect, it } from 'vitest';
import { toTree } from '../../../tree.mjs';
import { detectLanguageConfigEdits } from '../config-files.mjs';

const detect = (before, after) => detectLanguageConfigEdits(toTree(before), toTree(after));
const paths = (found) => found.map((shortcut) => `${shortcut.kind} ${shortcut.path}`);

const KTS = 'plugins {\n    kotlin("jvm")\n}\n\ntasks.test {\n    useJUnitPlatform()\n}\n';
const withKts = (extra) => ({ 'build.gradle.kts': `${KTS}\n${extra}\n` });

describe('Gradle forms that turn tests off', () => {
  it.each([
    ['named<Test>', 'tasks.named<Test>("test") {\n    exclude("**/*")\n}'],
    ['getByName', 'tasks.getByName<Test>("test") {\n    enabled = false\n}'],
    ['test.configure', 'tasks.test.configure {\n    enabled = false\n}'],
    ['named with configure', 'tasks.named("test").configure {\n    enabled = false\n}'],
    ['check disabled', 'tasks.named("check") {\n    enabled = false\n}'],
    ['withType configureEach', 'tasks.withType<Test>().configureEach {\n    enabled = false\n}'],
    ['a bare enabled flag', 'test.enabled = false'],
    ['a task enabled flag', 'tasks.test.enabled = false'],
    ['onlyIf false', 'tasks.test.get().onlyIf { false }'],
    ['an emptied check', 'check.setDependsOn([])'],
    ['excluded task names', 'gradle.startParameter.excludedTaskNames.add("test")'],
    [
      'the junit deactivate property',
      'tasks.test {\n    systemProperty("junit.jupiter.conditions.deactivate", "*")\n}',
    ],
    ['a project prefix', 'project.tasks.named("test") {\n    enabled = false\n}'],
  ])('reports %s', (_name, extra) => {
    expect(paths(detect(withKts(''), withKts(extra)))).toEqual([
      'build-config-edit build.gradle.kts',
    ]);
  });

  it('reports the same forms in a Groovy script', () => {
    const before = { 'build.gradle': 'test {\n  useJUnitPlatform()\n}\n' };
    const after = { 'build.gradle': 'test {\n  useJUnitPlatform()\n}\ntest.onlyIf { false }\n' };
    expect(paths(detect(before, after))).toEqual(['build-config-edit build.gradle']);
  });
});

describe('Build files other than build.gradle and pom.xml', () => {
  it.each([
    ['settings.gradle', 'gradle.startParameter.excludedTaskNames << "test"'],
    ['settings.gradle.kts', 'gradle.startParameter.excludedTaskNames.add("test")'],
    ['gradle/test.gradle', 'test { exclude "**/*" }'],
    [
      'gradle/quality.gradle',
      'jacocoTestCoverageVerification { violationRules { rule { limit { minimum = 0.1 } } } }',
    ],
    ['buildSrc/src/main/kotlin/conventions.gradle.kts', 'tasks.test { enabled = false }'],
    ['buildSrc/src/main/kotlin/Conventions.kt', 'project.tasks.named("test") { enabled = false }'],
    ['gradle.properties', 'systemProp.junit.jupiter.conditions.deactivate=*'],
    ['.mvn/maven.config', '-DskipTests'],
  ])('reports a disabling line added to %s', (file, line) => {
    expect(paths(detect({ [file]: '# base\n' }, { [file]: `# base\n${line}\n` }))).toEqual([
      `build-config-edit ${file}`,
    ]);
  });

  it('reports a testExcludes entry of the compiler plugin', () => {
    const pom = (extra) =>
      `<project><build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId>${extra}</plugin></plugins></build></project>`;
    const after = pom(
      '<configuration><testExcludes><testExclude>**/*</testExclude></testExcludes></configuration>',
    );
    expect(paths(detect({ 'pom.xml': pom('') }, { 'pom.xml': after }))).toEqual([
      'build-config-edit pom.xml',
    ]);
  });

  it('leaves an unrelated property alone', () => {
    const before = { 'gradle.properties': 'org.gradle.jvmargs=-Xmx1g\n' };
    const after = { 'gradle.properties': 'org.gradle.jvmargs=-Xmx2g\norg.gradle.parallel=true\n' };
    expect(detect(before, after)).toEqual([]);
  });
});

describe('Adding a plugin or a dependency', () => {
  it.each([
    ['build.gradle', "plugins {\n  id 'java'\n}\n", "plugins {\n  id 'java'\n  id 'jacoco'\n}\n"],
    [
      'build.gradle',
      'dependencies {\n}\n',
      "dependencies {\n  testImplementation 'com.tngtech.archunit:archunit-junit5:1.4.1'\n}\n",
    ],
    [
      'build.gradle.kts',
      'dependencies {\n}\n',
      'dependencies {\n  testImplementation(libs.archunit)\n}\n',
    ],
    [
      'build.gradle.kts',
      'plugins {\n}\n',
      'plugins {\n  id("io.gitlab.arturbosch.detekt") version "1.23.7"\n}\n',
    ],
    ['build.gradle', '', "checkstyle {\n  toolVersion = '10.20.0'\n}\n"],
    [
      'pom.xml',
      '<project><dependencies></dependencies></project>',
      '<project><dependencies><dependency><groupId>com.tngtech.archunit</groupId><artifactId>archunit-junit5</artifactId></dependency></dependencies></project>',
    ],
    [
      'pom.xml',
      '<project><build><plugins></plugins></build></project>',
      '<project><build><plugins><plugin><groupId>org.jacoco</groupId><artifactId>jacoco-maven-plugin</artifactId><version>0.8.12</version></plugin></plugins></build></project>',
    ],
  ])('is not reported in %s', (file, before, after) => {
    expect(detect({ [file]: before }, { [file]: after })).toEqual([]);
  });

  it.each([
    [
      'build.gradle',
      '',
      'jacocoTestCoverageVerification {\n  violationRules { rule { limit { minimum = 0.0 } } }\n}\n',
    ],
    ['build.gradle', '', 'pmd {\n  ignoreFailures = true\n}\n'],
    ['build.gradle', "plugins {\n  id 'jacoco'\n}\n", 'plugins {\n}\n'],
  ])('is reported in %s when it loosens a check or removes one', (file, before, after) => {
    expect(paths(detect({ [file]: before }, { [file]: after }))).toEqual([
      `build-config-edit ${file}`,
    ]);
  });
});
