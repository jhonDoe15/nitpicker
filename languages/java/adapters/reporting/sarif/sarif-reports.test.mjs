import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readSarifReport, sarifFindings } from './sarif-reports.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function moduleReports(reports) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-sarif-reports-')));
  roots.push(root);
  const reportRoot = path.join(root, 'reports');
  mkdirSync(path.join(root, 'src/test/java/shop'), { recursive: true });
  writeFileSync(path.join(root, 'src/test/java/shop/CartTest.java'), 'class CartTest {}\n');
  mkdirSync(reportRoot, { recursive: true });
  for (const [name, text] of Object.entries(reports)) {
    writeFileSync(path.join(reportRoot, name), text);
  }
  return {
    projectRoot: root,
    reportRoot,
    roots: [root],
    sourceRoots: ['src/main/java'],
    allSourceRoots: ['src/main/java'],
    manifest: {},
  };
}

const PMD = (root) =>
  JSON.stringify({
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'PMD', rules: [] } },
        results: [
          {
            ruleId: 'FixedSleepInTest',
            message: { text: 'A fixed sleep makes the test slow and flaky.' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: `file://${root}/src/test/java/shop/CartTest.java` },
                  region: { startLine: 1 },
                },
              },
            ],
          },
        ],
      },
    ],
  });

describe('sarifFindings', () => {
  it('reads a zero-byte SpotBugs report, as from a module with only tests, as no findings', () => {
    const context = moduleReports({ 'pmd.sarif': '', 'spotbugs.sarif': '' });
    writeFileSync(path.join(context.reportRoot, 'pmd.sarif'), PMD(context.projectRoot));

    expect(sarifFindings(context).map(({ tool, rule, path: file }) => [tool, rule, file])).toEqual([
      ['pmd', 'FixedSleepInTest', 'src/test/java/shop/CartTest.java'],
    ]);
  });

  it('reads blank reports as empty logs and still rejects a truncated one', () => {
    const context = moduleReports({ 'blank.sarif': ' \n', 'broken.sarif': '{"runs": [' });

    expect(readSarifReport(path.join(context.reportRoot, 'blank.sarif'))).toEqual({
      version: '2.1.0',
      runs: [],
    });
    expect(() => readSarifReport(path.join(context.reportRoot, 'broken.sarif'))).toThrow(
      SyntaxError,
    );
  });
});
