import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callUntyped, findingsOf, type JavaFinding } from '../../typed/java-values.mts';
import { readSarifReport, sarifFindings } from './sarif-reports.mjs';

type Context = {
  readonly projectRoot: string;
  readonly reportRoot: string;
  readonly roots: readonly string[];
  readonly sourceRoots: readonly string[];
  readonly allSourceRoots: readonly string[];
  readonly manifest: object;
};
type PmdExtra = {
  readonly invocations?: unknown;
  readonly text?: string;
  readonly region?: object;
};

const roots: string[] = [];

function sarifFindingsOf(context: Context): JavaFinding[] {
  return findingsOf(callUntyped(sarifFindings, context));
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function moduleReports(reports: Readonly<Record<string, string>>): Context {
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

function PMD(root: string, ruleId = 'FixedSleepInTest', extra: PmdExtra = {}): string {
  return JSON.stringify({
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'PMD', rules: [] } },
        ...(extra.invocations === undefined ? {} : { invocations: extra.invocations }),
        results: [
          {
            ruleId,
            message: { text: extra.text ?? 'A fixed sleep makes the test slow and flaky.' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: `file://${root}/src/test/java/shop/CartTest.java` },
                  region: extra.region ?? { startLine: 1 },
                },
              },
            ],
          },
        ],
      },
    ],
  });
}

function SPOTBUGS(...uris: readonly string[]): string {
  return JSON.stringify({
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
}

describe('sarifFindings', () => {
  it('keeps a finding on a module source and drops one on a Gradle generated class, by the first location', () => {
    const context = moduleReports({ 'pmd.sarif': '', 'spotbugs.sarif': '' });
    const { projectRoot, reportRoot } = context;
    function write(file: string): void {
      mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
      writeFileSync(path.join(projectRoot, file), 'class X {}\n');
    }
    write('core/src/main/java/shop/Money.java');
    write('web/src/main/java/shop/Form.java');
    write('web/build/generated/sources/annotationProcessor/java/main/shop/Form_.java');
    writeFileSync(
      path.join(reportRoot, 'spotbugs.sarif'),
      SPOTBUGS('shop/Form.java', 'shop/Form_.java', 'shop/Money.java'),
    );

    expect(
      sarifFindingsOf({
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

    expect(sarifFindingsOf(context).map(({ rule, path: file }) => [rule, file])).toEqual([
      ['UUF_UNUSED_PUBLIC_OR_PROTECTED_FIELD', 'src/main/java/shop/Cart.java'],
    ]);
  });

  it('reads a zero-byte SpotBugs report, as from a module with only tests, as no findings', () => {
    const context = moduleReports({ 'pmd.sarif': '', 'spotbugs.sarif': '' });
    writeFileSync(path.join(context.reportRoot, 'pmd.sarif'), PMD(context.projectRoot));

    expect(
      sarifFindingsOf(context).map(({ tool, rule, path: file }) => [tool, rule, file]),
    ).toEqual([['pmd', 'FixedSleepInTest', 'src/test/java/shop/CartTest.java']]);
  });

  it('prints the CompletableFuture form of the timeout rule under the rule it belongs to', () => {
    const context = moduleReports({ 'pmd.sarif': '', 'spotbugs.sarif': '' });
    writeFileSync(
      path.join(context.reportRoot, 'pmd.sarif'),
      PMD(context.projectRoot, 'timeout-abandons-async-task'),
    );

    expect(sarifFindingsOf(context).map(({ rule }) => rule)).toEqual([
      'timeout-abandons-operation',
    ]);
  });

  it('reports a file PMD could not process next to its findings, from the same report', () => {
    const context = moduleReports({ 'pmd.sarif': '', 'spotbugs.sarif': '' });
    const log = PMD(context.projectRoot, undefined, {
      invocations: [
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
      ],
    });
    writeFileSync(path.join(context.reportRoot, 'pmd.sarif'), log);

    expect(sarifFindingsOf(context).map(({ rule, path: file }) => [rule, file])).toEqual([
      ['FixedSleepInTest', 'src/test/java/shop/CartTest.java'],
      ['processing-error', 'src/test/java/shop/CartTest.java'],
    ]);
  });

  it.each([
    [
      'UnusedAssignment',
      "The value assigned to variable 'total' is never used (overwritten on lines 1052, 1060 and 1068)",
      "The value assigned to variable 'total' is never used (overwritten on lines 1043, 1051 and 1059)",
    ],
    [
      'AvoidDuplicateLiterals',
      "The String literal 'id' appears 4 times in this file; the first occurrence is on line 1,114",
      "The String literal 'id' appears 4 times in this file; the first occurrence is on line 1,105",
    ],
  ])('keeps the identity of %s when the lines its message names move', (rule, before, after) => {
    const context = moduleReports({ 'spotbugs.sarif': '' });
    const identityWith = (text: string): unknown => {
      writeFileSync(
        path.join(context.reportRoot, 'pmd.sarif'),
        PMD(context.projectRoot, rule, { text }),
      );
      return sarifFindingsOf(context).map(({ identity }) => identity);
    };

    expect(identityWith(after)).toEqual(identityWith(before));
  });

  it('prints no unrendered placeholder of a PMD message', () => {
    const context = moduleReports({ 'pmd.sarif': '', 'spotbugs.sarif': '' });
    writeFileSync(
      path.join(context.projectRoot, 'src/test/java/shop/CartTest.java'),
      'class CartTest { String u(String x) { return x.replace("a", "127.0.0.1"); } }\n',
    );
    const log = PMD(context.projectRoot, 'AvoidUsingHardCodedIP', {
      text: `Do not hard code the IP address \${variableName}`,
      region: { startLine: 1, startColumn: 59 },
    });
    writeFileSync(path.join(context.reportRoot, 'pmd.sarif'), log);

    expect(sarifFindingsOf(context).map(({ message }) => message)).toEqual([
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

    expect(sarifFindingsOf(context)).toEqual([]);
  });

  it('reads blank reports as empty logs and still rejects a truncated one', () => {
    const context = moduleReports({ 'blank.sarif': ' \n', 'broken.sarif': '{"runs": [' });

    expect(callUntyped(readSarifReport, path.join(context.reportRoot, 'blank.sarif'))).toEqual({
      version: '2.1.0',
      runs: [],
    });
    expect(() =>
      callUntyped(readSarifReport, path.join(context.reportRoot, 'broken.sarif')),
    ).toThrow(SyntaxError);
  });
});
