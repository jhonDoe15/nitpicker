import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings, runJavaDiff } from '../adapters/java-diff.mjs';
import { analyzeJavaSnapshot } from '../adapters/java-runner.mjs';
import {
  isFormatting,
  LOOSE,
  LOOSE_SOURCE,
  MESSY,
  MESSY_SOURCE,
  OPTED_IN_CHECKSTYLE,
  ROOMY,
  ROOMY_SOURCE,
  summaryOf,
  withFourSpaces,
} from './test-support/style-sources.mjs';
import {
  commitBranch,
  GRADLE_STEP_TIMEOUT_MS,
  runGitIn,
} from '../adapters/test-support/gradle-e2e.mjs';
import { DATED, EMPTY_CATCH, FAILING_TEST } from './test-support/maven-e2e-sources.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const fixtures = path.join(import.meta.dirname, 'fixtures');
const gradleFixtures = path.join(import.meta.dirname, '../adapters/fixtures');
const gradleFixture = path.join(gradleFixtures, 'gradle-project');
const BUILD_FILES = new Set(['build.gradle', 'pom.xml']);
const temporary = [];

function copyOf(...sources) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-e2e-'));
  temporary.push(root);
  for (const source of sources) {
    cpSync(source, root, { recursive: true });
  }
  return root;
}

const MESSY = 'src/main/java/demo/Messy.java';
function twinProjects() {
  const gradleProject = copyOf(gradleFixture);
  const mavenProject = copyOf(gradleFixture, path.join(fixtures, 'single'));
  for (const name of ['build.gradle', 'settings.gradle']) {
    rmSync(path.join(mavenProject, name));
  }
  return [gradleProject, mavenProject];
}

function copiedTestCases(project) {
  const results = path.join(project, 'target/nitpicker/test-results');
  return readdirSync(results)
    .sort()
    .flatMap((task) =>
      readdirSync(path.join(results, task))
        .sort()
        .flatMap((name) => testCasesOf(readFileSync(path.join(results, task, name), 'utf8'), task)),
    );
}

function lineCoverage(text, value) {
  return {
    tool: 'jacoco',
    rule: 'line-coverage',
    path: 'src/main/java/demo/Greeter.java',
    identity: 'line-coverage',
    metric: { name: 'line-coverage', value },
    message: `line-coverage ${text}`,
    classification: 'descriptive',
  };
}

const comparable = (findings) => findings.map((finding) => JSON.stringify(finding)).sort();

function withoutGradle(root) {
  for (const name of readdirSync(root, { recursive: true })) {
    if (/(?:^|[/\\])(?:build|settings)\.gradle$/u.test(name)) {
      rmSync(path.join(root, name));
    }
  }
  return root;
}

function acrossBuilds(findings) {
  return findings
    .filter(({ tool, rule }) => `${tool}/${rule}` !== 'test-runtime/slow-test')
    .map((finding) =>
      BUILD_FILES.has(finding.path) ? { ...finding, path: 'build file', message: '' } : finding,
    );
}

