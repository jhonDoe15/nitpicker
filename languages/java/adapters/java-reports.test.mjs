import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/finding-schema.mjs';
import { ingestFormatCheck } from '../ingest/format-check.mjs';
import { readJavaFindings } from './java-reports.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const JACOCO = `<?xml version="1.0" encoding="UTF-8"?>
<report name="demo"><package name="demo">
  <class name="demo/Bad" sourcefilename="Bad.java">
    <method name="decode" desc="([B)Ljava/lang/String;" line="9">
      <counter type="LINE" missed="3" covered="0"/>
    </method>
  </class>
  <sourcefile name="Bad.java"><line nr="9" mi="2" ci="0" mb="2" cb="0"/><counter type="LINE" missed="3" covered="1"/></sourcefile>
</package></report>`;

// Writes a Gradle project directory holding the reports the init script would produce. `shift`
// moves every reported line down, like an edit above the findings.
function projectWithReports({ shift = 0 } = {}) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-reports-')));
  temporaryRoots.push(root);
  const reports = path.join(root, 'build/nitpicker');
  const sourceFile = path.join(root, 'src/main/java/demo/Bad.java');
  mkdirSync(reports, { recursive: true });
  mkdirSync(path.dirname(sourceFile), { recursive: true });
  // Line 9 (moved down by `shift`) holds the branch JaCoCo reports as uncovered.
  const sourceLines = Array.from({ length: 9 + shift }, () => '');
  sourceLines[8 + shift] = '    return new String(bytes);';
  writeFileSync(sourceFile, `${sourceLines.join('\n')}\n`);
  writeFileSync(
    path.join(reports, 'manifest.json'),
    JSON.stringify({ versions: {}, sourceRoots: ['src/main/java', 'src/missing/java'] }),
  );
  const run = (name, results) => ({
    runs: [{ tool: { driver: { name, rules: [] } }, results }],
  });
  const at = (uri, line) => [
    { physicalLocation: { artifactLocation: { uri }, region: { startLine: line + shift } } },
  ];
  writeFileSync(
    path.join(reports, 'pmd.sarif'),
    JSON.stringify(
      run('PMD', [
        {
          ruleId: 'EmptyCatchBlock',
          message: { text: 'Avoid empty catch blocks' },
          locations: at(`file://${sourceFile}`, 8),
        },
        {
          ruleId: 'EmptyCatchBlock',
          message: { text: 'Avoid empty catch blocks' },
          locations: at(`file://${sourceFile}`, 20),
        },
        {
          ruleId: 'EmptyCatchBlock',
          message: { text: 'Outside the project' },
          locations: at('file:///elsewhere/Other.java', 1),
        },
      ]),
    ),
  );
  writeFileSync(
    path.join(reports, 'spotbugs.sarif'),
    JSON.stringify(
      run('SpotBugs', [
        {
          ruleId: 'DM_DEFAULT_ENCODING',
          level: 'note',
          message: { text: 'Reliance on default encoding', arguments: ['demo.Bad.decode'] },
          locations: at('demo/Bad.java', 10),
        },
      ]),
    ),
  );
  writeFileSync(path.join(reports, 'format.txt'), `${sourceFile}\n`);
  writeFileSync(
    path.join(reports, 'jacoco.xml'),
    JACOCO.replace('line="9"', `line="${String(9 + shift)}"`).replace(
      'nr="9"',
      `nr="${String(9 + shift)}"`,
    ),
  );
  writeFileSync(
    path.join(reports, 'checkstyle.xml'),
    readFileSync(path.join(import.meta.dirname, 'fixtures/checkstyle.xml'), 'utf8')
      .replaceAll('@SOURCE@', sourceFile)
      .replace(/line="(\d+)"/g, (_, line) => `line="${Number(line) + shift}"`),
  );
  // One complex function that the JaCoCo method above (0 of 3 lines covered) belongs to.
  writeFileSync(
    path.join(reports, 'structure.json'),
    JSON.stringify([
      {
        file: 'src/main/java/demo/Bad.java',
        name: 'Bad.decode',
        start: 8 + shift,
        end: 14 + shift,
        lines: 7,
        statements: 9,
        maxControlNesting: 1,
        parameters: 1,
        complexity: 12,
        signature: 'Bad.decode(byte[])',
      },
    ]),
  );
  // The jscpd sample report (one clone); `shift` moves its start lines like the other reports.
  const jscpd = JSON.parse(
    readFileSync(path.join(import.meta.dirname, 'fixtures/jscpd-report.json'), 'utf8'),
  );
  for (const clone of jscpd.duplicates) {
    clone.firstFile.start += shift;
    clone.secondFile.start += shift;
  }
  writeFileSync(
    path.join(reports, 'duplicates.json'),
    JSON.stringify({ runs: [{ root: 'src/main/java', report: jscpd }] }),
  );
  return root;
}

