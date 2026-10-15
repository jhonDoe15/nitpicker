import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readJavaFindings } from './java-reports.mjs';
import { reportBaseOf, writeModules } from '../test-support/report-base.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const EMPTY_SARIF = JSON.stringify({ runs: [{ tool: { driver: { name: 'x', rules: [] } } }] });

const REPORTS = {
  'manifest.json': JSON.stringify({ versions: {}, sourceRoots: ['src/main/java'] }),
  'pmd.sarif': EMPTY_SARIF,
  'spotbugs.sarif': EMPTY_SARIF,
  'format.txt': '',
  'checkstyle.xml': '<checkstyle version="10.21.1"></checkstyle>',
  'jacoco.xml': '<report name="demo"></report>',
  'structure.json': '[]',
  'javac-lint.txt': 'src/main/java/demo/Bad.java:9: warning: [rawtypes] found raw type: List\n',
  'forbidden-apis.txt':
    'ERROR: Forbidden class/interface use: java.util.Date [legacy-date-time: Use java.time.]\n' +
    'ERROR:   in demo.Bad (Bad.java:9)\n',
  'dependencies.json': JSON.stringify({
    buildFile: 'build.gradle',
    analyzed: true,
    declared: [{ configuration: 'implementation', group: 'g', name: 'a', archives: ['a.jar'] }],
  }),
};

function projectWithGuardReports() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-guard-reports-')));
  roots.push(root);
  const reports = writeModules(root);
  for (const [name, text] of Object.entries(REPORTS)) {
    writeFileSync(path.join(reports, name), text);
  }
  writeFileSync(path.join(reportBaseOf(root), 'duplicates.json'), JSON.stringify({ runs: [] }));
  mkdirSync(path.join(root, 'src/main/java/demo'), { recursive: true });
  writeFileSync(path.join(root, 'src/main/java/demo/Bad.java'), 'package demo;\n');
  return root;
}

describe('readJavaFindings: guard reports', () => {
  it('reads the javac lint, forbidden API and dependency reports next to the others', () => {
    const root = projectWithGuardReports();

    const { findings } = readJavaFindings(root, { reportBase: reportBaseOf(root) });

    expect(
      findings
        .filter(({ tool }) => ['javac', 'forbiddenapis', 'dependencies'].includes(tool))
        .map(({ tool, rule, path: file }) => [tool, rule, file]),
    ).toEqual([
      ['javac', 'rawtypes', 'src/main/java/demo/Bad.java'],
      ['forbiddenapis', 'legacy-date-time', 'src/main/java/demo/Bad.java'],
      ['dependencies', 'unused-declared-dependency', 'build.gradle'],
    ]);
  });
});
