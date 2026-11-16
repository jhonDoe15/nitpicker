import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport as parseAnalyzerReportUntyped } from '../../../../core/diff/comparison/finding-schema.mjs';
import { withoutRouteFields } from '../../../../core/exceptions/test-support/route-check.mts';
import { ingestFormatCheck } from '../../../../shared/ingest/format-check.mjs';
import type { Finding } from '../../../../shared/values/findings.mts';
import { findingsOf } from '../typed/java-values.mts';
import type { JavaFinding } from '../typed/java-values.mts';
import { readJavaFindings as readFindings } from './java-reports.mts';
import { readingFrom, rootReports } from '../test-support/report-base.mts';
import {
  projectWithReports,
  removeTemporaryReportProjects,
} from './__tests__/java-report-project.mts';

const readReadout = readingFrom(readFindings);

const parseAnalyzerReport: (
  report: { readonly findings: unknown },
  preset: string,
) => { readonly findings: readonly Finding[] } = parseAnalyzerReportUntyped;

type Options = Readonly<Record<string, unknown>>;
type Row = (string | RegExp)[];

function readJavaFindings(root: string, options: Options = {}): { findings: JavaFinding[] } {
  const readout: unknown = readReadout(root, options);
  return { findings: findingsOf(isObject(readout) ? readout['findings'] : []) };
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

afterEach(removeTemporaryReportProjects);

const CS_INDENT = 'Indentation';
const CS_LENGTH = 'LineLength';
const CS_LENGTH_SOURCE = 'com.puppycrawl.tools.checkstyle.checks.sizes.LineLengthCheck';

function identities(findings: readonly JavaFinding[]): string[][] {
  return findings.map(({ tool, rule, path: file, identity }) => [tool, rule, file, identity ?? '']);
}

function identityMatches(actual: readonly string[][], expected: readonly Row[]): Row[] {
  return actual.map((row, index) =>
    row.map((value, column) => {
      const wanted = expected[index]?.[column];
      return wanted instanceof RegExp && wanted.test(value) ? wanted : value;
    }),
  );
}

function first(findings: readonly JavaFinding[]): JavaFinding {
  const found = findings[0];
  if (found === undefined) {
    throw new Error('expected a finding');
  }
  return found;
}

function ratchetOf(finding: JavaFinding | undefined): { key: unknown; value: unknown } {
  const ratchet = isObject(finding) ? finding['ratchet'] : undefined;
  return {
    key: isObject(ratchet) ? ratchet['key'] : undefined,
    value: isObject(ratchet) ? ratchet['value'] : undefined,
  };
}

describe('readJavaFindings', () => {
  const bad = 'src/main/java/demo/Bad.java';

  it('turns the preset reports into schema-valid, project-relative findings', () => {
    const { findings } = readJavaFindings(projectWithReports());

    expect(withoutRouteFields(parseAnalyzerReport({ findings }, 'java').findings)).toEqual(
      findings,
    );
    const expected: Row[] = [
      ['pmd', 'EmptyCatchBlock', bad, 'fp:nitpicker/subject=Avoid empty catch blocks'],
      ['pmd', 'EmptyCatchBlock', bad, 'fp:nitpicker/subject=Avoid empty catch blocks#2'],
      ['spotbugs', 'DM_DEFAULT_ENCODING', bad, 'fp:nitpicker/subject=demo.Bad.decode'],
      ['google-java-format', 'format', bad, 'format'],
      ['checkstyle', CS_INDENT, bad, /^[0-9a-f]+/],
      ['checkstyle', CS_INDENT, bad, /^[0-9a-f]+.*#2$/],
      ['checkstyle', CS_LENGTH, bad, /^[0-9a-f]+/],
      ['jacoco', 'line-coverage', bad, 'line-coverage'],
      ['jacoco', 'uncovered-method', bad, /^cov:/],
      ['crap', 'crap-score-limit', bad, /^function:Bad\.decode\(byte\[\]\):source:[0-9a-f]{24}$/],
      ['jacoco', 'changed-branch-coverage', bad, /^branch-source:/],
      [
        'duplicates',
        'duplicate-clone',
        'src/main/java/demo/Bad.java',
        /^pair:src\/main\/java\/demo\/Bad\.java\|src\/main\/java\/demo\/Copy\.java:fragment:[0-9a-f]+:occurrence:1$/,
      ],
      [
        'duplicates',
        'duplicate-clone-size',
        bad,
        'pair:src/main/java/demo/Bad.java|src/main/java/demo/Copy.java:occurrence:1:lines',
      ],
      [
        'duplicates',
        'duplicate-clone-size',
        bad,
        'pair:src/main/java/demo/Bad.java|src/main/java/demo/Copy.java:occurrence:1:tokens',
      ],
    ];

    expect(identityMatches(identities(findings), expected)).toEqual(expected);
  });

  it('enforces PMD, SpotBugs (even at level note) and formatting; coverage only describes', () => {
    const { findings } = readJavaFindings(projectWithReports());

    expect(
      [
        ...new Set(findings.map((finding) => `${finding.tool} ${finding.classification ?? ''}`)),
      ].sort(),
    ).toEqual([
      'checkstyle enforceable',
      'crap enforceable',
      'duplicates descriptive',
      'duplicates enforceable',
      'google-java-format enforceable',
      'jacoco descriptive',
      'jacoco enforceable',
      'pmd enforceable',
      'spotbugs enforceable',
    ]);
  });

  it('applies the configured CRAP limit instead of the default', () => {
    const root = projectWithReports();
    const rules = (options: Options) =>
      readJavaFindings(root, options)
        .findings.filter(({ tool }) => tool === 'crap')
        .map(({ rule }) => rule);

    expect(rules({})).toEqual(['crap-score-limit']);
    expect(rules({ crapLimit: 156.5 })).toEqual([]);
    expect(rules({ crapLimit: 156 })).toEqual(['crap-score-limit']);
  });

  it('re-keys the CRAP finding when the method text changes but keeps its ratchet key', () => {
    const crapOf = (root: string) =>
      first(readJavaFindings(root).findings.filter(({ rule }) => rule === 'crap-score-limit'));
    const root = projectWithReports();
    const before = crapOf(root);
    const sourceFile = path.join(root, 'src/main/java/demo/Bad.java');
    writeFileSync(sourceFile, readFileSync(sourceFile, 'utf8').replace('bytes)', 'bytes, UTF_8)'));

    const after = crapOf(root);

    expect(after.identity).not.toBe(before.identity);
    expect(ratchetOf(after).key).toBe(ratchetOf(before).key);
    expect(ratchetOf(after).value).toBe(ratchetOf(before).value);
  });

  it('keeps identities when every reported line moves', () => {
    const before = readJavaFindings(projectWithReports()).findings;
    const after = readJavaFindings(projectWithReports({ shift: 17 })).findings;

    expect(identities(after)).toEqual(identities(before));
    expect(first(after).location?.line).toBe((first(before).location?.line ?? 0) + 17);
  });

  it("reads the test sources' Checkstyle report and inline suppressions like the main ones", () => {
    const root = projectWithReports();
    const testFile = path.join(root, 'src/test/java/demo/BadTest.java');
    mkdirSync(path.dirname(testFile), { recursive: true });
    writeFileSync(testFile, '@SuppressWarnings("PMD")\nclass BadTest {}\n');
    writeFileSync(
      path.join(rootReports(root), 'manifest.json'),
      JSON.stringify({ sourceRoots: ['src/main/java'], testSourceRoots: ['src/test/java'] }),
    );
    writeFileSync(
      path.join(rootReports(root), 'checkstyle-test.xml'),
      `<checkstyle><file name="${testFile}"><error line="2" severity="warning" message="Too long" source="${CS_LENGTH_SOURCE}"/></file></checkstyle>`,
    );

    const onTests = readJavaFindings(root).findings.filter(
      ({ path: file }) => file === 'src/test/java/demo/BadTest.java',
    );

    expect(onTests.map(({ tool, rule }) => `${tool} ${rule}`)).toEqual([
      `checkstyle ${CS_LENGTH}`,
      'pmd InlineSuppression',
    ]);
  });

  it('reads the Checkstyle report of every other source set', () => {
    const root = projectWithReports();
    const file = path.join(root, 'src/integration/java/demo/BigIt.java');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, 'class BigIt {}\n');
    writeFileSync(
      path.join(rootReports(root), 'manifest.json'),
      JSON.stringify({ sourceRoots: ['src/main/java'], testSourceRoots: ['src/integration/java'] }),
    );
    writeFileSync(
      path.join(rootReports(root), 'checkstyle-integration.xml'),
      `<checkstyle><file name="${file}"><error line="1" severity="warning" message="Too long" source="${CS_LENGTH_SOURCE}"/></file></checkstyle>`,
    );

    const findings = readJavaFindings(root).findings.filter(
      ({ path: found }) => found === 'src/integration/java/demo/BigIt.java',
    );

    expect(findings.map(({ tool, rule }) => `${tool} ${rule}`)).toEqual([
      `checkstyle ${CS_LENGTH}`,
    ]);
  });

  it('keeps a PMD identity when a line number in its message moves', () => {
    const identityOf = (line: number) => {
      const root = projectWithReports();
      const uri = `file://${path.join(root, 'src/main/java/demo/Bad.java')}`;
      const text = `The String literal "x" appears 2 times in this file; the first occurrence is on line ${String(line)}`;
      const result = {
        ruleId: 'AvoidDuplicateLiterals',
        message: { text },
        locations: [{ physicalLocation: { artifactLocation: { uri }, region: { startLine: 4 } } }],
      };
      writeFileSync(
        path.join(rootReports(root), 'pmd.sarif'),
        JSON.stringify({
          runs: [{ tool: { driver: { name: 'PMD', rules: [] } }, results: [result] }],
        }),
      );
      return first(
        readJavaFindings(root).findings.filter(({ rule }) => rule === 'AvoidDuplicateLiterals'),
      );
    };

    expect(identityOf(4).identity).toBe(identityOf(9).identity);
  });

  it('skips test sources the manifest does not list, but needs the main Checkstyle report', () => {
    const root = projectWithReports();
    const testFile = path.join(root, 'src/test/java/demo/BadTest.java');
    mkdirSync(path.dirname(testFile), { recursive: true });
    writeFileSync(testFile, '@SuppressWarnings("PMD")\nclass BadTest {}\n');
    const findings = readJavaFindings(root).findings;
    rmSync(path.join(rootReports(root), 'checkstyle.xml'));

    expect(findings.filter(({ path: file }) => file.startsWith('src/test/'))).toEqual([]);
    expect(() => readJavaFindings(root)).toThrow(
      new Error('The java preset found no Checkstyle report for project :'),
    );
  });
});

describe('readJavaFindings: ArchUnit', () => {
  const failure = (lines: readonly string[]) =>
    `<testsuite name="demo.ArchitectureTest"><testcase name="no_dates" classname="demo.ArchitectureTest"><failure message="${lines.join('&#10;')}"/></testcase></testsuite>`;

  function withArchunit(lines: readonly string[]) {
    const root = projectWithReports();
    const manifest = path.join(rootReports(root), 'manifest.json');
    writeFileSync(
      manifest,
      JSON.stringify({ sourceRoots: ['src/main/java'], testSourceRoots: ['src/test/java'] }),
    );
    mkdirSync(path.join(rootReports(root), 'archunit'));
    writeFileSync(
      path.join(rootReports(root), 'archunit/TEST-demo.ArchitectureTest.xml'),
      failure(lines),
    );
    return root;
  }

  it('attaches violations to the offending class source file, not the line', () => {
    const lines = (line: number) => [
      'Architecture Violation - Rule &apos;no dates&apos; was violated (1 times):',
      `Method &lt;demo.Bad.decode()&gt; calls constructor &lt;java.util.Date.&lt;init&gt;()&gt; in (Bad.java:${String(line)})`,
    ];
    const before = readJavaFindings(withArchunit(lines(9))).findings.filter(
      (finding) => finding.tool === 'archunit',
    );
    const after = readJavaFindings(withArchunit(lines(40))).findings.filter(
      (finding) => finding.tool === 'archunit',
    );

    expect(parseAnalyzerReport({ findings: before }, 'java').findings).toEqual(before);
    expect(identities(before)).toEqual([
      ['archunit', 'no_dates', 'src/main/java/demo/Bad.java', 'demo.Bad'],
    ]);
    expect(identities(after)).toEqual(identities(before));
    expect(first(before).classification).toBe('enforceable');
  });

  it('reads nothing when the project has no ArchUnit report', () => {
    const { findings } = readJavaFindings(projectWithReports());

    expect(findings.some((finding) => finding.tool === 'archunit')).toBe(false);
  });
});

describe('readJavaFindings: PIT', () => {
  const mutation = (status: string, line: number) =>
    `<mutation detected='false' status='${status}' numberOfTestsRun='1'><sourceFile>Bad.java</sourceFile><mutatedClass>demo.Bad</mutatedClass><mutatedMethod>decode</mutatedMethod><methodDescription>([B)Ljava/lang/String;</methodDescription><lineNumber>${String(line)}</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.EmptyObjectReturnValsMutator</mutator><indexes><index>1</index></indexes><blocks><block>0</block></blocks><killingTest/><description>replaced return value</description></mutation>`;

  function withPit(line: number) {
    const root = projectWithReports();
    mkdirSync(path.join(rootReports(root), 'pit'));
    writeFileSync(
      path.join(rootReports(root), 'pit/mutations.xml'),
      `<mutations>${mutation('NO_COVERAGE', line)}</mutations>`,
    );
    return root;
  }

  it('attaches mutants to the project-relative source file, whatever the line', () => {
    const pit = (line: number) =>
      readJavaFindings(withPit(line)).findings.filter((finding) => finding.tool === 'pit');
    const before = pit(9);

    expect(parseAnalyzerReport({ findings: before }, 'java').findings).toEqual(before);
    expect(
      before.map(({ rule, path: file, classification }) => [rule, file, classification]),
    ).toEqual([
      ['mutant-nocoverage', 'src/main/java/demo/Bad.java', 'enforceable'],
      ['mutation-summary', '.', 'descriptive'],
    ]);
    expect(pit(40).map((finding) => finding.identity)).toEqual(
      before.map((finding) => finding.identity),
    );
  });

  it('reads nothing when there is no PIT report', () => {
    const { findings } = readJavaFindings(projectWithReports());

    expect(findings.some((finding) => finding.tool === 'pit')).toBe(false);
  });
});

describe('readJavaFindings: Spring configuration', () => {
  const spring = (findings: readonly JavaFinding[]) =>
    findings.filter(({ tool }) => tool === 'spring').map(({ rule, path: file }) => [rule, file]);

  function withApplicationFiles() {
    const root = projectWithReports();
    mkdirSync(path.join(root, 'src/main/resources'), { recursive: true });
    mkdirSync(path.join(root, 'conf'), { recursive: true });
    writeFileSync(
      path.join(root, 'src/main/resources/application.properties'),
      'server.error.include-stacktrace=always\n',
    );
    writeFileSync(path.join(root, 'conf/application.yml'), 'app.password: hunter2\n');
    return root;
  }

  function writeManifest(root: string, manifest: Options) {
    writeFileSync(
      path.join(rootReports(root), 'manifest.json'),
      JSON.stringify({ sourceRoots: ['src/main/java'], ...manifest }),
    );
  }

  it('reads application files from the default and the manifest resource roots', () => {
    const root = withApplicationFiles();
    writeManifest(root, { spring: true });

    expect(spring(readJavaFindings(root).findings)).toEqual([
      ['error-details', 'src/main/resources/application.properties'],
    ]);

    writeManifest(root, { spring: true, resourceRoots: ['conf'] });

    expect(spring(readJavaFindings(root).findings)).toEqual([
      ['literal-secret', 'conf/application.yml'],
    ]);
  });

  it.each([{ spring: false }, {}, { spring: 'true' }, { spring: 1 }])(
    'reads nothing unless the manifest says the project uses Spring (%j)',
    (manifest) => {
      const root = withApplicationFiles();
      writeManifest(root, manifest);

      expect(spring(readJavaFindings(root).findings)).toEqual([]);
    },
  );

  it('adds nothing for projects without application files', () => {
    const root = projectWithReports();
    writeManifest(root, { spring: true });

    expect(spring(readJavaFindings(root).findings)).toEqual([]);
  });
});

describe('ingestFormatCheck', () => {
  it('reports each listed file once with a path-independent identity', () => {
    const { findings } = ingestFormatCheck(
      'src/A.java\n\n./src/A.java\nsrc/B.java\n/abs/C.java\n',
      {
        tool: 'formatter',
      },
    );

    expect(findings.map(({ path: file, identity }) => [file, identity])).toEqual([
      ['src/A.java', 'format'],
      ['src/B.java', 'format'],
    ]);
  });
});
