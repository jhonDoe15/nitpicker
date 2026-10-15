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
const fixture = path.join(import.meta.dirname, '..', 'adapters', 'fixtures', 'guards-project');
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
  runJavaDuplicates(root);
  return readJavaFindings(root)
    .findings.filter((finding) => isGuard(finding))
    .map(({ tool, rule, path: file, location }) =>
      location === undefined
        ? `${file} ${tool}/${rule}`
        : `${file}:${String(location.line)} ${tool}/${rule}`,
    )
    .sort();
}

describe.skipIf(!enabled)('Java guards on a fixture project', () => {
  let projectRoot;

  beforeAll(
    () => {
      projectRoot = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-guards-')), 'guards');
      cpSync(fixture, projectRoot, { recursive: true });
      const result = spawnSync(
        gradle,
        [
          '--console=plain',
          '--quiet',
          '--no-configuration-cache',
          '-I',
          INIT_SCRIPT,
          'nitpickerJava',
        ],
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

  it('reports exactly the guard violations marked in the fixture, and none on the clean samples', () => {
    expect(reportedViolations(projectRoot)).toEqual(expectedViolations(projectRoot));
  });
});
