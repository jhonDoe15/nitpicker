import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../builds/java-build.mjs';
import { runJavaDuplicates } from '../adapters/metrics/java-duplicates.mjs';
import { readJavaFindings } from '../adapters/reporting/java-reports.mjs';
import { readReportModules } from '../adapters/gradle-reports/report-modules.mjs';
import { readCouplingFindings } from '../adapters/metrics/java-coupling.mjs';
import { readLintFindings } from './javac-lint.mjs';

const enabled = process.env.NITPICKER_JAVA_E2E === '1';
const gradle = process.env.NITPICKER_GRADLE ?? 'gradle';
const fixtures = path.join(import.meta.dirname, '..', 'adapters', 'fixtures');
const OPTIONAL_GET_MESSAGE =
  'Use orElseThrow(), orElse(...), map or ifPresent instead of Optional.get(). ' +
  'If it is right here, add an exception for pmd/OptionalGet in nitpicker.config.json.';
const LINE_MARKER = /\/\/ violation: (.*)$/;
const FILE_MARKER = /\/\/ file violation: (.*)$/;
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
  'com.puppycrawl.tools.checkstyle.checks.naming.ConstantNameCheck',
  'com.puppycrawl.tools.checkstyle.checks.coding.MagicNumberCheck',
  'com.puppycrawl.tools.checkstyle.checks.design.VisibilityModifierCheck',
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

function gradleTasks(fixture, tasks, properties = () => []) {
  const projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-guards-')), fixture);
  cpSync(path.join(fixtures, fixture), projectRoot, { recursive: true });
  const result = spawnSync(
    gradle,
    [
      '--console=plain',
      '--quiet',
      '--no-configuration-cache',
      ...properties(projectRoot),
      '-I',
      INIT_SCRIPT,
      ...tasks,
    ],
    { cwd: projectRoot, encoding: 'utf8', timeout: 15 * 60 * 1000 },
  );
  if (result.status !== 0) {
    throw new Error(`Gradle failed: ${result.stderr}`);
  }
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

  beforeAll(
    () => {
      roots.push(
        gradleTasks('guards-project', ['nitpickerJava'], (root) => [
          `-Pnitpicker.reportDir=${reportBaseOf(root)}`,
        ]),
      );
      const { manifest } = readReportModules(reportBaseOf(roots[0]), 'java');
      runJavaDuplicates(roots[0], { reportRoot: reportBaseOf(roots[0]), manifest });
      roots.push(
        gradleTasks('guards-compile-modes', [
          'nitpickerLint',
          ':legacy:nitpickerPmd',
          ':modular:nitpickerJdeps',
          ':modular:nitpickerPermits',
        ]),
      );
    },
    30 * 60 * 1000,
  );

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

    expect(optionalGet.message).toBe(OPTIONAL_GET_MESSAGE);
  });

  it('skips the Java 16 rules on a project compiled for an older release', () => {
    const watched = ['OptionalGet', 'InstanceofThenCast', 'CollectorsToList'];

    expect(
      pmdRules(path.join(roots[1], 'legacy')).filter((rule) => watched.includes(rule)),
    ).toEqual(['OptionalGet']);
  });

  it('lints a project with a javac plug-in, preview features, a module descriptor or a source root outside it', () => {
    const lint = (module) =>
      readLintFindings(path.join(roots[1], module, 'build', 'nitpicker'), {
        projectRoot: roots[1],
      }).map(({ path: file, rule, location }) => `${file}:${String(location?.line)} ${rule}`);

    expect(['plugged', 'preview', 'modular', 'outside'].flatMap((module) => lint(module))).toEqual([
      'plugged/src/main/java/plugged/Names.java:7 rawtypes',
      'preview/src/main/java/preview/Names.java:7 rawtypes',
      'modular/src/main/java/modular/shapes/Shape.java:10 rawtypes',
      'outside/src/main/java/outside/Names.java:7 rawtypes',
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
});
