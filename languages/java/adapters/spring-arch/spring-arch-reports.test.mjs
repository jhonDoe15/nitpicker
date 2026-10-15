import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readJavaFindings } from '../reporting/java-reports.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const EMPTY_SARIF = JSON.stringify({ version: '2.1.0', runs: [] });
const EMPTY_REPORTS = {
  'pmd.sarif': EMPTY_SARIF,
  'spotbugs.sarif': EMPTY_SARIF,
  'format.txt': '',
  'jacoco.xml': '<report name="demo"></report>',
  'checkstyle.xml': '<checkstyle version="10"></checkstyle>',
  'structure.json': '[]',
  'duplicates.json': JSON.stringify({ runs: [] }),
};

const at = (rule, className) => ({
  rule,
  className,
  fileName: `${className.slice(5)}.java`,
  detail: '',
});
const violations = [at('spring-layout', 'demo.Bad'), at('spring-test-placement', 'demo.BadTest')];

function project(manifest, writeReport) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-spring-arch-reports-')));
  temporaryRoots.push(root);
  const reports = path.join(root, 'build/nitpicker');
  mkdirSync(reports, { recursive: true });
  mkdirSync(path.join(root, 'src/main/java/demo'), { recursive: true });
  mkdirSync(path.join(root, 'src/test/java/demo'), { recursive: true });
  writeFileSync(path.join(root, 'src/main/java/demo/Bad.java'), '');
  writeFileSync(path.join(root, 'src/test/java/demo/BadTest.java'), '');
  for (const [name, text] of Object.entries(EMPTY_REPORTS)) {
    writeFileSync(path.join(reports, name), text);
  }
  writeFileSync(
    path.join(reports, 'manifest.json'),
    JSON.stringify({
      versions: {},
      sourceRoots: ['src/main/java'],
      testSourceRoots: ['src/test/java'],
      ...manifest,
    }),
  );
  if (writeReport) {
    writeFileSync(
      path.join(reports, 'spring-arch.json'),
      JSON.stringify({ root: 'demo', violations }),
    );
  }
  return root;
}

function architecture(root) {
  return readJavaFindings(root)
    .findings.filter((finding) => finding.rule.startsWith('spring-'))
    .map(({ tool, rule, path: file, identity }) => [tool, rule, file, identity]);
}

describe('readJavaFindings: Spring architecture rules', () => {
  it('attaches each violation to its main or test source file', () => {
    expect(architecture(project({ spring: true }, true))).toEqual([
      ['archunit', 'spring-layout', 'src/main/java/demo/Bad.java', 'Bad'],
      ['archunit', 'spring-test-placement', 'src/test/java/demo/BadTest.java', 'BadTest'],
    ]);
  });

  it.each([true, false])('ignores the report unless Spring is on (written: %s)', (written) => {
    expect(architecture(project({}, written))).toEqual([]);
  });

  it('fails when a Spring project has no report, instead of passing unchecked', () => {
    expect(() => architecture(project({ spring: true }, false))).toThrow(
      'The Spring architecture report spring-arch.json is missing',
    );
  });
});
