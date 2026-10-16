import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const fixture = path.join(import.meta.dirname, 'fixtures', 'review-rules');
const VIOLATION_MARKER = /\/\/ violation: (\w+)/u;
const REVIEW_RULES = new Set([
  'FixedSleepInTest',
  'NegativeWaitInTest',
  'ExhaustiveEnumPredicate',
  'StaticForwardingWrapper',
  'SingularAndPluralMember',
  'SpringUnusedContext',
  'test-only-export',
]);
const roots = [];

function copyWithout(...left) {
  const root = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-review-rules-')), 'shop');
  roots.push(path.dirname(root));
  cpSync(fixture, root, { recursive: true });
  for (const name of left) {
    rmSync(path.join(root, name));
  }
  return root;
}

function markedViolations(root) {
  return readdirSync(path.join(root, 'src'), { recursive: true })
    .filter((name) => name.endsWith('.java'))
    .flatMap((name) =>
      readFileSync(path.join(root, 'src', name), 'utf8')
        .split('\n')
        .flatMap((line, index) => {
          const rule = VIOLATION_MARKER.exec(line)?.[1];
          return rule === undefined ? [] : [`src/${name}:${String(index + 1)} ${rule}`];
        }),
    )
    .sort();
}

function reviewFindings(findings) {
  return findings.filter((finding) => REVIEW_RULES.has(finding.rule));
}

const located = (findings) =>
  findings
    .filter(({ tool }) => tool === 'pmd')
    .map(({ rule, path: file, location }) => `${file}:${String(location.line)} ${rule}`)
    .sort();

const comparable = (findings) => findings.map((finding) => JSON.stringify(finding)).sort();

describe.skipIf(!enabled)('Review rules on Gradle and Maven builds of a Spring project', () => {
  const runs = {};

  beforeAll(() => {
    const gradleProject = copyWithout('pom.xml');
    const mavenProject = copyWithout('build.gradle', 'settings.gradle');
    runs.markers = markedViolations(gradleProject);
    runs.gradle = collectJavaFindings(gradleProject, { gradle, policy: {} });
    runs.maven = collectJavaFindings(mavenProject, { maven, policy: {} });
  });

  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('finds the same findings on both builds', () => {
    expect(comparable(reviewFindings(runs.maven))).toEqual(comparable(reviewFindings(runs.gradle)));
    expect(comparable(runs.maven)).toEqual(comparable(runs.gradle));
  });

  it('reports exactly the PMD violations marked in the fixture on both builds', () => {
    expect(located(reviewFindings(runs.gradle))).toEqual(runs.markers);
    expect(located(reviewFindings(runs.maven))).toEqual(runs.markers);
  });

  it('names Awaitility for a fixed sleep, as the project has it', () => {
    const [sleep] = runs.gradle.filter(({ rule }) => rule === 'FixedSleepInTest');

    expect(sleep.message).toMatch(/with Awaitility, which the project's tests use/u);
  });

  it('reports the main classes only tests use and spares the Spring service', () => {
    const testOnly = (findings) =>
      findings
        .filter(({ rule }) => rule === 'test-only-export')
        .map(({ path: file, location }) => `${file}:${String(location?.line)}`);

    expect(testOnly(runs.gradle)).toEqual([
      'src/main/java/shop/Filter.java:5',
      'src/main/java/shop/SampleOrders.java:5',
    ]);
    expect(testOnly(runs.maven)).toEqual(testOnly(runs.gradle));
  });
});
