import { describe, expect, it } from 'vitest';
import { between } from '../test-support/policy-fixtures.mjs';

const PROJECT = { precedence: ['project', 'nitpicker'] };

describe('build-declared Error Prone flags the project opted into', () => {
  const SOURCE = { 'src/main/java/A.java': 'class A {}\n' };
  const gradle = (flags, extra = '') => ({
    ...SOURCE,
    'build.gradle': `plugins { id 'java' }\n${extra}tasks.withType(JavaCompile) {\n  options.errorprone {\n${flags}\n  }\n}\n`,
  });
  const pom = (flags) => ({
    ...SOURCE,
    'pom.xml': `<project><build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId><configuration><compilerArgs><arg>-Xplugin:ErrorProne ${flags}</arg></compilerArgs></configuration></plugin></plugins></build></project>`,
  });
  const optedIn = (preset) => ({ preset, tools: { errorprone: PROJECT } });

  it('counts an edit of the declared flags, with Gradle or Maven', () => {
    expect(
      between({
        base: gradle("    enable('Var')"),
        head: gradle("    enable('Var', 'UnusedVariable')"),
        config: optedIn('kotlin'),
      }).policyLoosenings,
    ).toEqual(['errorprone project config changed: build.gradle']);
    expect(
      between({
        base: pom('-Xep:Var:WARN'),
        head: pom('-Xep:Var:OFF'),
        config: optedIn('java'),
      }).policyLoosenings,
    ).toEqual(['errorprone project config changed: pom.xml']);
  });

  it('stays quiet for other edits of the build file or without the opt-in', () => {
    expect(
      between({
        base: gradle("    enable('Var')"),
        head: gradle("    enable('Var')", 'dependencies { }\n'),
        config: optedIn('java'),
      }).policyLoosenings,
    ).toEqual([]);
    expect(
      between({
        base: pom('-Xep:Var:WARN'),
        head: pom('-Xep:Var:OFF'),
        config: { preset: 'java' },
      }).policyLoosenings,
    ).toEqual([]);
  });
});
