import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Finding } from '../../../../../shared/values/findings.mts';
import { fieldOf, parseJson, textsOf } from '../../../../../shared/values/readers.mts';
import { callUntyped } from '../../typed/java-values.mts';
import { findingsOf } from '../../kotlin/rules/test-support/findings-list.mts';
import { REVIEW_TOOL, findingFactory } from '../../kotlin/review-rules/review-finding.mts';
import { springFindings as untypedSpringFindings } from '../../kotlin/review-rules/spring/spring-findings.mts';
import { SPRING_RULES } from '../../kotlin/review-rules/spring/spring-messages.mts';
import {
  VALIDATION_TARGET_RULE,
  validationTargetFindings as untypedValidationTargetFindings,
} from '../../kotlin/review-rules/validation/validation-targets.mts';
import { git, writeAll, type KotlinProject } from './kotlin-e2e-project.mts';

type SpringOptions = {
  readonly finding: unknown;
  readonly manifest: { readonly spring: boolean; readonly kotlinAllOpen: unknown };
  readonly projectFiles: unknown;
  readonly projectRoot: string;
  readonly javaRoots: string[];
};

function springFindings(files: unknown, options: SpringOptions): Finding[] {
  return findingsOf(callUntyped(untypedSpringFindings, files, options));
}

function validationTargetFindings(files: unknown, options: { finding: unknown }): Finding[] {
  return findingsOf(callUntyped(untypedValidationTargetFindings, files, options));
}

const FIXTURES = path.resolve(import.meta.dirname, '../../fixtures');
const FIXTURE = path.join(FIXTURES, 'kotlin-spring-project');
const SOURCE_BASE_FILES = new Set([
  'src/main/kotlin/shop/ShopApplication.kt',
  'src/main/java/shop/LegacyRepository.java',
]);
const SPRING = new Set([...SPRING_RULES, VALIDATION_TARGET_RULE]);
const BUILD_PLUGIN = {
  annotations: ['Entity', 'MappedSuperclass', 'Embeddable'].map(
    (name) => `jakarta.persistence.${name}`,
  ),
  presets: ['spring'],
};

export const BAD_FILES = 'src/main/kotlin/shop/bad/*';
export const PINNED_SPRING_LINES: string[] = textsOf(
  parseJson(readFileSync(path.join(FIXTURES, 'kotlin-spring-findings.json'), 'utf8')),
);
export const WITHOUT_SELF_CALLS = PINNED_SPRING_LINES.filter(
  (line: string) => !line.includes(' SpringProxySelfCall '),
);

function sourceFiles(): Record<string, string> {
  return Object.fromEntries(
    readdirSync(path.join(FIXTURE, 'src'), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(FIXTURE, path.join(entry.parentPath, entry.name)))
      .map((relative) => [
        relative.replaceAll('\\', '/'),
        readFileSync(path.join(FIXTURE, relative), 'utf8'),
      ]),
  );
}

export function commitBaseThenSpringBranch(
  project: KotlinProject,
  build: Readonly<Record<string, string>>,
): void {
  const files = { ...sourceFiles(), ...build };
  const isBase = (file: string) => SOURCE_BASE_FILES.has(file) || Object.hasOwn(build, file);
  writeAll(project, {
    '.gitignore': '/build/\n/.gradle/\n/.kotlin/\n/target/\n',
    ...Object.fromEntries(Object.entries(files).filter(([file]) => isBase(file))),
  });
  git(project, 'init', '-q', '-b', 'main');
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', 'base');
  git(project, 'checkout', '-q', '-b', 'spring');
  writeAll(project, files);
  git(project, 'add', '-A');
  git(project, 'commit', '-q', '-m', 'spring');
}

export function fixtureBuild(...names: string[]): Record<string, string> {
  return Object.fromEntries(
    names.map((name) => [name, readFileSync(path.join(FIXTURE, name), 'utf8')]),
  );
}

export function recordedFindings(): Finding[] {
  const files = fieldOf(
    parseJson(readFileSync(path.join(FIXTURES, 'kotlin-spring-facts.json'), 'utf8')),
    'files',
  );
  const finding: unknown = findingFactory();
  return [
    ...springFindings(files, {
      finding,
      manifest: { spring: true, kotlinAllOpen: BUILD_PLUGIN },
      projectFiles: files,
      projectRoot: FIXTURE,
      javaRoots: ['src/main/java'],
    }),
    ...validationTargetFindings(files, { finding }),
  ];
}

export function springLines(findings: readonly Finding[]): string[] {
  return findings
    .filter(({ tool, rule }) => tool === REVIEW_TOOL && SPRING.has(rule))
    .map(
      ({ path: file, location, rule, symbol }) =>
        `${file}:${String(location?.line)} ${rule} ${String(symbol)}`,
    )
    .sort();
}
