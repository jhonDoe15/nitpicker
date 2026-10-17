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
  'checkstyle.xml': '<checkstyle version="13.5.0"></checkstyle>',
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

function projectWithGuardReports({ reports = {}, jscpd = { runs: [] }, sources = {} } = {}) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-guard-reports-')));
  roots.push(root);
  const moduleReports = writeModules(root);
  for (const [name, text] of Object.entries({ ...REPORTS, ...reports })) {
    writeFileSync(path.join(moduleReports, name), text);
  }
  writeFileSync(path.join(reportBaseOf(root), 'duplicates.json'), JSON.stringify(jscpd));
  for (const [file, text] of Object.entries({ [BAD]: 'package demo;\n', ...sources })) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

const BAD = 'src/main/java/demo/Bad.java';
const LEFT = 'src/main/java/demo/Left.java';
const RIGHT = 'src/main/java/demo/Right.java';
const LOGIC = Array.from({ length: 12 }, (_, index) => `    total += compute(${String(index)});`);
const sourceOf = (name) =>
  [
    `class ${name} {`,
    '  int run() {',
    '    int total = 0;',
    ...LOGIC,
    '    return total;',
    '  }',
    '}',
    '',
  ].join('\n');
const CPD = [
  '<?xml version="1.0"?>',
  '<pmd-cpd>',
  '  <duplication lines="8" tokens="120">',
  `    <file path="${LEFT}" line="2" endline="9" begintoken="0" endtoken="9"/>`,
  `    <file path="${RIGHT}" line="2" endline="9" begintoken="0" endtoken="9"/>`,
  '    <codefragment><![CDATA[ignored]]></codefragment>',
  '  </duplication>',
  '</pmd-cpd>',
  '',
].join('\n');
const JSCPD_CLONE = {
  runs: [
    {
      root: '.',
      report: {
        duplicates: [
          {
            firstFile: { name: LEFT, start: 3 },
            secondFile: { name: RIGHT, start: 3 },
            lines: 6,
            tokens: 80,
          },
        ],
      },
    },
  ],
};

function cloneFindings(jscpd) {
  const root = projectWithGuardReports({
    reports: { 'cpd.xml': CPD },
    jscpd,
    sources: { [LEFT]: sourceOf('Left'), [RIGHT]: sourceOf('Right') },
  });
  return readJavaFindings(root, { reportBase: reportBaseOf(root) })
    .findings.filter(({ rule }) => rule === 'duplicate-clone')
    .map(({ path: file, identity }) => [file, identity.split(':')[0]]);
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

  it('keeps the PMD CPD clone and drops the jscpd clone of the same lines', () => {
    const elsewhere = structuredClone(JSCPD_CLONE);
    elsewhere.runs[0].report.duplicates[0].firstFile.start = 40;

    expect(cloneFindings({ runs: [] })).toEqual([[LEFT, 'cpd']]);
    expect(cloneFindings(JSCPD_CLONE)).toEqual([[LEFT, 'cpd']]);
    expect(cloneFindings(elsewhere)).toEqual([
      [LEFT, 'cpd'],
      [LEFT, 'pair'],
    ]);
  });
});
