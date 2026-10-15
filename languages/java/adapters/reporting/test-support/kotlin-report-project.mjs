import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readJavaFindings } from '../java-reports.mjs';

const temporaryRoots = [];

const DETEKT_SARIF = path.resolve(import.meta.dirname, '../../../ingest/fixtures/detekt.sarif');

export function removeTemporaryProjects() {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function temporaryProjectRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-reports-')));
  temporaryRoots.push(root);
  return root;
}

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

export const KOTLIN_SOURCE = `package demo

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

export function mutation({ status, className, sourceFile, line }) {
  return `<mutation detected='false' status='${status}'>
  <sourceFile>${sourceFile}</sourceFile><mutatedClass>${className}</mutatedClass>
  <mutatedMethod>compute</mutatedMethod><methodDescription>(II)I</methodDescription>
  <lineNumber>${String(line)}</lineNumber><mutator>org.pitest.mutationtest.engine.gregor.mutators.MathMutator</mutator>
  <description>Replaced integer addition with subtraction</description></mutation>`;
}

const PIT = `<mutations>${[
  mutation({ status: 'SURVIVED', className: 'demo.Bad', sourceFile: 'Bad.kt', line: 7 }),
  mutation({
    status: 'NO_COVERAGE',
    className: 'demo.BadKt$lambda$1',
    sourceFile: 'Bad.kt',
    line: 8,
  }),
  mutation({ status: 'SURVIVED', className: 'demo.Legacy', sourceFile: 'Legacy.java', line: 4 }),
  mutation({ status: 'KILLED', className: 'demo.Bad', sourceFile: 'Bad.kt', line: 9 }),
  mutation({
    status: 'SURVIVED',
    className: 'kotlin.properties.Delegates',
    sourceFile: 'Delegates.kt',
    line: 3,
  }),
].join('\n')}</mutations>`;

const EMPTY_SARIF = JSON.stringify({ version: '2.1.0', runs: [] });

function ktlintResult(ruleId, text, line) {
  return {
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
  };
}

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

function writeFiles(root, files) {
  for (const [relative, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), content);
  }
}

export function projectWithKotlinReports({
  manifest = {},
  formatList = 'src/main/kotlin/demo/Bad.kt\n',
} = {}) {
  const root = temporaryProjectRoot();
  const reports = 'build/nitpicker';
  writeFiles(root, {
    'src/main/kotlin/demo/Bad.kt': KOTLIN_SOURCE,
    'src/main/java/demo/Legacy.java': JAVA_SOURCE,
    'src/main/java/demo/Mixed.kt': MIXED_SOURCE,
    [`${reports}/manifest.json`]: JSON.stringify({
      versions: {},
      sourceRoots: ['src/main/java'],
      kotlin: true,
      kotlinSourceRoots: ['src/main/java', 'src/main/kotlin'],
      kotlinFormatter: 'ktlint',
      ...manifest,
    }),
    [`${reports}/pmd.sarif`]: EMPTY_SARIF,
    [`${reports}/spotbugs.sarif`]: EMPTY_SARIF,
    [`${reports}/format.txt`]: '',
    [`${reports}/checkstyle.xml`]: '<checkstyle version="10.21.1"></checkstyle>',
    [`${reports}/jacoco.xml`]: JACOCO,
    [`${reports}/pit/mutations.xml`]: PIT,
    [`${reports}/structure.json`]: '[]',
    [`${reports}/classes.json`]: JSON.stringify({ files: {}, classes: [] }),
    [`${reports}/duplicates.json`]: JSON.stringify({ runs: [] }),
    [`${reports}/detekt.sarif`]: readFileSync(DETEKT_SARIF, 'utf8'),
    [`${reports}/ktfmt.txt`]: formatList,
    [`${reports}/ktlint.sarif`]: KTLINT_SARIF,
  });
  return root;
}

export function kotlinFindings(root, tool) {
  return readJavaFindings(root, { preset: 'kotlin' }).findings.filter(
    (finding) => finding.tool === tool,
  );
}
