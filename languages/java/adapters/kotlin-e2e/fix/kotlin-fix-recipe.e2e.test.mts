import { describe, expect, it } from 'vitest';
import { fixReport, useFixProject } from './test-support/kotlin-fix-views.mts';

const enabled = process.env['NITPICKER_KOTLIN_E2E'] === '1';
const { fix } = useFixProject();

const SOURCES = 'src/main/kotlin/demo';
const GRADLE = {
  'build.gradle.kts':
    'plugins { kotlin("jvm") version "2.0.21" }\nrepositories { mavenCentral() }\n',
  'settings.gradle.kts': 'rootProject.name = "demo"\n',
};
const MAVEN = {
  'pom.xml':
    '<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>' +
    '<groupId>demo</groupId><artifactId>demo</artifactId><version>1</version></project>\n',
};
const BASE = 'package demo\n\nclass Limits {\n    val limit = 1\n}\n';
const NO_NEWLINE = 'package demo\n\nclass Limits {\n    val limit = 10\n}';
const FIXED = `${NO_NEWLINE}\n`;
const NO_FORMATTER = [
  '  No Kotlin formatter found, so Kotlin files were not rewritten: ',
  'set "kotlin.formatter" to "ktlint" or "ktfmt" in nitpicker.config.json to format them',
].join('');
const LEGACY = 'package demo\n\nclass Legacy {\n    val limit = 5\n}';

describe.skipIf(!enabled)('nitpicker --fix runs the Kotlin final newline recipe', () => {
  it.each([
    { build: 'Gradle', files: GRADLE },
    { build: 'Maven', files: MAVEN },
  ])('appends the missing final newline to a changed file of a $build project', ({ files }) => {
    const result = fix({
      committed: {
        ...files,
        'nitpicker.config.json': '{ "preset": "kotlin", "kotlin": { "formatter": "none" } }\n',
        [`${SOURCES}/Limits.kt`]: BASE,
        [`${SOURCES}/Legacy.kt`]: LEGACY,
      },
      changed: { [`${SOURCES}/Limits.kt`]: NO_NEWLINE },
    });

    expect(
      {
        exitCode: result.exitCode,
        report: fixReport(result.stdout),
        limits: result.read(`${SOURCES}/Limits.kt`),
        legacy: result.read(`${SOURCES}/Legacy.kt`),
        base: result.baseSource(`${SOURCES}/Limits.kt`),
      },
      result.stdout + result.stderr,
    ).toEqual({
      exitCode: 0,
      report: `Fixed files:
${SOURCES}/Limits.kt
Fixed findings:
  ${SOURCES}/Limits.kt:5 detekt/detekt.style.NewLineAtEndOfFile (kotlin-final-newline)
Fix notes:
${NO_FORMATTER}
  --fix could not verify the fixes: no analyzer reports the fixed rules
`,
      limits: FIXED,
      legacy: LEGACY,
      base: BASE,
    });
  });
});
