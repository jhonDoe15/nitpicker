import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { collectJavaFindings, runJavaDiff } from '../adapters/java-diff.mjs';
import { analyzeJavaSnapshot } from '../adapters/java-runner.mjs';
import { readPinnedTools } from '../builds/java-build.mjs';
import { readCpdFindings } from '../guards/cpd-duplicates.mjs';
import { runCpd } from './guards/maven-pmd.mjs';
import { resolveTools } from './maven-tools.mjs';
import {
  commitBranch,
  GRADLE_STEP_TIMEOUT_MS,
  runGitIn,
} from '../adapters/test-support/gradle-e2e.mjs';
import { copyOf, removeCopies, withoutGradle } from './test-support/maven-e2e-projects.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const maven = process.env.NITPICKER_MAVEN;
const fixtures = path.join(import.meta.dirname, 'fixtures');
const gradleFixtures = path.join(import.meta.dirname, '../adapters/fixtures');
const gradleFixture = path.join(gradleFixtures, 'gradle-project');
const BUILD_FILES = new Set(['build.gradle', 'pom.xml']);

const DATED = `package demo;

import java.util.Date;

public class Dated {
    public Date now(int a, int b, int c, int d) {
        if (a > 0) { if (b > 0) { if (c > 0) { if (d > 0) { return new Date(); } } } }
        try { Integer.parseInt("x"); } catch (NumberFormatException e) { }
        return new Date(new String(new byte[] {1}).length());
    }
}
`;

const EMPTY_CATCH = `package demo.app;

public final class Parser {
  public int parse(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
    }
    return 0;
  }
}
`;

const FAILING_TEST = `package demo.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class AdderTest {
  @Test
  void adds() {
    assertEquals(4, new Adder().add(1, 2));
  }
}
`;

const comparable = (findings) => findings.map((finding) => JSON.stringify(finding)).sort();

const UNTIMED = { unitTestSeconds: 600, integrationTestSeconds: 600 };

function onEitherBuildFile(findings) {
  return findings.map((finding) =>
    BUILD_FILES.has(finding.path) ? { ...finding, path: 'build file', message: '' } : finding,
  );
}

afterAll(removeCopies);

describe.skipIf(!enabled)('Java preset on Maven builds', () => {
  it(
    'finds exactly what the Gradle build of the same sources finds',
    () => {
      const gradleProject = copyOf(gradleFixture);
      const mavenProject = copyOf(gradleFixture, path.join(fixtures, 'single'));
      for (const name of ['build.gradle', 'settings.gradle']) {
        rmSync(path.join(mavenProject, name));
      }
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
    'finds exactly the guard findings the Gradle build of the same sources finds',
    () => {
      const guards = path.join(gradleFixtures, 'guards-project');
      const gradleProject = copyOf(guards);
      const mavenProject = withoutGradle(copyOf(guards, path.join(fixtures, 'guards')));
      const policy = { testSeconds: UNTIMED };
      const fromGradle = collectJavaFindings(gradleProject, { gradle, policy });
      const fromMaven = collectJavaFindings(mavenProject, { maven, policy });

      expect(comparable(onEitherBuildFile(fromMaven))).toEqual(
        comparable(onEitherBuildFile(fromGradle)),
      );
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
          .filter((finding) => finding.tool === 'pmd')
          .map(({ rule, path: file }) => `${rule} ${file}`),
      ).toEqual(['SystemPrintln app/src/main/java/demo/app/Main.java']);
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
        ['checkstyle EmptyCatchBlock', 'pit mutant-nocoverage', 'pmd EmptyCatchBlock'].map(
          (finding) => `${finding} app/src/main/java/demo/app/Parser.java`,
        ),
      );
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );
});

const CLASS_LITERAL_THEN_ENUM =
  '  static final Class<?>[] TYPES = {String.class};\n  enum Kind { X }\n  void register() {}\n' +
  '  char c = \'x\';\n  String s = "done";\n';
const BOM = String.fromCodePoint(0xfeff);
const FIELDS = Array.from({ length: 12 }, (_, index) => `  private int f${String(index)};\n`).join(
  '',
);

function registry(body = '') {
  return `package p;\npublic class Reg {\n${body}${CLASS_LITERAL_THEN_ENUM}}\n`;
}

