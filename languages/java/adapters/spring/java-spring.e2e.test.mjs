import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../../builds/java-build.mjs';
import { readErrorProneFindings } from '../errorprone/java-errorprone.mjs';
import { collectJavaFindings, runJavaDiff } from '../java-diff.mjs';
import { commitBranch, GRADLE_STEP_TIMEOUT_MS, runGitIn } from '../test-support/gradle-e2e.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const fixture = path.join(import.meta.dirname, '..', 'fixtures', 'spring-project');
const reviewFixture = path.join(import.meta.dirname, '..', 'java-e2e', 'fixtures', 'review-rules');
const SPRING_RULE = /^(?:Spring|Jpa)/;
const VIOLATION_MARKER = /\/\/ violation: (.*)$/;
const CHECKSTYLE_VERSION = /<checkstyle version="([^"]+)">/;

function javaFiles(root) {
  return readdirSync(root, { recursive: true })
    .filter((name) => name.endsWith('.java'))
    .map((name) => path.join(root, name));
}

function expectedViolations(sourceRoot) {
  return javaFiles(sourceRoot)
    .flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) => {
          const marker = VIOLATION_MARKER.exec(line);
          return marker === null
            ? []
            : marker[1]
                .split(',')
                .map(
                  (rule) =>
                    `${path.relative(sourceRoot, file).split(path.sep).join('/')}:${String(index + 1)} ${rule.trim()}`,
                );
        }),
    )
    .sort();
}

function reportedViolations(sarifFile, sourceRoot) {
  const [run] = JSON.parse(readFileSync(sarifFile, 'utf8')).runs;
  return run.results
    .filter((result) => SPRING_RULE.test(result.ruleId))
    .map((result) => {
      const { artifactLocation, region } = result.locations[0].physicalLocation;
      const file = path.relative(sourceRoot, new URL(artifactLocation.uri).pathname);
      return `${file.split(path.sep).join('/')}:${String(region.startLine)} ${result.ruleId}`;
    })
    .sort();
}

describe.skipIf(!enabled)('Spring rules on a Spring project', () => {
  let projectRoot;

  beforeAll(
    () => {
      projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-')), 'shop');
      cpSync(fixture, projectRoot, { recursive: true });
      const result = spawnSync(
        gradle,
        ['--console=plain', '--quiet', '-I', INIT_SCRIPT, 'nitpickerPmd', 'nitpickerJava'],
        { cwd: projectRoot, encoding: 'utf8', timeout: 15 * 60 * 1000 },
      );
      if (result.status !== 0) {
        throw new Error(`Gradle failed: ${result.stderr}`);
      }
    },
    16 * 60 * 1000,
  );

  afterAll(() => {
    if (projectRoot !== undefined) {
      rmSync(path.dirname(projectRoot), { recursive: true, force: true });
    }
  });

  it('reports exactly the violations marked in the fixture sources', () => {
    const sourceRoot = path.join(projectRoot, 'src', 'main', 'java');
    expect(
      reportedViolations(path.join(projectRoot, 'build', 'nitpicker', 'pmd.sarif'), sourceRoot),
    ).toEqual(expectedViolations(sourceRoot));
  });

  it('runs the pinned Checkstyle with the bundled config even when the project declares its own', () => {
    const report = readFileSync(
      path.join(projectRoot, 'build', 'nitpicker', 'checkstyle.xml'),
      'utf8',
    );
    expect(CHECKSTYLE_VERSION.exec(report)?.[1]).toBe('10.21.1');
  });

  it('reports no FieldCanBeFinal in JPA entities and no utility-class finding on configuration classes', () => {
    const findings = readErrorProneFindings({
      reportRoot: path.join(projectRoot, 'build', 'nitpicker'),
      roots: [projectRoot],
      lintedRoots: ['src/main/java', 'src/test/java'],
    });
    expect(
      findings.map(({ rule, path: file, location }) => `${file}:${location.line} ${rule}`),
    ).toEqual(['src/main/java/shop/catalog/ProductRepository.java:11 MissingOverride']);
  });

  it('records the resource roots and that the project uses Spring', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(projectRoot, 'build', 'nitpicker', 'manifest.json'), 'utf8'),
    );
    expect({ spring: manifest.spring, resourceRoots: manifest.resourceRoots }).toEqual({
      spring: true,
      resourceRoots: ['src/main/resources'],
    });
  });
});

const REVIEW_MARKER = /\/\/ violation: (\w+)/u;
const REVIEW_RULES = new Set([
  'FixedSleepInTest',
  'NegativeWaitInTest',
  'ExhaustiveEnumPredicate',
  'StaticForwardingWrapper',
  'SingularAndPluralMember',
  'SpringUnusedContext',
  'TestClassWithoutTestCases',
  'test-only-export',
]);
const roots = [];
const RECEIPT_TEST = `package shop;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class ReceiptTest {
  @Test
  void printsTheDrift() {
    System.err.println("receipt total drifted by 3 cents");
    assertThat(Prices.sum(List.of(1L, 2L))).isEqualTo(3L);
  }
}
`;

