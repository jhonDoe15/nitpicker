import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fieldOf,
  fieldsOf,
  listOf,
  numberOr,
  parseJson,
} from '../../../../../shared/values/readers.mts';
import { reportBaseOf, rootReports, writeModules } from '../../test-support/report-base.mts';

const temporaryRoots: string[] = [];

export function removeTemporaryReportProjects(): void {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

function shifted(location: unknown, shift: number): object {
  const fields = fieldsOf(location);
  return { ...fields, start: numberOr(fields['start'], 0) + shift };
}

const JACOCO = `<?xml version="1.0" encoding="UTF-8"?>
<report name="demo"><package name="demo">
  <class name="demo/Bad" sourcefilename="Bad.java">
    <method name="decode" desc="([B)Ljava/lang/String;" line="9">
      <counter type="LINE" missed="3" covered="0"/>
    </method>
  </class>
  <sourcefile name="Bad.java"><line nr="9" mi="2" ci="0" mb="2" cb="0"/><counter type="LINE" missed="3" covered="1"/></sourcefile>
</package></report>`;
export function projectWithReports({ shift = 0 }: { readonly shift?: number } = {}): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-reports-')));
  temporaryRoots.push(root);
  const reports = rootReports(root);
  const sourceFile = path.join(root, 'src/main/java/demo/Bad.java');
  mkdirSync(reports, { recursive: true });
  writeModules(root);
  mkdirSync(path.dirname(sourceFile), { recursive: true });
  const sourceLines = Array.from({ length: 9 + shift }, () => '');
  sourceLines[8 + shift] = '    return new String(bytes);';
  writeFileSync(sourceFile, `${sourceLines.join('\n')}\n`);
  writeFileSync(
    path.join(reports, 'manifest.json'),
    JSON.stringify({ versions: {}, sourceRoots: ['src/main/java', 'src/missing/java'] }),
  );
  function run(name: string, results: readonly object[]): object {
    return { runs: [{ tool: { driver: { name, rules: [] } }, results }] };
  }
  function at(uri: string, line: number): object[] {
    return [
      { physicalLocation: { artifactLocation: { uri }, region: { startLine: line + shift } } },
    ];
  }
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
  writeFileSync(path.join(reports, 'errorprone.json'), '[]');
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
    readFileSync(
      path.join(fileURLToPath(new URL('../../', import.meta.url)), 'fixtures/checkstyle.xml'),
      'utf8',
    )
      .replaceAll('@SOURCE@', sourceFile)
      .replace(/line="(\d+)"/g, (_, line: string) => `line="${String(Number(line) + shift)}"`),
  );
  writeFileSync(path.join(reports, 'classes.json'), JSON.stringify({ files: {}, classes: [] }));
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
  const jscpd = fieldsOf(
    parseJson(
      readFileSync(
        path.join(fileURLToPath(new URL('../../', import.meta.url)), 'fixtures/jscpd-report.json'),
        'utf8',
      ),
    ),
  );
  const duplicates = listOf(jscpd['duplicates']).map((clone) => ({
    ...fieldsOf(clone),
    firstFile: shifted(fieldOf(clone, 'firstFile'), shift),
    secondFile: shifted(fieldOf(clone, 'secondFile'), shift),
  }));
  writeFileSync(
    path.join(reportBaseOf(root), 'duplicates.json'),
    JSON.stringify({ runs: [{ root: 'src/main/java', report: { ...jscpd, duplicates } }] }),
  );
  return root;
}
