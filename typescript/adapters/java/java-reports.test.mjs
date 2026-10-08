import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseAnalyzerReport } from '../../core/diff/finding-schema.mjs';
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
  <sourcefile name="Bad.java"><counter type="LINE" missed="3" covered="1"/></sourcefile>
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
  writeFileSync(sourceFile, 'package demo;\n');
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
    JACOCO.replace('line="9"', `line="${String(9 + shift)}"`),
  );
  // One complex function that the JaCoCo method above (0 of 3 lines covered) belongs to.
  writeFileSync(
    path.join(reports, 'lizard.csv'),
    `9,12,60,1,7,"Bad::decode@${String(8 + shift)}-${String(14 + shift)}@src/main/java/demo/Bad.java","src/main/java/demo/Bad.java","Bad::decode","Bad::decode( byte[] bytes)",${String(8 + shift)},${String(14 + shift)}\n`,
  );
  return root;
}

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
      ['jacoco', 'line-coverage', bad, 'line-coverage'],
      ['jacoco', 'uncovered-method', bad, expect.stringMatching(/^cov:/)],
      ['crap', 'crap-score-limit', bad, 'function:Bad::decode( byte[] bytes)'],
    ]);
  });

  it('enforces PMD, SpotBugs (even at level note) and formatting; coverage only describes', () => {
    const { findings } = readJavaFindings(projectWithReports());

    expect(
      Object.fromEntries(findings.map((finding) => [finding.tool, finding.classification])),
    ).toEqual({
      pmd: 'enforceable',
      spotbugs: 'enforceable',
      'google-java-format': 'enforceable',
      jacoco: 'descriptive',
      crap: 'enforceable',
    });
  });

  it('keeps identities when every reported line moves', () => {
    const before = readJavaFindings(projectWithReports()).findings;
    const after = readJavaFindings(projectWithReports({ shift: 17 })).findings;

    expect(identities(after)).toEqual(identities(before));
    expect(after[0].location.line).toBe(before[0].location.line + 17);
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
