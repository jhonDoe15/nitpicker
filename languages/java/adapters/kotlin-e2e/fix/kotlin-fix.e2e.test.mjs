import { describe, expect, it } from 'vitest';
import { fixReport, useFixProject } from '../../../../../core/fix/test-support/fix-project.mjs';

const enabled = process.env.NITPICKER_KOTLIN_E2E === '1';
const { fix } = useFixProject();

const SOURCES = 'src/main/kotlin/demo';
const GRADLE_BUILD = {
  'build.gradle.kts':
    'plugins { kotlin("jvm") version "2.0.21" }\nrepositories { mavenCentral() }\n',
  'settings.gradle.kts': 'rootProject.name = "demo"\n',
};
const MAVEN_BUILD = {
  'pom.xml':
    '<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>' +
    '<groupId>demo</groupId><artifactId>demo</artifactId><version>1</version></project>\n',
};
const FORMATTED = 'package demo\n\nclass Changed\n';

function messy(name, body = 'a+b') {
  return `package demo\n\nclass ${name} {\n    fun add( a:Int,b:Int ):Int { return ${body} }\n}\n`;
}

const FUNCTIONS = {
  ktlint: '    fun add(\n        a: Int,\n        b: Int,\n    ): Int = a + b\n',
  ktfmt: '    fun add(a: Int, b: Int): Int {\n        return a + b\n    }\n',
};

function formatted(name, formatter) {
  return `package demo\n\nclass ${name} {\n${FUNCTIONS[formatter]}}\n`;
}

function repository({ build, formatter }) {
  return {
    committed: {
      ...build,
      'nitpicker.config.json': `{ "preset": "kotlin", "kotlin": { "formatter": "${formatter}" } }\n`,
      '.editorconfig': 'root = true\n[*.kt]\nindent_size = 4\n',
      [`${SOURCES}/Changed.kt`]: FORMATTED,
      [`${SOURCES}/Legacy.kt`]: messy('Legacy'),
      [`${SOURCES}/Unchanged.kt`]: messy('Unchanged'),
    },
    changed: {
      [`${SOURCES}/Changed.kt`]: messy('Changed'),
      [`${SOURCES}/Fresh.kt`]: messy('Fresh'),
      [`${SOURCES}/Legacy.kt`]: messy('Legacy', 'a+b+1'),
    },
  };
}

function outcomeOf(result) {
  return {
    exitCode: result.exitCode,
    report: fixReport(result.stdout),
    files: {
      changed: result.read(`${SOURCES}/Changed.kt`),
      fresh: result.read(`${SOURCES}/Fresh.kt`),
      legacy: result.read(`${SOURCES}/Legacy.kt`),
      unchanged: result.read(`${SOURCES}/Unchanged.kt`),
    },
    base: result.baseSource(`${SOURCES}/Changed.kt`),
  };
}

function expectedOutcome(formatter) {
  return {
    exitCode: 0,
    report: `Fixed files:
${SOURCES}/Changed.kt
${SOURCES}/Fresh.kt
Fix notes:
  ${formatter} rewrote ${SOURCES}/Changed.kt, ${SOURCES}/Fresh.kt
  ${formatter} left ${SOURCES}/Legacy.kt as is: already unformatted before your change
`,
    files: {
      changed: formatted('Changed', formatter),
      fresh: formatted('Fresh', formatter),
      legacy: messy('Legacy', 'a+b+1'),
      unchanged: messy('Unchanged'),
    },
    base: FORMATTED,
  };
}

describe.skipIf(!enabled)('nitpicker --fix for Kotlin', () => {
  it.each(['ktlint', 'ktfmt'])(
    'formats the changed files of a Gradle project with %s',
    (formatter) => {
      const result = fix(repository({ build: GRADLE_BUILD, formatter }));

      expect(outcomeOf(result), result.stdout + result.stderr).toEqual(expectedOutcome(formatter));
    },
  );
  it('formats the changed files of a Maven project with ktlint', () => {
    const result = fix(repository({ build: MAVEN_BUILD, formatter: 'ktlint' }));

    expect(outcomeOf(result), result.stdout + result.stderr).toEqual(expectedOutcome('ktlint'));
  });
});
