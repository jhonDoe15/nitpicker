import { describe, expect, it } from 'vitest';
import { fixReport, useFixProject } from '../../../../../core/fix/test-support/fix-project.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const { fix } = useFixProject();

const SOURCES = 'src/main/java/demo';
const GRADLE_BUILD = [
  "plugins { id 'java'; id 'com.diffplug.spotless' version '6.25.0' }",
  'repositories { mavenCentral() }',
  'spotless { java { googleJavaFormat() } }',
  '',
].join('\n');
const MAVEN_BUILD = `<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>demo</groupId>
  <artifactId>demo</artifactId>
  <version>1</version>
  <properties>
    <maven.compiler.source>21</maven.compiler.source>
    <maven.compiler.target>21</maven.compiler.target>
  </properties>
  <build>
    <plugins>
      <plugin>
        <groupId>com.diffplug.spotless</groupId>
        <artifactId>spotless-maven-plugin</artifactId>
        <version>2.43.0</version>
        <configuration><java><googleJavaFormat/></java></configuration>
      </plugin>
    </plugins>
  </build>
</project>
`;
const PLAIN_GRADLE_BUILD = "plugins { id 'java' }\nrepositories { mavenCentral() }\n";
const FORMAT_TOOLS = new Set(['google-java-format', 'palantir-java-format']);
const FORMATTED = 'package demo;\n\npublic class Changed {\n  int x = 1;\n}\n';

function messy(name, body = 'a+b') {
  return `package demo;\n\npublic class ${name} {\n    public int  add( int a,int b ){ return ${body}; }\n}\n`;
}

function formatted(name) {
  return `package demo;\n\npublic class ${name} {\n  public int add(int a, int b) {\n    return a + b;\n  }\n}\n`;
}

function repository(build) {
  return {
    committed: {
      ...build,
      'nitpicker.config.json': '{ "preset": "java" }\n',
      [`${SOURCES}/Changed.java`]: FORMATTED,
      [`${SOURCES}/Legacy.java`]: messy('Legacy'),
      [`${SOURCES}/Unchanged.java`]: messy('Unchanged'),
    },
    changed: {
      [`${SOURCES}/Changed.java`]: messy('Changed'),
      [`${SOURCES}/Fresh.java`]: messy('Fresh'),
      [`${SOURCES}/Legacy.java`]: messy('Legacy', 'a+b+1'),
    },
  };
}

function outcomeOf(result) {
  return {
    exitCode: result.exitCode,
    report: fixReport(result.stdout),
    files: {
      changed: result.read(`${SOURCES}/Changed.java`),
      fresh: result.read(`${SOURCES}/Fresh.java`),
      legacy: result.read(`${SOURCES}/Legacy.java`),
      unchanged: result.read(`${SOURCES}/Unchanged.java`),
    },
    base: result.baseSource(`${SOURCES}/Changed.java`),
  };
}

const REWRITTEN = {
  exitCode: 0,
  report: `Fixed files:
${SOURCES}/Changed.java
${SOURCES}/Fresh.java
Fix notes:
  google-java-format rewrote ${SOURCES}/Changed.java, ${SOURCES}/Fresh.java
  google-java-format left ${SOURCES}/Legacy.java as is: already unformatted before your change
`,
  files: {
    changed: formatted('Changed'),
    fresh: formatted('Fresh'),
    legacy: messy('Legacy', 'a+b+1'),
    unchanged: messy('Unchanged'),
  },
  base: FORMATTED,
};

describe.skipIf(!enabled)('nitpicker --fix for Java', () => {
  it('formats the changed files of a Gradle project that runs Spotless', () => {
    const result = fix(
      repository({
        'build.gradle': GRADLE_BUILD,
        'settings.gradle': "rootProject.name = 'demo'\n",
      }),
    );

    expect(outcomeOf(result), result.stdout + result.stderr).toEqual(REWRITTEN);
  });
  it('formats the changed files of a Maven project that runs Spotless', () => {
    const result = fix(repository({ 'pom.xml': MAVEN_BUILD }));

    expect(outcomeOf(result), result.stdout + result.stderr).toEqual(REWRITTEN);
  });
  it('formats with google-java-format when nothing names a formatter, so the gate finds no format finding', () => {
    const debt =
      'package demo;\n\npublic class Legacy {\n  public int  add( int a,int b ){ return a+b; }\n}\n';
    const result = fix({
      committed: {
        'build.gradle': PLAIN_GRADLE_BUILD,
        'settings.gradle': "rootProject.name = 'demo'\n",
        'nitpicker.config.json': '{ "preset": "java" }\n',
        [`${SOURCES}/Changed.java`]: FORMATTED,
        [`${SOURCES}/Legacy.java`]: debt,
      },
      changed: {
        [`${SOURCES}/Changed.java`]: messy('Changed'),
        [`${SOURCES}/Legacy.java`]: debt.replace('a+b', 'a+b+1'),
      },
      realAnalyzers: true,
    });

    expect(
      {
        report: fixReport(result.stdout),
        changed: result.read(`${SOURCES}/Changed.java`),
        legacy: result.read(`${SOURCES}/Legacy.java`),
      },
      result.stdout + result.stderr,
    ).toEqual({
      report: `Fixed files:
${SOURCES}/Changed.java
Fix notes:
  google-java-format rewrote ${SOURCES}/Changed.java
  google-java-format left ${SOURCES}/Legacy.java as is: already unformatted before your change
`,
      changed: formatted('Changed'),
      legacy: debt.replace('a+b', 'a+b+1'),
    });
    expect(
      {
        toolErrors: result.toolErrors(),
        formatFindings: result
          .newFindings()
          .filter(({ tool }) => FORMAT_TOOLS.has(tool))
          .map(({ tool, path: file }) => `${tool} ${file}`),
      },
      result.stdout + result.stderr,
    ).toEqual({ toolErrors: [], formatFindings: [] });
  });
  it('keeps every file when the project turns the Java formatter off', () => {
    const files = repository({ 'pom.xml': MAVEN_BUILD });
    const result = fix({
      ...files,
      committed: {
        ...files.committed,
        'nitpicker.config.json':
          '{ "preset": "java", "conventions": { "java.formatter": "none" } }\n',
      },
    });

    expect(outcomeOf(result), result.stdout + result.stderr).toEqual({
      exitCode: 0,
      report: `Fixed files:
(none)
Fix notes:
  No Java formatter runs for this project (conventions "java.formatter" is "none"), so Java files were not rewritten
`,
      files: {
        changed: messy('Changed'),
        fresh: messy('Fresh'),
        legacy: messy('Legacy', 'a+b+1'),
        unchanged: messy('Unchanged'),
      },
      base: FORMATTED,
    });
  });
});
