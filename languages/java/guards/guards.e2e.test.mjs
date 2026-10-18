import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../builds/java-build.mjs';
import { runJavaDuplicates } from '../adapters/metrics/java-duplicates.mjs';
import { readJavaFindings } from '../adapters/reporting/java-reports.mjs';
import { readReportModules } from '../adapters/gradle-reports/report-modules.mjs';
import { readCouplingFindings } from '../adapters/metrics/java-coupling.mjs';
import { readErrorProneFindings } from '../adapters/errorprone/java-errorprone.mjs';
import { readCpdFindings } from './cpd-duplicates.mjs';
import { readLintFindings } from './javac-lint.mjs';
import { exceptionHint } from '../../../shared/rules/exceptions.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixtures = path.join(import.meta.dirname, '..', 'adapters', 'fixtures');
const optionalGetMessage = (file) =>
  'Use orElseThrow(), orElse(...), map or ifPresent instead of Optional.get(). ' +
  exceptionHint('pmd/OptionalGet', file);
const LINE_MARKER = /\/\/ violation: (.*)$/;
const FILE_MARKER = /\/\/ file violation: (.*)$/;
const UNRELATED_TASKS = [
  'nitpickerSpotbugs',
  'nitpickerErrorProne',
  'nitpickerFormat',
  'nitpickerJacoco',
  'nitpickerArchunit',
  'nitpickerStructure',
  'nitpickerPit',
  'test',
];
const GUARD_TOOLS = new Set(['javac', 'forbiddenapis', 'dependencies', 'coupling', 'duplicates']);
const GUARD_RULES = new Set([
  'OptionalGet',
  'OptionalAsFieldOrParameter',
  'OptionalOfCollection',
  'InstanceofThenCast',
  'SneakyThrows',
  'SwallowedInterruptedException',
  'CollectorsToList',
  'StreamResourceNotClosed',
  'ForEachSideEffect',
  'SqlConcatenation',
  'WeakHash',
  'NestedQuantifierRegex',
  'PathFromParameter',
  'SignatureDeclareThrowsException',
  'AvoidThrowingRawExceptionTypes',
  'NonFinalStaticField',
  'MutableStaticCollection',
  'TestSleep',
  'DisabledTest',
  'AssertionInControlFlow',
  'TryCatchInTest',
  'AssertTrueOnEquality',
  'TautologicalAssertion',
  'MockedValueType',
  'TestOrderDependence',
  'TestClassWithoutTestCases',
  'ConstantName',
  'MagicNumber',
  'VisibilityModifier',
]);

function markedFiles(root) {
  return readdirSync(root, { recursive: true })
    .map((name) => name.split(path.sep).join('/'))
    .filter((name) => name.startsWith('src/') || name === 'build.gradle')
    .filter((name) => name.endsWith('.java') || name.endsWith('.gradle'));
}

function markers(line, pattern) {
  const marker = pattern.exec(line);
  return marker === null ? [] : marker[1].split(',').map((rule) => rule.trim());
}

function expectedViolations(root) {
  return markedFiles(root)
    .flatMap((file) =>
      readFileSync(path.join(root, file), 'utf8')
        .split('\n')
        .flatMap((line, index) => [
          ...markers(line, LINE_MARKER).map((rule) => `${file}:${String(index + 1)} ${rule}`),
          ...markers(line, FILE_MARKER).map((rule) => `${file} ${rule}`),
        ]),
    )
    .sort();
}

function isGuard({ tool, rule, classification }) {
  return (
    classification === 'enforceable' &&
    tool !== 'errorprone' &&
    (GUARD_TOOLS.has(tool) || GUARD_RULES.has(rule)) &&
    !(tool === 'coupling' && rule !== 'package-cycle') &&
    !(tool === 'duplicates' && rule !== 'duplicate-clone')
  );
}

function reportBaseOf(root) {
  return path.join(path.dirname(root), 'reports');
}

function guardFindings(root) {
  return readJavaFindings(root, { reportBase: reportBaseOf(root) }).findings;
}

function reportedViolations(root) {
  return guardFindings(root)
    .filter((finding) => isGuard(finding))
    .map(({ tool, rule, path: file, location }) =>
      location === undefined
        ? `${file} ${tool}/${rule}`
        : `${file}:${String(location.line)} ${tool}/${rule}`,
    )
    .sort();
}

function runGradle(projectRoot, args) {
  const result = spawnSync(
    gradle,
    ['--console=plain', '--quiet', '--no-configuration-cache', '-I', INIT_SCRIPT, ...args],
    { cwd: projectRoot, encoding: 'utf8', timeout: 90_000 },
  );
  if (result.status !== 0) {
    throw new Error(`Gradle failed: ${result.stderr}`);
  }
}

function gradleTasks(fixture, tasks, properties = () => []) {
  const projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-guards-')), fixture);
  cpSync(path.join(fixtures, fixture), projectRoot, { recursive: true });
  runGradle(projectRoot, [...properties(projectRoot), ...tasks]);
  return projectRoot;
}

function pmdRules(projectRoot) {
  const sarif = JSON.parse(
    readFileSync(path.join(projectRoot, 'build', 'nitpicker', 'pmd.sarif'), 'utf8'),
  );
  return [...new Set(sarif.runs.flatMap((run) => run.results.map((result) => result.ruleId)))];
}

