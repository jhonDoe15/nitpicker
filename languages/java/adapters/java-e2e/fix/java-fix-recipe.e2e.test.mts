import { describe, expect, it } from 'vitest';
import { fixReport, useFixProject } from '../../../../../core/fix/test-support/fix-project.mts';

const enabled = process.env['NITPICKER_JAVA_E2E'] === '1';
const { fix } = useFixProject();

const SOURCES = 'src/main/java/demo';
const GRADLE = {
  'build.gradle': "plugins { id 'java' }\nrepositories { mavenCentral() }\n",
  'settings.gradle': "rootProject.name = 'demo'\n",
};
const MAVEN = {
  'pom.xml': `<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>demo</groupId>
  <artifactId>demo</artifactId>
  <version>1</version>
  <properties>
    <maven.compiler.source>21</maven.compiler.source>
    <maven.compiler.target>21</maven.compiler.target>
  </properties>
</project>
`,
};
const BASE = 'package demo;\n\npublic class Limits {\n  long limit = 1L;\n}\n';
const LOWERCASE = 'package demo;\n\npublic class Limits {\n  long limit = 10l;\n}\n';
const FIXED = 'package demo;\n\npublic class Limits {\n  long limit = 10L;\n}\n';
const LEGACY = 'package demo;\n\npublic class Legacy {\n  long limit = 5l;\n}\n';

describe.skipIf(!enabled)('nitpicker --fix runs the Java UpperEll recipe', () => {
  it.each([
    { build: 'Gradle', files: GRADLE },
    { build: 'Maven', files: MAVEN },
  ])('fixes a lowercase long suffix in a changed file of a $build project', ({ files }) => {
    const result = fix({
      committed: {
        ...files,
        'nitpicker.config.json': '{ "preset": "java" }\n',
        [`${SOURCES}/Limits.java`]: BASE,
        [`${SOURCES}/Legacy.java`]: LEGACY,
      },
      changed: { [`${SOURCES}/Limits.java`]: LOWERCASE },
    });

    expect(
      {
        exitCode: result.exitCode,
        report: fixReport(result.stdout),
        limits: result.read(`${SOURCES}/Limits.java`),
        legacy: result.read(`${SOURCES}/Legacy.java`),
        base: result.baseSource(`${SOURCES}/Limits.java`),
      },
      result.stdout + result.stderr,
    ).toEqual({
      exitCode: 0,
      report: `Fixed files:
${SOURCES}/Limits.java
Fixed findings:
  ${SOURCES}/Limits.java:4 checkstyle/UpperEll (java-upper-ell)
Fix notes:
  --fix could not verify the fixes: no analyzer reports the fixed rules
`,
      limits: FIXED,
      legacy: LEGACY,
      base: BASE,
    });
  });
});
