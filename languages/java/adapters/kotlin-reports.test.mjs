import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../core/diff/finding-schema.mjs';
import { readJavaFindings } from './java-reports.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const JACOCO = `<?xml version="1.0" encoding="UTF-8"?>
<report name="demo"><package name="demo">
  <class name="demo/Bad" sourcefilename="Bad.kt">
    <method name="compute" desc="(II)I" line="8"><counter type="LINE" missed="3" covered="0"/></method>
  </class>
  <class name="demo/Legacy" sourcefilename="Legacy.java">
    <method name="pick" desc="(Z)I" line="4"><counter type="LINE" missed="0" covered="3"/></method>
  </class>
  <sourcefile name="Mixed.kt">
    <line nr="3" mi="1" ci="0" mb="2" cb="0"/>
    <counter type="LINE" missed="1" covered="0"/>
  </sourcefile>
  <sourcefile name="Bad.kt">
    <line nr="8" mi="1" ci="0" mb="1" cb="1"/>
    <line nr="9" mi="1" ci="0" mb="2" cb="0"/>
    <counter type="LINE" missed="3" covered="0"/>
  </sourcefile>
  <sourcefile name="Legacy.java">
    <line nr="4" mi="0" ci="3" mb="1" cb="1"/>
    <counter type="LINE" missed="0" covered="3"/>
  </sourcefile>
</package></report>`;

const KOTLIN_SOURCE = `package demo

class Bad {
    private val unused = 42