function copyWithout(...left) {
  const root = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-review-rules-')), 'shop');
  roots.push(path.dirname(root));
  cpSync(reviewFixture, root, { recursive: true });
  for (const name of left) {
    rmSync(path.join(root, name));
  }
  return root;
}

function markedReviewViolations(root) {
  return readdirSync(path.join(root, 'src'), { recursive: true })
    .filter((name) => name.endsWith('.java'))
    .flatMap((name) =>
      readFileSync(path.join(root, 'src', name), 'utf8')
        .split('\n')
        .flatMap((line, index) => {
          const rule = REVIEW_MARKER.exec(line)?.[1];
          return rule === undefined ? [] : [`src/${name}:${String(index + 1)} ${rule}`];
        }),
    )
    .sort();
}

function reviewFindings(findings) {
  return findings.filter((finding) => REVIEW_RULES.has(finding.rule));
}

function located(findings) {
  return findings
    .filter(({ tool }) => tool === 'pmd')
    .map(({ rule, path: file, location }) => `${file}:${String(location.line)} ${rule}`)
    .sort();
}

function comparable(findings) {
  return findings.map((finding) => JSON.stringify(finding)).sort();
}

function stableConsoleEmitters(findings) {
  return findings.map((finding) =>
    finding.rule === 'test-console-output'
      ? {
          ...finding,
          message: finding.message.replace(/ \([^)]*\)(?=\. Fix the cause)/u, ' (<emitting test>)'),
        }
      : finding,
  );
}

describe.skipIf(!enabled)('Review rules on Gradle and Maven builds of a Spring project', () => {
  const runs = {};

  beforeAll(() => {
    const gradleProject = copyWithout('pom.xml');
    const mavenProject = copyWithout('build.gradle', 'settings.gradle');
    runs.markers = markedReviewViolations(gradleProject);
    runs.gradle = collectJavaFindings(gradleProject, { gradle, policy: {} });
    runs.maven = collectJavaFindings(mavenProject, { maven, policy: {} });
  }, 2 * GRADLE_STEP_TIMEOUT_MS);

  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('finds the same findings on both builds', () => {
    expect(comparable(reviewFindings(runs.maven))).toEqual(comparable(reviewFindings(runs.gradle)));
    expect(comparable(stableConsoleEmitters(runs.maven))).toEqual(
      comparable(stableConsoleEmitters(runs.gradle)),
    );
  });

  it('reports exactly the PMD violations marked in the fixture on both builds', () => {
    expect(located(reviewFindings(runs.gradle))).toEqual(runs.markers);
    expect(located(reviewFindings(runs.maven))).toEqual(runs.markers);
  });

  it('names Awaitility for a fixed sleep, as the project has it, and calls join(ms) a timed wait', () => {
    const waits = runs.gradle.filter(({ rule }) => rule === 'FixedSleepInTest');
    const timed = waits.filter(({ message }) => message.startsWith('A timed wait, '));

    expect(waits[0].message).toMatch(/with Awaitility, which the project's tests use/u);
    expect(timed.map(({ path: file, location }) => `${file}:${String(location?.line)}`)).toEqual([
      'src/test/java/shop/WaitingTest.java:87',
    ]);
    expect(timed[0].message).toMatch(/until\(\(\) -> !thread\.isAlive\(\)\)/u);
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

function consoleChange(build, ...left) {
  const repository = copyWithout(...left);
  runGitIn(repository, 'init', '-q', '-b', 'main');
  runGitIn(repository, 'add', '-A');
  runGitIn(repository, 'commit', '-q', '-m', 'base');
  const filterTest = path.join(repository, 'src/test/java/shop/FilterTest.java');
  commitBranch(repository, 'receipt', {
    'src/test/java/shop/ReceiptTest.java': RECEIPT_TEST,
    'src/test/java/shop/FilterTest.java': readFileSync(filterTest, 'utf8').replace('42', '43'),
  });
  const result = runJavaDiff({ repositoryRoot: repository, requestedBaseRef: 'main', ...build });
  return result.newFindings.filter(({ rule }) => rule === 'test-console-output');
}

describe.skipIf(!enabled)('New console output of tests on Gradle and Maven builds', () => {
  const runs = {};

  beforeAll(() => {
    runs.gradle = consoleChange({ gradle, policy: {} }, 'pom.xml');
    runs.maven = consoleChange({ maven, policy: {} }, 'build.gradle', 'settings.gradle');
  }, 4 * GRADLE_STEP_TIMEOUT_MS);

  afterAll(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports only the line the change adds, not Spring startup, logged warnings or renumbered output', () => {
    expect(
      runs.gradle.map(({ path: file, message }) => `${file} ${message.split('. Fix')[0]}`),
    ).toEqual([
      '. Tests print new console output: "receipt total drifted by <n> cents" (src/test/java/shop/ReceiptTest.java, test "printsTheDrift")',
    ]);
    expect(comparable(runs.maven)).toEqual(comparable(runs.gradle));
  });
});
