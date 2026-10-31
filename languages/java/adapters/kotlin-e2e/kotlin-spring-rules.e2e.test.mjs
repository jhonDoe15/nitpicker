import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findingFactory } from '../kotlin/review-rules/review-finding.mjs';
import { springFindings } from '../kotlin/review-rules/spring/spring-findings.mjs';
import { SPRING_RULES } from '../kotlin/review-rules/spring/spring-messages.mjs';
import {
  VALIDATION_TARGET_RULE,
  validationTargetFindings,
} from '../kotlin/review-rules/validation/validation-targets.mjs';
import {
  diffOf,
  git,
  kotlinE2eEnabled,
  kotlinPolicy,
  removeProject,
  writeAll,
} from './test-support/kotlin-e2e-project.mjs';

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures');
const FIXTURE = path.join(FIXTURES, 'kotlin-spring-project');
const BASE_FILES = new Set([
  'build.gradle.kts',
  'settings.gradle.kts',
  'src/main/kotlin/shop/ShopApplication.kt',
  'src/main/java/shop/LegacyRepository.java',
]);
const BAD_FILES = 'src/main/kotlin/shop/bad/*';
const SPRING = new Set([...SPRING_RULES, VALIDATION_TARGET_RULE]);
const BUILD_PLUGIN = {
  annotations: ['Entity', 'MappedSuperclass', 'Embeddable'].map(
    (name) => `jakarta.persistence.${name}`,
  ),
  presets: ['spring'],
};

function fixtureFiles() {
  return Object.fromEntries(
    readdirSync(FIXTURE, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.relative(FIXTURE, path.join(entry.parentPath, entry.name)))
      .map((relative) => [
        relative.replaceAll('\\', '/'),
        readFileSync(path.join(FIXTURE, relative), 'utf8'),
      ]),
  );
}

function recordedFindings() {
  const { files } = JSON.parse(
    readFileSync(path.join(FIXTURES, 'kotlin-spring-facts.json'), 'utf8'),
  );
  const finding = findingFactory();
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

function springLines(findings) {
  return findings
    .filter(({ tool, rule }) => tool === 'pmd' && SPRING.has(rule))
    .map(
      ({ path: file, location, rule, symbol }) =>
        `${file}:${String(location.line)} ${rule} ${symbol}`,
    )
    .sort();
}

describe.skipIf(!kotlinE2eEnabled)('Kotlin Spring rules end to end', () => {
  let project;

  beforeAll(() => {
    project = { root: mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-spring-')) };
    const files = fixtureFiles();
    writeAll(project, {
      '.gitignore': '/build/\n/.gradle/\n/.kotlin/\n',
      ...Object.fromEntries(Object.entries(files).filter(([file]) => BASE_FILES.has(file))),
    });
    git(project, 'init', '-q', '-b', 'main');
    git(project, 'add', '-A');
    git(project, 'commit', '-q', '-m', 'base');
    git(project, 'checkout', '-q', '-b', 'spring');
    writeAll(project, files);
    git(project, 'add', '-A');
    git(project, 'commit', '-q', '-m', 'spring');
  });
  afterAll(() => {
    if (project !== undefined) {
      removeProject(project);
    }
  });

  it('reports the recorded fixture findings from the build, with the all-open plugin read from Gradle', () => {
    const result = diffOf(project, 'spring');

    expect(result.failed).toBe(true);
    expect(springLines(result.newEnforceable)).toEqual(springLines(recordedFindings()));
  });

  it('lifts a rule for some paths with the exception its message names', () => {
    const result = diffOf(project, 'spring', {
      policy: {
        ...kotlinPolicy,
        exceptions: [{ rule: 'pmd/SpringProxySelfCall', glob: BAD_FILES }],
      },
    });

    expect(springLines(result.newEnforceable)).toEqual(
      springLines(recordedFindings().filter(({ rule }) => rule !== 'SpringProxySelfCall')),
    );
  });
});
