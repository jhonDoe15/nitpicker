import { describe, expect, it } from 'vitest';
import { between } from '../test-support/policy-fixtures.mts';
import type { PolicyConfig } from '../../types/policy-types.mts';

type Files = Readonly<Record<string, string>>;
type Edit = { readonly base: string; readonly head: string };

type DeclaredSuite = {
  readonly title: string;
  readonly tool: string;
  readonly gradle: (settings: string, extra?: string) => Files;
  readonly pom: (settings: string) => Files;
  readonly gradleEdit: Edit;
  readonly pomEdit: Edit;
};

const SOURCE = { 'src/main/java/A.java': 'class A {}\n' };

const SUITES: readonly DeclaredSuite[] = [
  {
    title: 'build-declared Error Prone flags the project opted into',
    tool: 'errorprone',
    gradle: (flags, extra = '') => ({
      ...SOURCE,
      'build.gradle': `plugins { id 'java' }\n${extra}tasks.withType(JavaCompile) {\n  options.errorprone {\n${flags}\n  }\n}\n`,
    }),
    pom: (flags) => ({
      ...SOURCE,
      'pom.xml': `<project><build><plugins><plugin><artifactId>maven-compiler-plugin</artifactId><configuration><compilerArgs><arg>-Xplugin:ErrorProne ${flags}</arg></compilerArgs></configuration></plugin></plugins></build></project>`,
    }),
    gradleEdit: { base: "    enable('Var')", head: "    enable('Var', 'UnusedVariable')" },
    pomEdit: { base: '-Xep:Var:WARN', head: '-Xep:Var:OFF' },
  },
  {
    title: 'build-declared PIT settings the project opted into',
    tool: 'pit',
    gradle: (settings, extra = '') => ({
      ...SOURCE,
      'build.gradle': `plugins { id 'java' }\n${extra}pitest {\n${settings}\n}\n`,
    }),
    pom: (mutator) => ({
      ...SOURCE,
      'pom.xml': `<project><build><plugins><plugin><artifactId>pitest-maven</artifactId><configuration><mutators><mutator>${mutator}</mutator></mutators></configuration></plugin></plugins></build></project>`,
    }),
    gradleEdit: {
      base: "  excludedMethods = ['toString']",
      head: "  excludedMethods = ['toString', 'hashCode']",
    },
    pomEdit: { base: 'STRONGER', head: 'ALL' },
  },
];

function optedIn(tool: string, preset: string): PolicyConfig {
  return { preset, tools: { [tool]: { precedence: ['project', 'nitpicker'] } } };
}

function loosenings(base: Files, head: Files, config: PolicyConfig): string[] {
  return between({ base, head, config }).policyLoosenings;
}

describe.each(SUITES)('$title', ({ tool, gradle, pom, gradleEdit, pomEdit }) => {
  it('counts an edit of the declared settings, with Gradle or Maven', () => {
    expect(
      loosenings(gradle(gradleEdit.base), gradle(gradleEdit.head), optedIn(tool, 'kotlin')),
    ).toEqual([`${tool} project config changed: build.gradle`]);
    expect(loosenings(pom(pomEdit.base), pom(pomEdit.head), optedIn(tool, 'java'))).toEqual([
      `${tool} project config changed: pom.xml`,
    ]);
  });

  it('stays quiet for other edits of the build file or without the opt-in', () => {
    expect(
      loosenings(
        gradle(gradleEdit.base),
        gradle(gradleEdit.base, 'dependencies { }\n'),
        optedIn(tool, 'java'),
      ),
    ).toEqual([]);
    expect(loosenings(pom(pomEdit.base), pom(pomEdit.head), { preset: 'java' })).toEqual([]);
  });
});