describe.skipIf(!enabled)('Java guards on a fixture project', () => {
  const roots = [];

  beforeAll(() => {
    roots.push(
      gradleTasks(
        'guards-project',
        ['nitpickerJava', ...UNRELATED_TASKS.flatMap((task) => ['-x', task])],
        (root) => [`-Pnitpicker.reportDir=${reportBaseOf(root)}`],
      ),
    );
    const { manifest } = readReportModules(reportBaseOf(roots[0]), 'java');
    runJavaDuplicates(roots[0], { reportRoot: reportBaseOf(roots[0]), manifest });
    roots.push(
      gradleTasks('guards-compile-modes', [
        'nitpickerLint',
        ':legacy:nitpickerPmd',
        ':arguments:nitpickerPmd',
        ':modular:nitpickerJdeps',
        ':modular:nitpickerErrorProne',
        ':legacy:nitpickerCpd',
      ]),
    );
  }, 120_000);

  afterAll(() => {
    for (const root of roots) {
      rmSync(path.dirname(root), { recursive: true, force: true });
    }
  });

  it('reports exactly the guard violations marked in the fixture, and none on the clean samples', () => {
    expect(reportedViolations(roots[0])).toEqual(expectedViolations(roots[0]));
  });

  it('ends a guard message with its exception route', () => {
    const optionalGet = guardFindings(roots[0]).find((finding) => finding.rule === 'OptionalGet');

    expect(optionalGet.message).toBe(optionalGetMessage(optionalGet.path));
  });

  it.each(['legacy', 'arguments'])(
    'skips the Java 16 rules on a project compiled for an older release (%s)',
    (module) => {
      const watched = ['OptionalGet', 'InstanceofThenCast', 'CollectorsToList'];

      expect(
        pmdRules(path.join(roots[1], module)).filter((rule) => watched.includes(rule)),
      ).toEqual(['OptionalGet']);
    },
  );

  it('lints projects with a javac plug-in, preview, a descriptor, an outside source root or Lombok', () => {
    const lint = (module) =>
      readLintFindings(path.join(roots[1], module, 'build', 'nitpicker'), {
        projectRoot: roots[1],
      }).map(({ path: file, rule, location }) => `${file}:${String(location?.line)} ${rule}`);

    expect(
      ['plugged', 'preview', 'modular', 'outside', 'lombok'].flatMap((module) => lint(module)),
    ).toEqual([
      'plugged/src/main/java/plugged/Names.java:7 rawtypes',
      'preview/src/main/java/preview/Names.java:7 rawtypes',
      'modular/src/main/java/modular/shapes/Shape.java:10 rawtypes',
      'outside/src/main/java/outside/Names.java:7 rawtypes',
      'lombok/src/main/java/fluent/Item.java:18 rawtypes',
    ]);
  });

  it('reads the coupling of a module whose descriptor requires a jar module', () => {
    const findings = readCouplingFindings(path.join(roots[1], 'modular', 'build', 'nitpicker'), {
      projectRoot: roots[1],
      sourceRoots: ['modular/src/main/java'],
    });

    expect(
      findings
        .filter((finding) => finding.path.startsWith('modular/'))
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
  });

  it('runs Error Prone on a module whose sealed interface permits classes in another package', () => {
    const module = path.join(roots[1], 'modular');
    const reportRoot = path.join(module, 'build', 'nitpicker');
    const lines = readFileSync(path.join(reportRoot, 'errorprone', 'main.args'), 'utf8').split(
      '\n',
    );
    const modulePath = lines[lines.indexOf('--module-path') + 1];

    expect(lines).toContain(path.join(module, 'src', 'main', 'java', 'module-info.java'));
    expect(modulePath.split(path.delimiter).map((entry) => path.basename(entry))).toEqual([
      'commons-lang3-3.17.0.jar',
    ]);
    expect(
      readErrorProneFindings({
        reportRoot,
        roots: [roots[1]],
        lintedRoots: ['modular/src/main/java'],
      }).map(({ path: file, rule, location }) => `${file}:${String(location?.line)} ${rule}`),
    ).toEqual([]);
  });

  it('runs CPD over class literals followed by a declaration without modifiers', () => {
    const reportRoot = path.join(roots[1], 'legacy', 'build', 'nitpicker');

    expect(
      readCpdFindings(reportRoot, {
        projectRoot: roots[1],
        sourceRoots: ['legacy/src/main/java'],
        testRoots: [],
      }),
    ).toEqual([]);
    expect(
      ['cpd.xml', 'cpd-failed.txt'].map((name) => existsSync(path.join(reportRoot, name))),
    ).toEqual([true, false]);
  });

  it('leaves symbolic links in a modular class directory out of the jdeps class list and copy', () => {
    const module = path.join(roots[1], 'modular');
    const classes = path.join(module, 'build', 'classes', 'java', 'main');
    const outside = path.join(path.dirname(roots[1]), 'outside');
    const labels = path.join(classes, 'modular', 'shapes', 'Labels.class');
    mkdirSync(path.join(outside, 'q'), { recursive: true });
    cpSync(labels, path.join(outside, 'B.class'));
    cpSync(labels, path.join(outside, 'q', 'C.class'));
    symlinkSync(path.join(outside, 'B.class'), path.join(classes, 'modular', 'shapes', 'L.class'));
    symlinkSync(path.join(outside, 'q'), path.join(classes, 'linked'));

    runGradle(roots[1], [':modular:nitpickerJdeps', '-x', 'compileJava']);

    expect(readFileSync(path.join(module, 'build', 'nitpicker', 'jdeps-classes.txt'), 'utf8')).toBe(
      [
        'modular.shapes.Labels',
        'modular.shapes.Shape',
        'modular.shapes.impl.Circle',
        'modular.shapes.impl.Square',
      ]
        .map((name) => `${name}\n`)
        .join(''),
    );
  });
});
