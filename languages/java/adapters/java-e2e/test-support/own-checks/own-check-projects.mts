import { REVIEW_CASES } from './own-check-review-cases.mts';
import { SAFE_CASES } from './own-check-safe-cases.mts';
import { DEPENDENCIES, SUPPORT_FILES, type Dependency } from './own-check-support.mts';

const SETTINGS = "rootProject.name = 'demo'\n";

function gradleDependency([group, artifact, version, scope]: Dependency): string {
  const configuration = scope === 'test' ? 'testImplementation' : 'implementation';
  return `  ${configuration} '${group}:${artifact}:${version}'`;
}

function mavenDependency([group, artifact, version, scope]: Dependency): string {
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

type OwnCheckCase = (typeof SAFE_CASES)[number];
type Outcome = { files: Record<string, string | undefined>; findings: string[] };

const ALL_CASES: readonly OwnCheckCase[] = [...SAFE_CASES, ...REVIEW_CASES];

export function ownCheckRepository({
  build,
  config,
}: {
  build: Readonly<Record<string, string>>;
  config: object;
}): { committed: Record<string, string>; changed: Record<string, string> } {
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

function findingLines(cases: readonly OwnCheckCase[], recipe: string): string[] {
  return cases.flatMap(({ check, file, lines }) =>
    lines.map((line) => `${file}:${String(line)} pmd/${check} (${recipe})`),
  );
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

export function expectedOutcome({ withReview }: { withReview: boolean }): Outcome {
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

export function outcomeOf(result: {
  stdout: string;
  read(file: string): string | undefined;
}): Outcome {
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
