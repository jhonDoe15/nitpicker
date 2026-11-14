import { REVIEW_CASES } from './own-check-review-cases.mjs';
import { SAFE_CASES } from './own-check-safe-cases.mjs';
import { DEPENDENCIES, SUPPORT_FILES } from './own-check-support.mjs';

const SETTINGS = "rootProject.name = 'demo'\n";

function gradleDependency([group, artifact, version, scope]) {
  const configuration = scope === 'test' ? 'testImplementation' : 'implementation';
  return `  ${configuration} '${group}:${artifact}:${version}'`;
}

function mavenDependency([group, artifact, version, scope]) {
  return `    <dependency>
      <groupId>${group}</groupId>
      <artifactId>${artifact}</artifactId>
      <version>${version}</version>
      <scope>${scope === 'test' ? 'test' : 'compile'}</scope>
    </dependency>`;
}

export const BUILDS = {
  gradle: {
    'build.gradle': [
      "plugins { id 'java' }",
      'repositories { mavenCentral() }',
      `dependencies {\n${DEPENDENCIES.map(gradleDependency).join('\n')}\n}`,
      '',
    ].join('\n'),
    'settings.gradle': SETTINGS,
  },
  maven: {
    'pom.xml': `<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>demo</groupId>
  <artifactId>demo</artifactId>
  <version>1</version>
  <properties>
    <maven.compiler.source>21</maven.compiler.source>
    <maven.compiler.target>21</maven.compiler.target>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <dependencies>
${DEPENDENCIES.map(mavenDependency).join('\n')}
  </dependencies>
</project>
`,
  },
};

const ALL_CASES = [...SAFE_CASES, ...REVIEW_CASES];

export function ownCheckRepository({ build, config }) {
  return {
    committed: {
      ...build,
      ...SUPPORT_FILES,
      'nitpicker.config.json': `${JSON.stringify({ ...config, conventions: { 'java.formatter': 'none' } })}\n`,
    },
    changed: Object.fromEntries(ALL_CASES.map(({ file, before }) => [file, before])),
  };
}

export const ALL_RULES = ALL_CASES.flatMap(({ check }) => ['--rule', `pmd/${check}`]);

function findingLines(cases, recipe) {
  return cases.flatMap(({ check, file, lines }) =>
    lines.map((line) => `${file}:${line} pmd/${check} (${recipe})`),
  );
}

function compareText(left, right) {
  return left.localeCompare(right);
}

export function expectedOutcome({ withReview }) {
  const applied = new Set((withReview ? ALL_CASES : SAFE_CASES).map(({ file }) => file));
  return {
    files: Object.fromEntries(
      ALL_CASES.map(({ file, before, after }) => [file, applied.has(file) ? after : before]),
    ),
    findings: [
      ...findingLines(SAFE_CASES, 'java-source-safe'),
      ...(withReview ? findingLines(REVIEW_CASES, 'java-source-review') : []),
    ].toSorted(compareText),
  };
}

export function outcomeOf(result) {
  const lines = result.stdout.split('\n');
  const start = lines.indexOf('Fixed findings:');
  const section = start < 0 ? [] : lines.slice(start + 1);
  const end = section.findIndex((line) => !line.startsWith('  '));
  const findings = section.slice(0, end < 0 ? section.length : end).map((line) => line.trim());
  return {
    files: Object.fromEntries(ALL_CASES.map(({ file }) => [file, result.read(file)])),
    findings: findings.toSorted(compareText),
  };
}
