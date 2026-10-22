import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectJavaFindings } from '../java-diff.mjs';
import { fakeGradleRun } from '../test-support/in-process-gradle.mjs';
import { withoutFollowedImports } from './followed-imports.mjs';

const MAIN = 'src/main/java/demo/A.java';
const TEST = 'src/test/java/demo/ATest.java';
const SOURCES = {
  [MAIN]: 'package demo;\n\nimport java.util.*;\nimport static java.lang.Math.*;\n',
  [TEST]: 'package demo;\n\nimport static org.junit.Assert.*;\nimport java.util.*;\n',
};
const finding = (tool, rule, file, line) => ({
  tool,
  rule,
  path: file,
  identity: `${rule}:${file}:${String(line)}`,
  message: 'star import',
  classification: 'enforceable',
  location: { line },
});
const FINDINGS = [
  finding('checkstyle', 'AvoidStarImport', MAIN, 3),
  finding('checkstyle', 'AvoidStarImport', MAIN, 4),
  finding('errorprone', 'WildcardImport', TEST, 3),
  finding('checkstyle', 'AvoidStarImport', TEST, 3),
  finding('checkstyle', 'AvoidStarImport', TEST, 4),
  finding('pmd', 'UnusedPrivateField', MAIN, 3),
];
const readSource = (file) => SOURCES[file];
const identities = (findings) => findings.map(({ identity }) => identity);

describe('withoutFollowedImports', () => {
  it('keeps every finding when the project follows the preset', () => {
    expect(withoutFollowedImports(FINDINGS, {}, readSource)).toEqual(FINDINGS);
  });

  it('drops the star import findings of both tools when wildcards are the style', () => {
    const kept = withoutFollowedImports(
      FINDINGS,
      { 'java.wildcardImports': 'wildcard' },
      readSource,
    );

    expect(identities(kept)).toEqual(['UnusedPrivateField:src/main/java/demo/A.java:3']);
  });

  it('drops only the static star imports of test sources when the tests follow the project', () => {
    const kept = withoutFollowedImports(
      FINDINGS,
      { 'java.testStaticImports': 'wildcard' },
      readSource,
    );

    expect(identities(kept)).toEqual([
      'AvoidStarImport:src/main/java/demo/A.java:3',
      'AvoidStarImport:src/main/java/demo/A.java:4',
      'AvoidStarImport:src/test/java/demo/ATest.java:4',
      'UnusedPrivateField:src/main/java/demo/A.java:3',
    ]);
  });

  it('keeps a finding it cannot place', () => {
    const unplaced = { ...FINDINGS[3], location: undefined };

    expect(
      withoutFollowedImports([unplaced], { 'java.testStaticImports': 'wildcard' }, readSource),
    ).toEqual([unplaced]);
    expect(withoutFollowedImports([FINDINGS[3]], { 'java.testStaticImports': 'wildcard' })).toEqual(
      [FINDINGS[3]],
    );
  });
});

describe('the Gradle run', () => {
  const roots = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function projectWithStarImports() {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-imports-'));
    roots.push(root);
    for (const [file, text] of Object.entries(SOURCES)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), text);
    }
    const source = 'com.puppycrawl.tools.checkstyle.checks.imports.AvoidStarImportCheck';
    const message = "Using the '.*' form of import should be avoided.";
    const error = (line) =>
      `<error line="${String(line)}" severity="warning" message="${message}" source="${source}"/>`;
    const fileEntry = (name) =>
      `<file name="${path.join(root, name)}">${error(3)}${error(4)}</file>`;
    writeFileSync(
      path.join(root, 'checkstyle-report.xml'),
      `<checkstyle version="10.21.1">${fileEntry(MAIN)}${fileEntry(TEST)}</checkstyle>`,
    );
    return root;
  }

  const starImportsOf = (root, conventions) =>
    collectJavaFindings(root, { ...fakeGradleRun, policy: { preset: 'java', conventions } })
      .filter(({ rule }) => rule === 'AvoidStarImport')
      .map(({ path: file, location }) => `${file}:${String(location.line)}`);

  it('reports the star imports of a project that follows the preset', () => {
    expect(starImportsOf(projectWithStarImports(), undefined)).toEqual([
      `${MAIN}:3`,
      `${MAIN}:4`,
      `${TEST}:3`,
      `${TEST}:4`,
    ]);
  });

  it('reports none when wildcard imports are the style and the static ones of tests only when the tests follow', () => {
    const root = projectWithStarImports();

    expect(starImportsOf(root, { 'java.wildcardImports': 'wildcard' })).toEqual([]);
    expect(starImportsOf(root, { 'java.testStaticImports': 'wildcard' })).toEqual([
      `${MAIN}:3`,
      `${MAIN}:4`,
      `${TEST}:4`,
    ]);
  });
});
