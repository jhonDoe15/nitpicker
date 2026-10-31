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
const FORMAT_TOOLS = new Set(['ktlint', 'ktfmt']);

function messy(name, body = 'a+b') {
  return `package demo\n\nclass ${name} {\n    fun add( a:Int,b:Int ):Int { return ${body} }\n}\n`;
}

const FUNCTIONS = {
  ktlint: (body) => `    fun add(\n        a: Int,\n        b: Int,\n    ): Int = ${body}\n`,
  ktfmt: (body) => `    fun add(a: Int, b: Int): Int {\n        return ${body}\n    }\n`,
};
const MESSY_ADD = (body) => `    fun add( a:Int,b:Int ):Int { return ${body} }\n`;

function formatted(name, formatter) {
  return `package demo\n\nclass ${name} {\n${FUNCTIONS[formatter]('a + b')}}\n`;
}

function legacy(add) {
  return `package demo\n\nclass Legacy {\n${add}\n    fun mul(a: Int, b: Int): Int = a * b\n\n${MESSY_ADD('a-b').replace('add', 'sub')}}\n`;
}

const LEGACY_NOTES = {
  ktlint: `ktlint formatted only the code around your change in ${SOURCES}/Legacy.kt: the rest was already unformatted before your change`,
  ktfmt: `ktfmt left ${SOURCES}/Legacy.kt as is: already unformatted before your change`,
};

function windows(text) {
  return text.replaceAll('\n', '\r\n');
}

function repository({ build, formatter }) {
  return {
    committed: {
      ...build,
      'nitpicker.config.json': `{ "preset": "kotlin", "kotlin": { "formatter": "${formatter}" } }\n`,
      '.editorconfig': 'root = true\n[*.kt]\nindent_size = 4\n',
      [`${SOURCES}/Changed.kt`]: FORMATTED,
      [`${SOURCES}/Legacy.kt`]: legacy(MESSY_ADD('a+b')),
      [`${SOURCES}/Unchanged.kt`]: messy('Unchanged'),
    },
    changed: {
      [`${SOURCES}/Changed.kt`]: messy('Changed'),
      [`${SOURCES}/Fresh.kt`]: messy('Fresh'),
      [`${SOURCES}/Legacy.kt`]: legacy(MESSY_ADD('a+b+1')),
      [`${SOURCES}/Windows.kt`]: windows(messy('Windows')),
      'tools/Script.kt': messy('Script'),
    },
  };
}

function gateFormatFindings(result) {
  return result
    .newFindings()
    .filter(({ tool }) => FORMAT_TOOLS.has(tool))
    .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`);
}

function outcomeOf(result) {
  return {
    exitCode: result.exitCode,
    report: fixReport(result.stdout),
    files: {
      changed: result.read(`${SOURCES}/Changed.kt`),
      fresh: result.read(`${SOURCES}/Fresh.kt`),
      legacy: result.read(`${SOURCES}/Legacy.kt`),
      windows: result.read(`${SOURCES}/Windows.kt`),
      unchanged: result.read(`${SOURCES}/Unchanged.kt`),
      outsideSourceSets: result.read('tools/Script.kt'),
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
${formatter === 'ktlint' ? `${SOURCES}/Legacy.kt\n` : ''}${SOURCES}/Windows.kt
Fix notes:
  ${formatter} rewrote ${SOURCES}/Changed.kt, ${SOURCES}/Fresh.kt, ${SOURCES}/Windows.kt
  ${LEGACY_NOTES[formatter]}
`,
    files: {
      changed: formatted('Changed', formatter),
      fresh: formatted('Fresh', formatter),
      legacy: legacy(formatter === 'ktlint' ? FUNCTIONS.ktlint('a + b + 1') : MESSY_ADD('a+b+1')),
      windows: windows(formatted('Windows', formatter)),
      unchanged: messy('Unchanged'),
      outsideSourceSets: messy('Script'),
    },
    base: FORMATTED,
  };
}

describe.skipIf(!enabled)('nitpicker --fix for Kotlin', () => {
  it.each(['ktlint', 'ktfmt'])(
    'formats the changed files of a Gradle project with %s, so the gate finds no format finding in them',
    (formatter) => {
      const result = fix({
        ...repository({ build: GRADLE_BUILD, formatter }),
        realAnalyzers: true,
      });

      expect(
        {
          ...outcomeOf(result),
          toolErrors: result.toolErrors(),
          gateFormatFindings: gateFormatFindings(result),
        },
        result.stdout + result.stderr,
      ).toEqual({
        ...expectedOutcome(formatter),
        exitCode: result.exitCode,
        toolErrors: [],
        gateFormatFindings: [],
      });
    },
  );
  it('formats the changed files of a Maven project with ktlint', () => {
    const result = fix(repository({ build: MAVEN_BUILD, formatter: 'ktlint' }));

    expect(outcomeOf(result), result.stdout + result.stderr).toEqual(expectedOutcome('ktlint'));
  });
});