afterAll(() => {
  for (const root of temporary.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(!enabled)('Java preset on Maven builds', () => {
  it(
    'finds exactly what the Gradle build of the same sources finds',
    () => {
      const [gradleProject, mavenProject] = twinProjects();
      for (const root of [gradleProject, mavenProject]) {
        writeFileSync(path.join(root, 'src/main/java/demo/Dated.java'), DATED);
      }
      const fromGradle = collectJavaFindings(gradleProject, { gradle, policy: {} });
      const fromMaven = collectJavaFindings(mavenProject, { maven, policy: {} });
      const tools = new Set(fromMaven.map((finding) => finding.tool));

      expect(comparable(fromMaven)).toEqual(comparable(fromGradle));
      expect([...tools].sort()).toEqual([
        'archunit',
        'checkstyle',
        'coupling',
        'crap',
        'errorprone',
        'forbiddenapis',
        'google-java-format',
        'jacoco',
        'pit',
        'pmd',
        'spotbugs',
        'structure',
      ]);
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'finds exactly the guard findings the Gradle build of the same sources finds, test times aside (they vary by run)',
    () => {
      const guards = path.join(gradleFixtures, 'guards-project');
      const gradleProject = copyOf(guards);
      const mavenProject = withoutGradle(copyOf(guards, path.join(fixtures, 'guards')));
      const fromGradle = collectJavaFindings(gradleProject, { gradle, policy: {} });
      const fromMaven = collectJavaFindings(mavenProject, { maven, policy: {} });

      expect(comparable(acrossBuilds(fromMaven))).toEqual(comparable(acrossBuilds(fromGradle)));
      expect(
        fromMaven
          .filter((finding) => finding.tool === 'dependencies')
          .map(({ path: file, identity, message }) => [file, identity, message.split('. ')[0]]),
      ).toEqual([
        [
          'pom.xml',
          'unused:org.apache.commons:commons-text',
          'Dependency org.apache.commons:commons-text has compile scope but no main class uses it',
        ],
      ]);
      expect(
        ['javac', 'forbiddenapis', 'duplicates', 'coupling'].map((tool) =>
          fromMaven.some(
            (finding) => finding.tool === tool && finding.classification === 'enforceable',
          ),
        ),
      ).toEqual([true, true, true, true]);
      expect(
        fromMaven
          .filter((finding) => finding.rule === 'TestClassWithoutTestCases')
          .map(({ path: file, location }) => `${file}:${String(location.line)}`),
      ).toEqual([
        'src/test/java/guards/GreetingFixturesTest.java:3',
        'src/test/java/guards/HelpersTest.java:3',
      ]);
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'lints modules with a javac plug-in, preview, a descriptor, an outside source root, Lombok or an older release',
    () => {
      const project = withoutGradle(
        copyOf(
          path.join(gradleFixtures, 'guards-compile-modes'),
          path.join(fixtures, 'guards-compile-modes'),
        ),
      );
      const findings = collectJavaFindings(project, { maven, policy: {} });
      const watched = new Set(['OptionalGet', 'InstanceofThenCast', 'CollectorsToList']);

      expect(
        findings
          .filter((finding) => finding.tool === 'javac' || finding.toolNotRun === true)
          .map(({ path: file, rule, location }) => `${file}:${String(location?.line)} ${rule}`),
      ).toEqual([
        'plugged/src/main/java/plugged/Names.java:7 rawtypes',
        'preview/src/main/java/preview/Names.java:7 rawtypes',
        'modular/src/main/java/modular/shapes/Shape.java:10 rawtypes',
        'outside/src/main/java/outside/Names.java:7 rawtypes',
        'lombok/src/main/java/fluent/Item.java:18 rawtypes',
      ]);
      expect(
        findings
          .filter((finding) => finding.path.startsWith('legacy/') && watched.has(finding.rule))
          .map((finding) => finding.rule),
      ).toEqual(['OptionalGet']);
      expect(
        findings
          .filter((finding) => finding.tool === 'coupling' && finding.path.startsWith('modular/'))
          .map(({ path: file, metric }) => `${file} ${metric.name} ${String(metric.value)}`),
      ).toEqual(
        [
          'Labels.java fanIn 0',
          'Labels.java fanOut 1',
          'Labels.java totalCoupling 1',
          'Labels.java instability 1',
          'Shape.java fanIn 3',
          'Shape.java fanOut 2',
          'Shape.java totalCoupling 5',
          'Shape.java instability 0.4',
          'impl/Circle.java fanIn 1',
          'impl/Circle.java fanOut 1',
          'impl/Circle.java totalCoupling 2',
          'impl/Circle.java instability 0.5',
          'impl/Square.java fanIn 1',
          'impl/Square.java fanOut 1',
          'impl/Square.java totalCoupling 2',
          'impl/Square.java instability 0.5',
        ].map((line) => `modular/src/main/java/modular/shapes/${line}`),
      );
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'formats a 4-space project with --aosp and reports no layout, on Gradle and on Maven',
    () => {
      const [gradleProject, mavenProject] = twinProjects();
      for (const root of [gradleProject, mavenProject]) {
        withFourSpaces(root);
        writeFileSync(path.join(root, MESSY), MESSY_SOURCE);
      }
      const policy = { javaStyle: 'aosp' };
      const layout = ({ tool, rule }) =>
        tool === 'google-java-format' || (tool === 'checkstyle' && rule === 'Indentation');
      const messy = [`google-java-format format ${MESSY}`];

      expect(summaryOf(collectJavaFindings(gradleProject, { gradle, policy }), layout)).toEqual(
        messy,
      );
      expect(summaryOf(collectJavaFindings(mavenProject, { maven, policy }), layout)).toEqual(
        messy,
      );
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'formats a palantir project with palantir-java-format and lets a 108-column line pass, on both builds',
    () => {
      const [gradleProject, mavenProject] = twinProjects();
      for (const root of [gradleProject, mavenProject]) {
        writeFileSync(path.join(root, MESSY), MESSY_SOURCE);
        writeFileSync(path.join(root, ROOMY), ROOMY_SOURCE);
      }
      const conventions = {
        'java.formatter': 'palantir',
        'java.indentation': '4',
        'java.lineLength': '120',
      };
      const policy = { javaStyle: 'palantir', conventions };
      const ours = ({ path: file, ...finding }) =>
        [MESSY, ROOMY].includes(file) && isFormatting(finding);

      expect(summaryOf(collectJavaFindings(gradleProject, { gradle, policy }), ours)).toEqual([
        `palantir-java-format format ${MESSY}`,
      ]);
      expect(summaryOf(collectJavaFindings(mavenProject, { maven, policy }), ours)).toEqual([
        `palantir-java-format format ${MESSY}`,
      ]);
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'with no formatter, flags the unused import only: 4-space indentation, no format finding, a one-letter field',
    () => {
      const [gradleProject, mavenProject] = twinProjects();
      for (const root of [gradleProject, mavenProject]) {
        withFourSpaces(root);
        writeFileSync(path.join(root, LOOSE), LOOSE_SOURCE);
      }
      const conventions = { 'java.formatter': 'none', 'java.indentation': '4' };
      const policy = { javaStyle: 'none', conventions };
      const unused = [`checkstyle UnusedImports ${LOOSE}`];

      expect(
        summaryOf(collectJavaFindings(gradleProject, { gradle, policy }), isFormatting),
      ).toEqual(unused);
      expect(summaryOf(collectJavaFindings(mavenProject, { maven, policy }), isFormatting)).toEqual(
        unused,
      );
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'with no formatter and the project Checkstyle config in charge, still carries UnusedImports',
    () => {
      const [gradleProject, mavenProject] = twinProjects();
      for (const root of [gradleProject, mavenProject]) {
        withFourSpaces(root);
        writeFileSync(path.join(root, LOOSE), LOOSE_SOURCE);
        mkdirSync(path.join(root, 'config/checkstyle'), { recursive: true });
        writeFileSync(path.join(root, 'config/checkstyle/checkstyle.xml'), OPTED_IN_CHECKSTYLE);
      }
      const conventions = { 'java.formatter': 'none', 'java.indentation': '4' };
      const policyOf = (policyRoot) => ({
        javaStyle: 'none',
        conventions,
        toolPrecedence: { checkstyle: ['project'] },
        policyRoot,
      });
      const unused = [`checkstyle UnusedImports ${LOOSE}`];

      expect(
        summaryOf(
          collectJavaFindings(gradleProject, { gradle, policy: policyOf(gradleProject) }),
          isFormatting,
        ),
      ).toEqual(unused);
      expect(
        summaryOf(
          collectJavaFindings(mavenProject, { maven, policy: policyOf(mavenProject) }),
          isFormatting,
        ),
      ).toEqual(unused);
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'reads every module of a reactor under the module path, with coupling across modules',
    () => {
      const project = copyOf(path.join(fixtures, 'multi-module'));
      const findings = collectJavaFindings(project, {
        maven,
        policy: { testSeconds: { unitTestSeconds: -1 } },
      });
      const metrics = (file) =>
        findings
          .filter((finding) => finding.path === file && finding.metric !== undefined)
          .map(({ tool, metric }) => `${tool} ${metric.name} ${String(metric.value)}`)
          .sort();

      expect(
        findings
          .filter((finding) => ['errorprone', 'pmd'].includes(finding.tool))
          .map(({ tool, rule, path: file }) => `${tool} ${rule} ${file}`),
      ).toEqual([
        'errorprone PrivateConstructorForUtilityClass app/src/main/java/demo/app/Main.java',
        'errorprone SystemOut app/src/main/java/demo/app/Main.java',
      ]);
      expect(metrics('core/src/main/java/demo/core/Adder.java')).toEqual([
        'coupling fanIn 1',
        'coupling fanOut 0',
        'coupling instability 0',
        'coupling totalCoupling 1',
        'jacoco line-coverage 100',
      ]);
      expect([...new Set(findings.map((finding) => finding.path))].sort()).toEqual([
        '.',
        'app',
        'app/src/main/java/demo/app/Main.java',
        'checks/src/test/java/demo/checks/AdderIT.java',
        'core',
        'core/src/main/java/demo/core/Adder.java',
        'core/src/test/java/demo/core/AdderTest.java',
      ]);
      expect(
        findings
          .filter((finding) => finding.tool === 'test-runtime')
          .map(({ rule, path: file, identity }) => `${rule} ${file} ${identity}`),
      ).toEqual([
        'slow-test core/src/test/java/demo/core/AdderTest.java test:demo.core.AdderTest#adds',
      ]);
      expect(
        existsSync(
          path.join(
            project,
            'core/target/nitpicker/test-results/surefire/TEST-demo.core.AdderTest.xml',
          ),
        ),
      ).toBe(true);
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'reports a failing test as a maven-failure tool error that names the test',
    () => {
      const project = copyOf(path.join(fixtures, 'multi-module'));
      writeFileSync(
        path.join(project, 'core/src/test/java/demo/core/AdderTest.java'),
        FAILING_TEST,
      );
      const [finding] = analyzeJavaSnapshot(project, { maven, policy: {} }).findings;

      expect(finding).toEqual({
        tool: 'java',
        rule: 'maven-failure',
        path: '.',
        identity: 'maven-failure',
        classification: 'tool-error',
        message: [
          `Tests fail in ${path.join(project, 'core')}; nitpicker needs a passing test suite ` +
            'for coverage and mutation testing:',
          '  demo.core.AdderTest.adds: expected: <4> but was: <3>',
        ].join('\n'),
      });
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'fails a change only on what it adds',
    () => {
      const repository = copyOf(path.join(fixtures, 'multi-module'));
      runGitIn(repository, 'init', '-q', '-b', 'main');
      runGitIn(repository, 'add', '-A');
      runGitIn(repository, 'commit', '-q', '-m', 'base');
      commitBranch(repository, 'parser', { 'app/src/main/java/demo/app/Parser.java': EMPTY_CATCH });
      const result = runJavaDiff({
        repositoryRoot: repository,
        requestedBaseRef: 'main',
        maven,
        policy: {},
      });
      const failing = result.newEnforceable.map(
        ({ tool, rule, path: file }) => `${tool} ${rule} ${file}`,
      );

      expect(failing).toEqual(
        ['errorprone EmptyCatch', 'pit mutant-nocoverage'].map(
          (finding) => `${finding} app/src/main/java/demo/app/Parser.java`,
        ),
      );
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );
});
