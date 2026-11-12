import { describe, expect, it } from 'vitest';
import { between } from '../test-support/policy-fixtures.mjs';

const PROJECT = { precedence: ['project', 'nitpicker'] };

describe('build-declared PIT settings the project opted into', () => {
  const SOURCE = { 'src/main/java/A.java': 'class A {}\n' };
  const gradle = (settings, extra = '') => ({
    ...SOURCE,
    'build.gradle': `plugins { id 'java' }\n${extra}pitest {\n${settings}\n}\n`,
  });
  const pom = (mutator) => ({
    ...SOURCE,
    'pom.xml': `<project><build><plugins><plugin><artifactId>pitest-maven</artifactId><configuration><mutators><mutator>${mutator}</mutator></mutators></configuration></plugin></plugins></build></project>`,
  });
  const optedIn = (preset) => ({ preset, tools: { pit: PROJECT } });

  it('counts an edit of the declared settings, with Gradle or Maven', () => {
    expect(
      between({
        base: gradle("  excludedMethods = ['toString']"),
        head: gradle("  excludedMethods = ['toString', 'hashCode']"),
        config: optedIn('kotlin'),
      }).policyLoosenings,
    ).toEqual(['pit project config changed: build.gradle']);
    expect(
      between({ base: pom('STRONGER'), head: pom('ALL'), config: optedIn('java') })
        .policyLoosenings,
    ).toEqual(['pit project config changed: pom.xml']);
  });

  it('stays quiet for other edits of the build file or without the opt-in', () => {
    expect(
      between({
        base: gradle("  excludedMethods = ['toString']"),
        head: gradle("  excludedMethods = ['toString']", 'dependencies { }\n'),
        config: optedIn('java'),
      }).policyLoosenings,
    ).toEqual([]);
    expect(
      between({ base: pom('STRONGER'), head: pom('ALL'), config: { preset: 'java' } })
        .policyLoosenings,
    ).toEqual([]);
  });
});