const CPD_SCENARIOS = [
  [
    'a 1600-character string literal',
    registry(`  static final String B64 = "${'QUJD'.repeat(400)}";\n`),
  ],
  [
    'a 12 KB text block',
    registry(
      `  static final String SQL = """\n${'      select * from t where a = b\n'.repeat(400)}      """;\n`,
    ),
  ],
  ['20000 blank lines', registry(`  int a${'\n'.repeat(20_000)}  = 1;\n`)],
  [
    'a text block holding an apostrophe',
    registry('  String json = """\n      {"name": "O\'Brien"}\n      """;\n'),
  ],
  [
    'a text block holding one double quote',
    registry('  String size = """\n      a 5" screen\n      """;\n'),
  ],
  [
    'a line comment between a type and .class',
    registry('  Class<?>[] other = {String // why\n      .class};\n  enum Mode { Y }\n'),
  ],
  [
    'Unicode-escaped class literals',
    registry(
      '  Class<?>[] escaped = {String\\u002Eclass, String.\\u0063lass, String.clas\\u0073};\n' +
        '  enum Escaped { Z }\n',
    ),
  ],
  ['CRLF line endings', registry(FIELDS).replaceAll('\n', '\r\n')],
  ['a byte order mark', `${BOM}${registry(FIELDS)}`],
  ['a byte order mark and CRLF line endings', `${BOM}${registry(FIELDS).replaceAll('\n', '\r\n')}`],
];

const REPEATED_RUN = [
  'package p;',
  'public class A {',
  ...Array.from({ length: 12 }, (_, index) => `  Object f${String(index)} = java.util.Map.class;`),
  '  int run(int a, int b) {',
  ...Array.from({ length: 20 }, (_, index) => `    a = a + b * ${String(index)}; b = b - a;`),
  '    return a;',
  '  }',
  '}',
  '',
].join('\n');

function cpdOver(files, extraRoots = []) {
  const root = copyOf();
  const sources = path.join(root, 'src/main/java');
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.join(sources, 'p'), { recursive: true });
    writeFileSync(path.join(sources, 'p', name), text);
  }
  const reportDir = path.join(root, 'target/nitpicker');
  mkdirSync(reportDir, { recursive: true });
  runCpd({
    module: {
      basedir: root,
      sourceRoots: [sources, ...extraRoots.map((extra) => path.join(sources, extra))],
      testSourceRoots: [],
    },
    reportDir,
    tools: resolveTools({ projectRoot: root, maven, pinned: readPinnedTools() }),
  });
  const report = path.join(reportDir, 'cpd.xml');
  return {
    outputs: readdirSync(reportDir).sort(),
    duplications: existsSync(report)
      ? readFileSync(report, 'utf8').split('<duplication ').length - 1
      : undefined,
    findings: readCpdFindings(reportDir, {
      projectRoot: root,
      sourceRoots: ['src/main/java'],
      testRoots: [],
    }),
  };
}

describe.skipIf(!enabled)('the PMD CPD launcher', () => {
  it.each(CPD_SCENARIOS)(
    'reports on a class literal before an enum after %s',
    (_, text) => {
      expect(cpdOver({ 'Reg.java': text })).toEqual({
        outputs: ['cpd.xml'],
        duplications: 0,
        findings: [],
      });
    },
    GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'reads a file under two overlapping source roots once',
    () => {
      expect(cpdOver({ 'A.java': REPEATED_RUN }, ['p'])).toEqual(
        cpdOver({ 'A.java': REPEATED_RUN }),
      );
    },
    2 * GRADLE_STEP_TIMEOUT_MS,
  );

  it(
    'lists a file PMD cannot lex among the paths it skipped, after its class literals',
    () => {
      const result = cpdOver({
        'L.java': `package p;\npublic class L {\n${CLASS_LITERAL_THEN_ENUM}  # bad\n}\n`,
        'S.java': `package p;\npublic class S {\n  static final String B64 = "${'QUJD'.repeat(400)}";\n}\n`,
      });

      expect(result).toEqual({
        outputs: ['cpd.xml'],
        duplications: 0,
        findings: [
          {
            tool: 'duplicates',
            rule: 'cpd-skipped-paths',
            path: '.',
            identity: 'cpd-skipped-paths',
            message:
              'CPD could not read or tokenize 1 path(s), so duplicated code there was not checked: ' +
              "src/main/java/p/L.java: LexException: Lexical error in file 'src/main/java/p/L.java' " +
              'at line 8, column 3: "#" (35), after : "" (in lexical state DEFAULT)',
            classification: 'descriptive',
          },
        ],
      });
    },
    GRADLE_STEP_TIMEOUT_MS,
  );
});