const CS_INDENT = 'com.puppycrawl.tools.checkstyle.checks.indentation.IndentationCheck';
const CS_LENGTH = 'com.puppycrawl.tools.checkstyle.checks.sizes.LineLengthCheck';

const identities = (findings) =>
  findings.map(({ tool, rule, path: file, identity }) => [tool, rule, file, identity]);

describe('readJavaFindings', () => {
  const bad = 'src/main/java/demo/Bad.java';

  it('turns the preset reports into schema-valid, project-relative findings', () => {
    const { findings } = readJavaFindings(projectWithReports());

    expect(parseAnalyzerReport({ findings }, 'java').findings).toEqual(findings);
    expect(identities(findings)).toEqual([
      ['pmd', 'EmptyCatchBlock', bad, 'fp:nitpicker/subject=Avoid empty catch blocks'],
      ['pmd', 'EmptyCatchBlock', bad, 'fp:nitpicker/subject=Avoid empty catch blocks#2'],
      ['spotbugs', 'DM_DEFAULT_ENCODING', bad, 'fp:nitpicker/subject=demo.Bad.decode'],
      ['google-java-format', 'format', bad, 'format'],
      ['checkstyle', CS_INDENT, bad, expect.stringMatching(/^[0-9a-f]+/)],
      ['checkstyle', CS_INDENT, bad, expect.stringMatching(/^[0-9a-f]+.*#2$/)],
      ['checkstyle', CS_LENGTH, bad, expect.stringMatching(/^[0-9a-f]+/)],
      [
        'duplicates',
        'duplicate-clone',
        'src/main/java/demo/Bad.java',
        expect.stringMatching(
          /^pair:src\/main\/java\/demo\/Bad\.java\|src\/main\/java\/demo\/Copy\.java:fragment:[0-9a-f]+:occurrence:1$/,
        ),
      ],
      ['duplicates', 'duplicate-clone-size', bad, expect.stringContaining(':lines')],
      ['duplicates', 'duplicate-clone-size', bad, expect.stringContaining(':tokens')],
      ['jacoco', 'line-coverage', bad, 'line-coverage'],
      ['jacoco', 'uncovered-method', bad, expect.stringMatching(/^cov:/)],
      [
        'crap',
        'crap-score-limit',
        bad,
        expect.stringMatching(/^function:Bad\.decode\(byte\[\]\):source:[0-9a-f]{24}$/),
      ],
      ['jacoco', 'changed-branch-coverage', bad, expect.stringMatching(/^branch-source:/)],
    ]);
  });

  it('gives a find-sec-bugs result the allowed form and its exception route', () => {
    const root = projectWithReports();
    const result = (method) => ({
      ruleId: 'SQL_INJECTION_SPRING_JDBC',
      message: { text: 'Potential JDBC Injection', arguments: ['JdbcTemplate.queryForList'] },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: 'demo/Bad.java' },
            region: { startLine: 10 },
          },
          logicalLocations: [{ fullyQualifiedName: method }],
        },
      ],
    });
    writeFileSync(
      path.join(root, 'build/nitpicker/spotbugs.sarif'),
      JSON.stringify({
        runs: [
          {
            tool: { driver: { name: 'SpotBugs' } },
            results: [result('demo.Bad.one()'), result('demo.Bad.two()')],
          },
        ],
      }),
    );

    const found = readJavaFindings(root).findings.filter(({ tool }) => tool === 'spotbugs');

    const advice =
      'Pass values as bind parameters (:name with JdbcClient or NamedParameterJdbcTemplate, setParameter in JPA) and never build query text from input. If it is right here, add an exception for spotbugs/SQL_INJECTION_SPRING_JDBC in nitpicker.config.json.';
    expect(found.map(({ message }) => message)).toEqual([advice, advice]);
    expect(found.map(({ identity }) => identity)).toEqual([
      'fp:nitpicker/subject=JdbcTemplate.queryForList demo.Bad.one',
      'fp:nitpicker/subject=JdbcTemplate.queryForList demo.Bad.two',
    ]);
  });

  it('enforces PMD, SpotBugs (even at level note) and formatting; coverage only describes', () => {
    const { findings } = readJavaFindings(projectWithReports());

    expect(
      [...new Set(findings.map((finding) => `${finding.tool} ${finding.classification}`))].sort(),
    ).toEqual([
      'checkstyle enforceable',
      'crap enforceable',
      'duplicates descriptive', // duplicate-clone-size
      'duplicates enforceable', // duplicate-clone
      'google-java-format enforceable',
      'jacoco descriptive',
      'jacoco enforceable', // only changed-branch-coverage
      'pmd enforceable',
      'spotbugs enforceable',
    ]);
  });

  it('applies the configured CRAP limit instead of the default', () => {
    const root = projectWithReports();
    const rules = (options) =>
      readJavaFindings(root, options)
        .findings.filter(({ tool }) => tool === 'crap')
        .map(({ rule }) => rule);

    expect(rules({})).toEqual(['crap-score-limit']);
    expect(rules({ crapLimit: 156.5 })).toEqual([]);
    expect(rules({ crapLimit: 156 })).toEqual(['crap-score-limit']);
  });

  it('re-keys the CRAP finding when the method text changes but keeps its ratchet key', () => {
    const crapOf = (root) =>
      readJavaFindings(root).findings.find(({ rule }) => rule === 'crap-score-limit');
    const root = projectWithReports();
    const before = crapOf(root);
    const sourceFile = path.join(root, 'src/main/java/demo/Bad.java');
    writeFileSync(sourceFile, readFileSync(sourceFile, 'utf8').replace('bytes)', 'bytes, UTF_8)'));

    const after = crapOf(root);

    expect(after.identity).not.toBe(before.identity);
    expect(after.ratchet.key).toBe(before.ratchet.key);
    expect(after.ratchet.value).toBe(before.ratchet.value);
  });

  it('keeps identities when every reported line moves', () => {
    const before = readJavaFindings(projectWithReports()).findings;
    const after = readJavaFindings(projectWithReports({ shift: 17 })).findings;

    expect(identities(after)).toEqual(identities(before));
    expect(after[0].location.line).toBe(before[0].location.line + 17);
  });

  it("reads the test sources' Checkstyle report and inline suppressions like the main ones", () => {
    const root = projectWithReports();
    const testFile = path.join(root, 'src/test/java/demo/BadTest.java');
    mkdirSync(path.dirname(testFile), { recursive: true });
    writeFileSync(testFile, '@SuppressWarnings("PMD")\nclass BadTest {}\n');
    writeFileSync(
      path.join(root, 'build/nitpicker/manifest.json'),
      JSON.stringify({ sourceRoots: ['src/main/java'], testSourceRoots: ['src/test/java'] }),
    );
    writeFileSync(
      path.join(root, 'build/nitpicker/checkstyle-test.xml'),
      `<checkstyle><file name="${testFile}"><error line="2" severity="warning" message="Too long" source="${CS_LENGTH}"/></file></checkstyle>`,
    );

    const onTests = readJavaFindings(root).findings.filter(
      ({ path: file }) => file === 'src/test/java/demo/BadTest.java',
    );

    expect(onTests.map(({ tool, rule }) => `${tool} ${rule}`)).toEqual([
      `checkstyle ${CS_LENGTH}`,
      'pmd InlineSuppression',
    ]);
  });

  it('keeps a PMD identity when a line number in its message moves', () => {
    const identityOf = (line) => {
      const root = projectWithReports();
      const uri = `file://${path.join(root, 'src/main/java/demo/Bad.java')}`;
      const text = `The String literal "x" appears 2 times in this file; the first occurrence is on line ${String(line)}`;
      const result = {
        ruleId: 'AvoidDuplicateLiterals',
        message: { text },
        locations: [
          { physicalLocation: { artifactLocation: { uri }, region: { startLine: line } } },
        ],
      };
      writeFileSync(
        path.join(root, 'build/nitpicker/pmd.sarif'),
        JSON.stringify({
          runs: [{ tool: { driver: { name: 'PMD', rules: [] } }, results: [result] }],
        }),
      );
      return readJavaFindings(root).findings.find(({ rule }) => rule === 'AvoidDuplicateLiterals');
    };

    expect(identityOf(4).identity).toBe(identityOf(9).identity);
  });

  it('skips test sources the manifest does not list, but needs the main Checkstyle report', () => {
    const root = projectWithReports();
    const testFile = path.join(root, 'src/test/java/demo/BadTest.java');
    mkdirSync(path.dirname(testFile), { recursive: true });
    writeFileSync(testFile, '@SuppressWarnings("PMD")\nclass BadTest {}\n');
    const findings = readJavaFindings(root).findings;
    rmSync(path.join(root, 'build/nitpicker/checkstyle.xml'));

    expect(findings.filter(({ path: file }) => file.startsWith('src/test/'))).toEqual([]);
    expect(() => readJavaFindings(root)).toThrow(
      `ENOENT: no such file or directory, open '${path.join(root, 'build/nitpicker/checkstyle.xml')}'`,
    );
  });
});

