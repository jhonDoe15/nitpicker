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

const SPOTBUGS = (...uris) =>
  JSON.stringify({
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'SpotBugs', rules: [] } },
        results: uris.map((uri) => ({
          ruleId: 'UUF_UNUSED_PUBLIC_OR_PROTECTED_FIELD',
          message: { text: 'Unused public or protected field.' },
          locations: [
            { physicalLocation: { artifactLocation: { uri }, region: { startLine: 3 } } },
          ],
        })),
      },
    ],
  });

describe('sarifFindings', () => {
  it('keeps a finding on a module source and drops one on a Gradle generated class, by the first location', () => {
    const context = moduleReports({ 'pmd.sarif': '', 'spotbugs.sarif': '' });
    const { projectRoot, reportRoot } = context;
    const write = (file) => {
      mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
      writeFileSync(path.join(projectRoot, file), 'class X {}\n');
    };
    write('core/src/main/java/shop/Money.java');
    write('web/src/main/java/shop/Form.java');
    write('web/build/generated/sources/annotationProcessor/java/main/shop/Form_.java');
    writeFileSync(
      path.join(reportRoot, 'spotbugs.sarif'),
      SPOTBUGS('shop/Form.java', 'shop/Form_.java', 'shop/Money.java'),
    );

    expect(
      sarifFindings({
        ...context,
        sourceRoots: ['core/src/main/java', 'web/src/main/java'],
        allSourceRoots: ['core/src/main/java', 'web/src/main/java'],
      }).map(({ path: file }) => file),
    ).toEqual(['web/src/main/java/shop/Form.java', 'core/src/main/java/shop/Money.java']);
  });

  it('drops a SpotBugs finding on a generated class but keeps one on a project source', () => {
    const context = moduleReports({ 'pmd.sarif': '', 'spotbugs.sarif': '' });
    const { projectRoot, reportRoot } = context;
    mkdirSync(path.join(projectRoot, 'src/main/java/shop'), { recursive: true });
    writeFileSync(path.join(projectRoot, 'src/main/java/shop/Cart.java'), 'class Cart {}\n');
    mkdirSync(path.join(projectRoot, 'target/generated-sources/annotations/shop'), {
      recursive: true,
    });
    writeFileSync(
      path.join(projectRoot, 'target/generated-sources/annotations/shop/Cart_.java'),
      'class Cart_ {}\n',
    );
    writeFileSync(
      path.join(reportRoot, 'spotbugs.sarif'),
      SPOTBUGS('shop/Cart.java', 'shop/Cart_.java', 'shop/Missing_.java'),
    );

    expect(sarifFindings(context).map(({ rule, path: file }) => [rule, file])).toEqual([
      ['UUF_UNUSED_PUBLIC_OR_PROTECTED_FIELD', 'src/main/java/shop/Cart.java'],
    ]);
  });

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
