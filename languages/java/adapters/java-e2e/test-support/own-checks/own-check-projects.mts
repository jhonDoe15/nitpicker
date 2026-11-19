import { readFileSync } from 'node:fs';
import { ownRule } from '../../../../fix/errorprone/own/own-checks.mts';
import { REVIEW_CASES as BASIC_REVIEW_CASES } from './own-check-review-cases.mts';
import { SAFE_CASES as BASIC_SAFE_CASES } from './own-check-safe-cases.mts';
import {
  PERFORMANCE_REVIEW_CASES,
  PERFORMANCE_SAFE_CASES,
} from './performance/performance-cases.mts';
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

export type OwnCheckCase = {
  readonly check: string;
  readonly file: string;
  readonly before: string;
  readonly after: string;
  readonly lines: readonly number[];
  readonly base?: string;
};

const SAFE_CASES: readonly OwnCheckCase[] = [...BASIC_SAFE_CASES, ...PERFORMANCE_SAFE_CASES];
const REVIEW_CASES: readonly OwnCheckCase[] = [...BASIC_REVIEW_CASES, ...PERFORMANCE_REVIEW_CASES];
type Outcome = { files: Record<string, string | undefined>; findings: string[] };

const ALL_CASES: readonly OwnCheckCase[] = [...SAFE_CASES, ...REVIEW_CASES];
const SAFE_FILES = new Set(SAFE_CASES.map(({ file }) => file));

export const PERFORMANCE_CASES: readonly OwnCheckCase[] = [
  ...PERFORMANCE_SAFE_CASES,
  ...PERFORMANCE_REVIEW_CASES,
];

export function ownCheckRepository({
  build,
  config,
  cases = ALL_CASES,
}: {
  build: Readonly<Record<string, string>>;
  config: object;
  cases?: readonly OwnCheckCase[];
}): { committed: Record<string, string>; changed: Record<string, string> } {
  return {
    committed: {
      ...build,
      ...SUPPORT_FILES,
      ...Object.fromEntries(
        cases.flatMap(({ file, base }) => (base === undefined ? [] : [[file, base]])),
      ),
      'nitpicker.config.json': `${JSON.stringify({ ...config, conventions: { 'java.formatter': 'none' } })}\n`,
    },
    changed: Object.fromEntries(cases.map(({ file, before }) => [file, before])),
  };
}

function ruleName(check: string): string {
  const { tool, rule } = ownRule(check);
  return `${tool}/${rule}`;
}

export function rulesOf(cases: readonly OwnCheckCase[]): string[] {
  return [...new Set(cases.map(({ check }) => ruleName(check)))].flatMap((rule) => [
    '--rule',
    rule,
  ]);
}

export const ALL_RULES = rulesOf(ALL_CASES);

export function fixedRuleFiles(cases: readonly OwnCheckCase[]): ReadonlySet<string> {
  return new Set(
    cases
      .filter(({ lines }) => lines.length > 0)
      .map(({ check, file }) => `${ruleName(check)} ${file}`),
  );
}

function findingLines(cases: readonly OwnCheckCase[], recipe: string): string[] {
  return cases.flatMap(({ check, file, lines }) =>
    lines.map((line) => `${file}:${String(line)} ${ruleName(check)} (${recipe})`),
  );
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right);
}

export function expectedOutcome({
  withReview,
  cases = ALL_CASES,
}: {
  withReview: boolean;
  cases?: readonly OwnCheckCase[];
}): Outcome {
  const safe = cases.filter(({ file }) => SAFE_FILES.has(file));
  const review = cases.filter(({ file }) => !SAFE_FILES.has(file));
  const applied = new Set((withReview ? cases : safe).map(({ file }) => file));
  return {
    files: Object.fromEntries(
      cases.map(({ file, before, after }) => [file, applied.has(file) ? after : before]),
    ),
    findings: [
      ...findingLines(safe, 'java-source-safe'),
      ...(withReview ? findingLines(review, 'java-source-review') : []),
    ].toSorted(compareText),
  };
}

const MORE = /^\.\.\. and \d+ more, see (.+)$/u;

function findingsIn(text: string): string[] {
  const lines = text.split('\n');
  const start = lines.indexOf('Fixed findings:');
  const section = start < 0 ? [] : lines.slice(start + 1);
  const end = section.findIndex((line) => !line.startsWith('  '));
  return section.slice(0, end < 0 ? section.length : end).map((line) => line.trim());
}

function fixedFindings(stdout: string): string[] {
  const shown = findingsIn(stdout);
  const logFile = shown.map((line) => MORE.exec(line)?.[1]).find((file) => file !== undefined);
  return logFile === undefined ? shown : findingsIn(readFileSync(logFile, 'utf8'));
}

export function outcomeOf(
  result: { stdout: string; read(file: string): string | undefined },
  cases: readonly OwnCheckCase[] = ALL_CASES,
): Outcome {
  return {
    files: Object.fromEntries(cases.map(({ file }) => [file, result.read(file)])),
    findings: fixedFindings(result.stdout).toSorted(compareText),
  };
}
