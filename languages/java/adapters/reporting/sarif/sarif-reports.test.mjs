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

const PMD = (root, ruleId = 'FixedSleepInTest') =>
  JSON.stringify({
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'PMD', rules: [] } },
        results: [
          {
            ruleId,
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

  it('prints the CompletableFuture form of the timeout rule under the rule it belongs to', () => {
    const context = moduleReports({ 'pmd.sarif': '', 'spotbugs.sarif': '' });
    writeFileSync(
      path.join(context.reportRoot, 'pmd.sarif'),
      PMD(context.projectRoot, 'timeout-abandons-async-task'),
    );

    expect(sarifFindings(context).map(({ rule }) => rule)).toEqual(['timeout-abandons-operation']);
  });

  it('reports a file PMD could not process next to its findings, from the same report', () => {
    const context = moduleReports({ 'pmd.sarif': '', 'spotbugs.sarif': '' });
    const log = JSON.parse(PMD(context.projectRoot));
    log.runs[0].invocations = [
      {
        executionSuccessful: false,
        toolExecutionNotifications: [
          {
            message: { text: 'ContextedRuntimeException: boom\nat Foo' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: `file://${context.projectRoot}/src/test/java/shop/CartTest.java`,
                  },
                },
              },
            ],
          },
        ],
      },
    ];
    writeFileSync(path.join(context.reportRoot, 'pmd.sarif'), JSON.stringify(log));

    expect(sarifFindings(context).map(({ rule, path: file }) => [rule, file])).toEqual([
      ['FixedSleepInTest', 'src/test/java/shop/CartTest.java'],
      ['processing-error', 'src/test/java/shop/CartTest.java'],
    ]);
  });

  it('prints no unrendered placeholder of a PMD message', () => {
    const context = moduleReports({ 'pmd.sarif': '', 'spotbugs.sarif': '' });
    writeFileSync(
      path.join(context.projectRoot, 'src/test/java/shop/CartTest.java'),
      'class CartTest { String u(String x) { return x.replace("a", "127.0.0.1"); } }\n',
    );
    const log = JSON.parse(PMD(context.projectRoot, 'AvoidUsingHardCodedIP'));
    log.runs[0].results[0].message.text = `Do not hard code the IP address \${variableName}`;
    log.runs[0].results[0].locations[0].physicalLocation.region = { startLine: 1, startColumn: 59 };
    writeFileSync(path.join(context.reportRoot, 'pmd.sarif'), JSON.stringify(log));

    expect(sarifFindings(context).map(({ message }) => message)).toEqual([
      'Do not hard code the IP address "127.0.0.1"',
    ]);
  });

  it('drops a HardCodedCryptoKey finding whose key is built from a parameter', () => {
    const context = moduleReports({ 'pmd.sarif': '', 'spotbugs.sarif': '' });
    writeFileSync(
      path.join(context.projectRoot, 'src/test/java/shop/CartTest.java'),
      'class CartTest { Object k(String s) { String x = "a" + s; return new SecretKeySpec(x.getBytes(), "AES"); } }\n',
    );
    writeFileSync(
      path.join(context.reportRoot, 'pmd.sarif'),
      PMD(context.projectRoot, 'HardCodedCryptoKey').replace(
        '"startLine":1',
        '"startLine":1,"startColumn":53',
      ),
    );

    expect(sarifFindings(context)).toEqual([]);
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
