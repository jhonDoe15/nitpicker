import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INIT_SCRIPT } from '../adapters/java-diff.mjs';
import { runJavaDuplicates } from '../adapters/java-duplicates.mjs';
import { readJavaFindings } from '../adapters/java-reports.mjs';

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

function reportedViolations(root) {
  return readJavaFindings(root)
    .findings.filter((finding) => isGuard(finding))
    .map(({ tool, rule, path: file, location }) =>
      location === undefined
        ? `${file} ${tool}/${rule}`
        : `${file}:${String(location.line)} ${tool}/${rule}`,
    )
    .sort();
}

function gradleTask(fixture, task) {
  const projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-guards-')), fixture);
  cpSync(path.join(fixtures, fixture), projectRoot, { recursive: true });
  const result = spawnSync(
    gradle,
    ['--console=plain', '--quiet', '--no-configuration-cache', '-I', INIT_SCRIPT, task],
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
      roots.push(gradleTask('guards-project', 'nitpickerJava'));
      runJavaDuplicates(roots[0]);
      roots.push(gradleTask('guards-release-11', 'nitpickerPmd'));
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
    const optionalGet = readJavaFindings(roots[0]).findings.find(
      (finding) => finding.rule === 'OptionalGet',
    );

    expect(optionalGet.message).toBe(OPTIONAL_GET_MESSAGE);
  });

  it('skips the Java 16 rules on a project compiled for an older release', () => {
    const watched = ['OptionalGet', 'InstanceofThenCast', 'CollectorsToList'];

    expect(pmdRules(roots[1]).filter((rule) => watched.includes(rule))).toEqual(['OptionalGet']);
  });
});
