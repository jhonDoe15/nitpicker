import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

function formattedAdd(body = 'a + b') {
  return `  public int add(int a, int b) {\n    return ${body};\n  }\n`;
}

function formatted(name) {
  return `package demo;\n\npublic class ${name} {\n${formattedAdd()}}\n`;
}

function messyAdd(body) {
  return `    public int  add( int a,int b ){ return ${body}; }\n`;
}

function legacy(add) {
  const multiply = '  public int mul(int a, int b) {\n    return a * b;\n  }\n';
  return `package demo;\n\npublic class Legacy {\n${add}\n${multiply}\n${messyAdd('a-b').replace('add', 'sub')}}\n`;
}

function twoSpaced(text) {
  return text.replaceAll('    public', '  public');
}

function windows(text) {
  return text.replaceAll('\n', '\r\n');
}

function repository(build) {
  return {
    committed: {
      ...build,
      'nitpicker.config.json': '{ "preset": "java" }\n',
      [`${SOURCES}/Changed.java`]: FORMATTED,
      [`${SOURCES}/Legacy.java`]: legacy(messyAdd('a+b')),
      [`${SOURCES}/Unchanged.java`]: messy('Unchanged'),
    },
    changed: {
      [`${SOURCES}/Changed.java`]: messy('Changed'),
      [`${SOURCES}/Fresh.java`]: messy('Fresh'),
      [`${SOURCES}/Legacy.java`]: legacy(messyAdd('a+b+1')),
      [`${SOURCES}/Windows.java`]: windows(messy('Windows')),
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
      windows: result.read(`${SOURCES}/Windows.java`),
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
${SOURCES}/Windows.java
Fix notes:
  google-java-format rewrote ${SOURCES}/Changed.java, ${SOURCES}/Fresh.java, ${SOURCES}/Windows.java
  google-java-format left ${SOURCES}/Legacy.java as is: already unformatted before your change
`,
  files: {
    changed: formatted('Changed'),
    fresh: formatted('Fresh'),
    legacy: legacy(messyAdd('a+b+1')),
    windows: windows(formatted('Windows')),
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
    const result = fix({
      committed: {
        'build.gradle': PLAIN_GRADLE_BUILD,
        'settings.gradle': "rootProject.name = 'demo'\n",
        'nitpicker.config.json': '{ "preset": "java" }\n',
        [`${SOURCES}/Changed.java`]: FORMATTED,
        [`${SOURCES}/Legacy.java`]: twoSpaced(legacy(messyAdd('a+b'))),
      },
      changed: {
        [`${SOURCES}/Changed.java`]: messy('Changed'),
        [`${SOURCES}/Legacy.java`]: twoSpaced(legacy(messyAdd('a+b+1'))),
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
      legacy: twoSpaced(legacy(messyAdd('a+b+1'))),
    });
    expect(
      {
        toolErrors: result.toolErrors(),
        layoutFindings: result
          .newFindings()
          .filter(({ tool }) => FORMAT_TOOLS.has(tool) || tool === 'checkstyle')
          .map(({ tool, rule, path: file, line }) => `${tool} ${rule} ${file}:${line}`),
      },
      result.stdout + result.stderr,
    ).toEqual({ toolErrors: [], layoutFindings: [] });
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
        legacy: legacy(messyAdd('a+b+1')),
        windows: windows(messy('Windows')),
        unchanged: messy('Unchanged'),
      },
      base: FORMATTED,
    });
  });
});

describe.skipIf(!enabled)('nitpicker --fix behind a company mirror', () => {
  const temporary = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const directory of temporary.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function directory(prefix) {
    const created = mkdtempSync(path.join(tmpdir(), prefix));
    temporary.push(created);
    return created;
  }

  function fixBehind(url) {
    vi.stubEnv('XDG_CACHE_HOME', directory('nitpicker-fix-mirror-cache-'));
    return fix({
      committed: {
        'settings.gradle.kts': [
          'rootProject.name = "demo"',
          'dependencyResolutionManagement {',
          '    repositories {',
          `        maven { url = uri("${url}") }`,
          '    }',
          '}',
          '',
        ].join('\n'),
        'build.gradle.kts': 'plugins { java }\n',
        'nitpicker.config.json': '{ "preset": "java" }\n',
        [`${SOURCES}/Changed.java`]: FORMATTED,
      },
      changed: { [`${SOURCES}/Changed.java`]: messy('Changed') },
    });
  }

  it('resolves the formatter from the repository the settings declare', () => {
    const result = fixBehind('https://repo.maven.apache.org/maven2/');

    expect(
      { report: fixReport(result.stdout), changed: result.read(`${SOURCES}/Changed.java`) },
      result.stdout + result.stderr,
    ).toEqual({
      report: `Fixed files:
${SOURCES}/Changed.java
Fix notes:
  google-java-format rewrote ${SOURCES}/Changed.java
`,
      changed: formatted('Changed'),
    });
  });
  it('searches only that repository, and says where it resolved from when it fails', () => {
    const mirror = pathToFileURL(directory('nitpicker-fix-empty-mirror-')).href;
    const result = fixBehind(mirror);

    const errors = result.toolErrors();
    expect(
      {
        tools: errors.map(({ tool }) => tool),
        searchedTheMirror: errors.some(({ message }) =>
          message.includes(mirror.replace('file://', 'file:')),
        ),
        searchedMavenCentral: errors.some(({ message }) =>
          message.includes('repo.maven.apache.org'),
        ),
        namedTheSource: errors.some(({ message }) =>
          message.includes('from the repositories declared in settings.gradle.kts)'),
        ),
        changed: result.read(`${SOURCES}/Changed.java`),
      },
      result.stdout + result.stderr,
    ).toEqual({
      tools: ['fix-tools'],
      searchedTheMirror: true,
      searchedMavenCentral: false,
      namedTheSource: true,
      changed: messy('Changed'),
    });
  });
});