describe('readJavaFindings: ArchUnit', () => {
  const failure = (lines) =>
    `<testsuite name="demo.ArchitectureTest"><testcase name="no_dates" classname="demo.ArchitectureTest"><failure message="${lines.join('&#10;')}"/></testcase></testsuite>`;

  function withArchunit(lines) {
    const root = projectWithReports();
    const manifest = path.join(root, 'build/nitpicker/manifest.json');
    writeFileSync(
      manifest,
      JSON.stringify({ sourceRoots: ['src/main/java'], testSourceRoots: ['src/test/java'] }),
    );
    mkdirSync(path.join(root, 'build/nitpicker/archunit'));
    writeFileSync(
      path.join(root, 'build/nitpicker/archunit/TEST-demo.ArchitectureTest.xml'),
      failure(lines),
    );
    return root;
  }

  it('attaches violations to the offending class source file, not the line', () => {
    const lines = (line) => [
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
    expect(before[0].classification).toBe('enforceable');
  });

  it('reads nothing when the project has no ArchUnit report', () => {
    const { findings } = readJavaFindings(projectWithReports());

    expect(findings.some((finding) => finding.tool === 'archunit')).toBe(false);
  });
});

describe('readJavaFindings: PIT', () => {
  const mutation = (status, line) =>
    `<mutation detected='false' status='${status}' numberOfTestsRun='1'><sourceFile>Bad.java</sourceFile><mutatedClass>demo.Bad</mutatedClass><mutatedMethod>decode</mutatedMethod><methodDescription>([B)Ljava/lang/String;</methodDescription><lineNumber>${String(line)}</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.EmptyObjectReturnValsMutator</mutator><indexes><index>1</index></indexes><blocks><block>0</block></blocks><killingTest/><description>replaced return value</description></mutation>`;

  function withPit(line) {
    const root = projectWithReports();
    mkdirSync(path.join(root, 'build/nitpicker/pit'));
    writeFileSync(
      path.join(root, 'build/nitpicker/pit/mutations.xml'),
      `<mutations>${mutation('NO_COVERAGE', line)}</mutations>`,
    );
    return root;
  }

  it('attaches mutants to the project-relative source file, whatever the line', () => {
    const pit = (line) =>
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
  const spring = (findings) =>
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

  function writeManifest(root, manifest) {
    writeFileSync(
      path.join(root, 'build/nitpicker/manifest.json'),
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
