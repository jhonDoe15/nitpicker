import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../../../core/diff/comparison/finding-schema.mjs';
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

    suspend fun compute(a: Int, b: Int): Int {
        val x = a * 1000 + b * 2000
        if (x > 5000) return x
        return withContext(Dispatchers.Default) { 7777 }
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

const ktlintResult = (ruleId, text, line) => ({
  ruleId,
  level: 'error',
  message: { text },
  locations: [
    {
      physicalLocation: {
        artifactLocation: { uri: 'src/main/kotlin/demo/Bad.kt' },
        region: { startLine: line, startColumn: 1 },
      },
    },
  ],
});

const KTLINT_SARIF = JSON.stringify({
  runs: [
    {
      tool: { driver: { name: 'ktlint' } },
      results: [
        ktlintResult('standard:no-wildcard-imports', 'Wildcard import', 3),
        ktlintResult('standard:indent', 'Unexpected indentation (6) (should be 4)', 6),
        ktlintResult('standard:indent', 'Unexpected indentation (9) (should be 4)', 7),
      ],
    },
  ],
});

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
    readFileSync(
      path.join(new URL('../', import.meta.url).pathname, '../ingest/fixtures/detekt.sarif'),
      'utf8',
    ),
  );
  writeFileSync(path.join(reports, 'ktfmt.txt'), formatList);
  writeFileSync(path.join(reports, 'ktlint.sarif'), KTLINT_SARIF);
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
  it('treats note-level detekt results as descriptive', () => {
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
    ).toEqual([['fp:nitpicker/subject=Todo', 'descriptive']]);
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
      new RegExp(
        [
          '^Calling !! on a nullable type will throw\\. Handle null',
          ' with `value \\?: return`.*checkNotNull\\(value\\).*"excep',
          'tions" entry for rule detekt\\.potential-bugs\\.UnsafeCal',
          'lOnNullableType in nitpicker\\.config\\.json\\.$',
        ].join(''),
        '',
      ),
    );
  });
  it('reports an inline suppression of a one-way rule in a Kotlin source file', () => {
    const root = projectWithKotlinReports();
    writeFileSync(
      path.join(root, bad),
      `${KOTLIN_SOURCE}\n@Suppress("UnsafeCallOnNullableType", "UNCHECKED_CAST")\nfun f(text: String?) = text!!.length\n`,
    );

    expect(
      kotlinFindings(root, 'detekt').filter(({ rule }) => rule === 'inline-suppression'),
    ).toEqual([
      {
        tool: 'detekt',
        rule: 'inline-suppression',
        path: bad,
        identity: 'suppress:UnsafeCallOnNullableType',
        message:
          'Suppressing "UnsafeCallOnNullableType" inline is not allowed. Fix the code the rule flags. To lift a one-way rule for some paths, add an "exceptions" entry for it in nitpicker.config.json; to skip generated code, add it to "exclude" there.',
        classification: 'enforceable',
      },
    ]);
  });
  describe('identity of a finding with a measured value', () => {
    const at = { physicalLocation: { artifactLocation: { uri: bad }, region: { startLine: 3 } } };
    const identitiesOf = (messages) => {
      const root = projectWithKotlinReports();
      writeFileSync(
        path.join(root, 'build/nitpicker/detekt.sarif'),
        JSON.stringify({
          runs: [
            {
              tool: { driver: { name: 'detekt' } },
              results: messages.map((text) => ({
                ruleId: 'detekt.style.Measured',
                level: 'warning',
                message: { text },
                locations: [at],
              })),
            },
          ],
        }),
      );
      return kotlinFindings(root, 'detekt').map(({ identity }) => identity);
    };
    it.each([
      [
        'The function run is too long (64). The maximum length is 60.',
        'The function run is too long (63). The maximum length is 60.',
      ],
      [
        "Class 'Big' with '14' functions detected. Defined threshold inside classes is set to '11'",
        "Class 'Big' with '12' functions detected. Defined threshold inside classes is set to '11'",
      ],
      [
        'Function f has 3 return statements which exceeds the limit of 2.',
        'Function f has 2 return statements which exceeds the limit of 2.',
      ],
    ])('stays baselined when the value changes: %s', (before, after) => {
      expect(identitiesOf([before])).toEqual(identitiesOf([after]));
    });
    it('keeps names that end in digits apart', () => {
      expect(identitiesOf(['Private property `unused1` is unused.'])).not.toEqual(
        identitiesOf(['Private property `unused2` is unused.']),
      );
    });
  });
  it('reports each ktlint violation with its rule and line, and how to lift the rule', () => {
    const ktlint = kotlinFindings(projectWithKotlinReports(), 'ktlint');

    expect(
      ktlint.map(({ rule, path: file, identity, location, classification }) => ({
        rule,
        file,
        identity,
        line: location.line,
        classification,
      })),
    ).toEqual([
      {
        rule: 'ktlint.standard:no-wildcard-imports',
        file: bad,
        identity: 'fp:nitpicker/subject=Wildcard import',
        line: 3,
        classification: 'enforceable',
      },
      {
        rule: 'ktlint.standard:indent',
        file: bad,
        identity: 'fp:nitpicker/subject=Unexpected indentation (#) (should be #)',
        line: 6,
        classification: 'enforceable',
      },
      {
        rule: 'ktlint.standard:indent',
        file: bad,
        identity: 'fp:nitpicker/subject=Unexpected indentation (#) (should be #)#2',
        line: 7,
        classification: 'enforceable',
      },
    ]);
    expect(ktlint[0].message).toBe(
      'Wildcard import. Lift this rule: ktlint_standard_no-wildcard-imports = disabled in .editorconfig. Not your formatter: set kotlin.formatter',
    );
    expect(ktlint[0].message).not.toContain('--format');
  });
});
