import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readJavaFindings as readFindings } from '../reporting/java-reports.mjs';
import { readingFrom, reportBaseOf, writeModules } from '../test-support/report-base.mjs';
import { securityMessage } from './security-advice.mjs';

const readJavaFindings = readingFrom(readFindings);
const PATTERN = 'SQL_INJECTION_SPRING_JDBC';
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function sarif(results) {
  return JSON.stringify({ runs: [{ tool: { driver: { name: 'tool', rules: [] } }, results }] });
}

function spotbugsResult(method, line = 10) {
  return {
    ruleId: PATTERN,
    message: { text: 'Potential JDBC Injection', arguments: ['JdbcTemplate.queryForList'] },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: 'demo/Bad.java' },
          region: { startLine: line },
        },
        logicalLocations: [{ fullyQualifiedName: method }],
      },
    ],
  };
}

function projectWithSecurityReports() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-security-reports-')));
  roots.push(root);
  const reports = writeModules(root);
  const sourceFile = path.join(root, 'src/main/java/demo/Bad.java');
  mkdirSync(path.dirname(sourceFile), { recursive: true });
  writeFileSync(sourceFile, `${Array.from({ length: 12 }, () => '').join('\n')}\n`);
  writeFileSync(
    path.join(reports, 'manifest.json'),
    JSON.stringify({ versions: {}, sourceRoots: ['src/main/java'] }),
  );
  const query = {
    ruleId: 'SpringQueryConcatenation',
    message: { text: 'Bind the value' },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: `file://${sourceFile}` },
          region: { startLine: 8 },
        },
      },
    ],
  };
  writeFileSync(path.join(reports, 'pmd.sarif'), sarif([query]));
  writeFileSync(path.join(reports, 'checkstyle.xml'), '<checkstyle version="10"></checkstyle>');
  writeFileSync(path.join(reports, 'format.txt'), '');
  writeFileSync(path.join(reports, 'structure.json'), '[]');
  writeFileSync(path.join(reports, 'classes.json'), JSON.stringify({ files: {}, classes: [] }));
  writeFileSync(path.join(reportBaseOf(root), 'duplicates.json'), JSON.stringify({ runs: [] }));
  writeFileSync(
    path.join(reports, 'spotbugs.sarif'),
    sarif([
      spotbugsResult('a.B.one()'),
      spotbugsResult('a.B.two()'),
      spotbugsResult('a.B.three()', 8),
    ]),
  );
  return root;
}

describe('readJavaFindings: find-sec-bugs', () => {
  it('gives find-sec-bugs results their advice, except a query PMD reports', () => {
    const found = readJavaFindings(projectWithSecurityReports()).findings.filter(
      ({ tool }) => tool === 'spotbugs',
    );

    const route = `{"rule":"spotbugs/${PATTERN}","paths":["src/main/java/demo/Bad.java"],"reason":"..."}`;

    expect(found.map(({ message }) => message)).toEqual(
      Array(2).fill(
        `${securityMessage(PATTERN)} If this is intended, add ${route} to "exceptions" in nitpicker.config.json.`,
      ),
    );
    expect(found.map(({ identity }) => identity)).toEqual([
      'fp:nitpicker/subject=JdbcTemplate.queryForList a.B.one',
      'fp:nitpicker/subject=JdbcTemplate.queryForList a.B.two',
    ]);
  });
});