    fun compute(a: Int, b: Int): Int {
        val x = a * 1000 + b * 2000
        if (x > 5000) return x
        return 7777
    }
}
`;

const MIXED_SOURCE = 'package demo\n\nfun pick(flag: Boolean) = if (flag) 1 else 2\n';

const JAVA_SOURCE =
  'package demo;\n\nclass Legacy {\n  int pick(boolean flag) { return flag ? 1 : 2; }\n}\n';

const mutation = (
  status,
  className,
  sourceFile,
  line,
) => `<mutation detected='false' status='${status}'>
  <sourceFile>${sourceFile}</sourceFile><mutatedClass>${className}</mutatedClass>
  <mutatedMethod>compute</mutatedMethod><methodDescription>(II)I</methodDescription>
  <lineNumber>${String(line)}</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.MathMutator</mutator>
  <description>Replaced integer addition with subtraction</description></mutation>`;

const PIT = `<mutations>${[
  mutation('SURVIVED', 'demo.Bad', 'Bad.kt', 7),
  mutation('NO_COVERAGE', 'demo.BadKt$lambda$1', 'Bad.kt', 8),
  mutation('SURVIVED', 'demo.Legacy', 'Legacy.java', 4),
  mutation('KILLED', 'demo.Bad', 'Bad.kt', 9),
  mutation('SURVIVED', 'kotlin.properties.Delegates', 'Delegates.kt', 3),
].join('\n')}</mutations>`;

const EMPTY_SARIF = JSON.stringify({ version: '2.1.0', runs: [] });

function projectWithKotlinReports({
  manifest = {},
  formatList = 'src/main/kotlin/demo/Bad.kt\n',
} = {}) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-reports-')));
  temporaryRoots.push(root);
  const reports = path.join(root, 'build/nitpicker');
  mkdirSync(reports, { recursive: true });
  mkdirSync(path.join(root, 'src/main/kotlin/demo'), { recursive: true });
  mkdirSync(path.join(root, 'src/main/java/demo'), { recursive: true });
  writeFileSync(path.join(root, 'src/main/kotlin/demo/Bad.kt'), KOTLIN_SOURCE);
  writeFileSync(path.join(root, 'src/main/java/demo/Legacy.java'), JAVA_SOURCE);
  writeFileSync(path.join(root, 'src/main/java/demo/Mixed.kt'), MIXED_SOURCE);
  writeFileSync(
    path.join(reports, 'manifest.json'),
    JSON.stringify({
      versions: {},
      sourceRoots: ['src/main/java'],
      kotlin: true,
      kotlinSourceRoots: ['src/main/java', 'src/main/kotlin'],
      kotlinFormatter: 'ktlint',
      ...manifest,
    }),
  );
  writeFileSync(path.join(reports, 'pmd.sarif'), EMPTY_SARIF);
  writeFileSync(path.join(reports, 'spotbugs.sarif'), EMPTY_SARIF);
  writeFileSync(path.join(reports, 'format.txt'), '');
  writeFileSync(
    path.join(reports, 'checkstyle.xml'),
    '<checkstyle version="10.21.1"></checkstyle>',
  );
  writeFileSync(path.join(reports, 'jacoco.xml'), JACOCO);
  mkdirSync(path.join(reports, 'pit'));
  writeFileSync(path.join(reports, 'pit/mutations.xml'), PIT);
  writeFileSync(path.join(reports, 'lizard.csv'), '');
  writeFileSync(path.join(reports, 'duplicates.json'), JSON.stringify({ runs: [] }));
  writeFileSync(
    path.join(reports, 'detekt.sarif'),
    readFileSync(path.join(import.meta.dirname, '../ingest/fixtures/detekt.sarif'), 'utf8'),
  );
  writeFileSync(path.join(reports, 'kotlin-format.txt'), formatList);
  return root;
}

const kotlinFindings = (root, tool) =>
  readJavaFindings(root, { preset: 'kotlin' }).findings.filter((finding) => finding.tool === tool);

describe('readJavaFindings with the kotlin preset', () => {
  const bad = 'src/main/kotlin/demo/Bad.kt';

  it('turns the detekt report into schema-valid findings without line numbers in identity', () => {
    const { findings } = readJavaFindings(projectWithKotlinReports(), { preset: 'kotlin' });
    const detekt = findings.filter((finding) => finding.tool === 'detekt');

    expect(parseAnalyzerReport({ findings }, 'kotlin').findings).toEqual(findings);
    expect(
      detekt.map(({ rule, path: file, identity, classification }) => [
        rule,
        file,
        identity,
        classification,
      ]),
    ).toEqual([
      ...Array.from({ length: 6 }, (_, index) => [
        'detekt.style.MagicNumber',
        bad,
        `fp:nitpicker/subject=This expression contains a magic number. Consider defining it to a well named constant.${index === 0 ? '' : `#${String(index + 1)}`}`,
        'enforceable',
      ]),
      [
        'detekt.style.UnusedPrivateProperty',
        bad,
        'fp:nitpicker/subject=Private property `unused` is unused.',
        'enforceable',
      ],
    ]);
    expect(detekt[0].location).toEqual({ line: 6, column: 26 });
  });

  it('keeps fingerprints a detekt result already has and treats note-level results as descriptive', () => {
    const root = projectWithKotlinReports();
    const at = { physicalLocation: { artifactLocation: { uri: bad }, region: { startLine: 3 } } };
    writeFileSync(
      path.join(root, 'build/nitpicker/detekt.sarif'),
      JSON.stringify({
        runs: [
          {
            tool: { driver: { name: 'detekt' } },
            results: [
              {
                ruleId: 'detekt.style.MagicNumber',
                level: 'warning',
                message: { text: 'Magic' },
                partialFingerprints: { signature: 'abc' },
                locations: [at],
              },
              {
                ruleId: 'detekt.style.ForbiddenComment',
                level: 'note',
                message: { text: 'Todo' },
                locations: [at],
              },
            ],
          },
        ],
      }),
    );

    expect(
      kotlinFindings(root, 'detekt').map(({ identity, classification }) => [
        identity,
        classification,
      ]),
    ).toEqual([
      ['fp:signature=abc', 'enforceable'],
      ['fp:nitpicker/subject=Todo', 'descriptive'],
    ]);
  });

  it('ends the message of a one-way rule with the allowed form and the exception route, keeping the identity', () => {
    const root = projectWithKotlinReports();
    writeFileSync(
      path.join(root, 'build/nitpicker/detekt.sarif'),
      JSON.stringify({
        runs: [
          {
            tool: { driver: { name: 'detekt' } },
            results: [
              {
                ruleId: 'detekt.potential-bugs.UnsafeCallOnNullableType',
                level: 'warning',
                message: { text: 'Calling !! on a nullable type will throw.' },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: bad },
                      region: { startLine: 3 },
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    );

    const [finding] = kotlinFindings(root, 'detekt');

    expect(finding.identity).toBe('fp:nitpicker/subject=Calling !! on a nullable type will throw.');
    expect(finding.message).toMatch(
      /^Calling !! on a nullable type will throw\. Handle null with `value \?: return`.*checkNotNull\(value\).*"exceptions" entry for rule detekt\.potential-bugs\.UnsafeCallOnNullableType in nitpicker\.config\.json\.$/,
    );
  });

  it('reports an inline suppression of a one-way rule in a Kotlin source file', () => {
    const root = projectWithKotlinReports();
    writeFileSync(
      path.join(root, bad),
      `${KOTLIN_SOURCE}\n@Suppress("UnsafeCallOnNullableType", "MagicNumber")\nfun f(text: String?) = text!!.length\n`,
    );

    expect(
      kotlinFindings(root, 'detekt').filter(({ rule }) => rule === 'inline-suppression'),
    ).toEqual([
      expect.objectContaining({
        path: bad,
        identity: 'suppress:UnsafeCallOnNullableType',
        classification: 'enforceable',
      }),
    ]);
  });

  it('reports a file the formatter wants changed, named after the formatter in use', () => {
    const ktlint = kotlinFindings(projectWithKotlinReports(), 'ktlint');
    const ktfmt = kotlinFindings(
      projectWithKotlinReports({ manifest: { kotlinFormatter: 'ktfmt' } }),
      'ktfmt',
    );

    expect(ktlint).toEqual([
      {
        tool: 'ktlint',
        rule: 'format',
        path: bad,
        identity: 'format',
        message: 'File is not formatted with ktlint',
        classification: 'enforceable',
      },
    ]);
    expect(ktfmt).toEqual([expect.objectContaining({ tool: 'ktfmt', path: bad })]);
  });

  it('reports no format finding for a list without files', () => {
    expect(kotlinFindings(projectWithKotlinReports({ formatList: '' }), 'ktlint')).toEqual([]);
  });

  it('reads JaCoCo coverage of Kotlin and Java files and gates the branches of both', () => {
    const { findings } = readJavaFindings(projectWithKotlinReports(), { preset: 'kotlin' });
    const jacoco = findings.filter((finding) => finding.tool === 'jacoco');

    expect(jacoco.map(({ rule, path: file }) => [rule, file])).toEqual([
      ['line-coverage', 'src/main/java/demo/Mixed.kt'],
      ['line-coverage', 'src/main/java/demo/Legacy.java'],
      ['line-coverage', bad],
      ['uncovered-method', bad],
      ['changed-branch-coverage', 'src/main/java/demo/Mixed.kt'],
      ['changed-branch-coverage', 'src/main/java/demo/Legacy.java'],
      ['changed-branch-coverage', bad],
    ]);
  });

  it('ignores branches on Kotlin lines without any branching source syntax', () => {
    const { findings } = readJavaFindings(projectWithKotlinReports(), { preset: 'kotlin' });
    const branchLines = findings
      .filter((finding) => finding.rule === 'changed-branch-coverage' && finding.path === bad)
      .map((finding) => finding.location.line);

    expect(branchLines).toEqual([8]);
  });

  it('reports mutants of Kotlin classes without failing and keeps Java mutants enforceable', () => {
    const { findings } = readJavaFindings(projectWithKotlinReports(), { preset: 'kotlin' });
    const mutants = findings
      .filter((finding) => finding.rule.startsWith('mutant-'))
      .map(({ rule, path: file, classification }) => [rule, file, classification]);

    expect(mutants).toEqual([
      ['mutant-survived', bad, 'descriptive'],
      ['mutant-nocoverage', bad, 'descriptive'],
      ['mutant-survived', 'src/main/java/demo/Legacy.java', 'enforceable'],
    ]);
  });

  it('leaves Kotlin reports and Kotlin files alone with the java preset', () => {
    const { findings } = readJavaFindings(projectWithKotlinReports());

    expect(findings.filter((finding) => ['detekt', 'ktlint'].includes(finding.tool))).toEqual([]);
    expect(findings.some((finding) => finding.path.startsWith('src/main/kotlin/'))).toBe(false);
  });

  it('turns the Kotlin metrics and clones into structure, CRAP and duplicate findings', () => {
    const root = projectWithKotlinReports();
    const reports = path.join(root, 'build/nitpicker');
    writeFileSync(
      path.join(reports, 'kotlin-metrics.json'),
      JSON.stringify({
        functions: [
          {
            file: bad,
            name: 'Bad.compute',
            start: 6,
            end: 10,
            lines: 5,
            statements: 3,
            maxControlNesting: 1,
            parameters: 4,
            complexity: 3,
          },
        ],
        files: [{ file: bad, classes: ['demo.Bad'] }],
      }),
    );
    writeFileSync(
      path.join(reports, 'kotlin-duplicates.json'),
      JSON.stringify({
        runs: [
          {
            root: 'src/main/kotlin',
            report: {
              duplicates: [
                {
                  firstFile: { name: 'demo/Bad.kt', start: 3 },
                  secondFile: { name: 'demo/Other.kt', start: 3 },
                  fragment: 'x',
                  lines: 8,
                  tokens: 90,
                },
              ],
            },
          },
        ],
      }),
    );

    const { findings } = readJavaFindings(root, { preset: 'kotlin' });
    const enforceable = findings.filter(
      ({ tool, classification }) =>
        ['structure', 'crap', 'duplicates'].includes(tool) && classification === 'enforceable',
    );

    expect(enforceable.map(({ tool, rule, path: file }) => [tool, rule, file])).toEqual([
      ['structure', 'function-parameters-limit', bad],
      ['crap', 'crap-score-limit', bad],
      ['duplicates', 'duplicate-clone', bad],
    ]);
    expect(() => parseAnalyzerReport({ findings }, 'kotlin')).not.toThrow();
  });

  it('reads no Kotlin metrics or clones from a report without them, as the java preset does', () => {
    const { findings } = readJavaFindings(projectWithKotlinReports(), { preset: 'kotlin' });

    expect(
      findings.filter(({ tool }) => ['structure', 'crap', 'duplicates'].includes(tool)),
    ).toEqual([]);
  });

  it('fails when the project does not apply the Kotlin plugin', () => {
    const root = projectWithKotlinReports({ manifest: { kotlin: undefined } });

    expect(() => readJavaFindings(root, { preset: 'kotlin' })).toThrow(
      'applies org.jetbrains.kotlin.jvm',
    );
  });
});
