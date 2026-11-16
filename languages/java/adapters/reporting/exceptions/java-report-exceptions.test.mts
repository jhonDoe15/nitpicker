import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyFindingPolicy } from '../../../../../shared/findings/finding-policy.mjs';
import { textOf } from '../../../../../shared/values/readers.mts';
import { callUntyped, findingsOf, type JavaFinding } from '../../typed/java-values.mts';
import { javaRouteRule } from '../../java-policy.mts';
import { readJavaFindings as readFindings } from '../java-reports.mts';
import { readingFrom, reportBaseOf, writeModules } from '../../test-support/report-base.mts';
import { useGitFixtures } from '../../../../../core/diff/git/test-support/git-repository.mts';

const { temporaryRoot } = useGitFixtures();

const readJavaFindings = readingFrom(readFindings);
function policed(findings: readonly JavaFinding[], policy: object = {}): JavaFinding[] {
  return findingsOf(
    callUntyped(applyFindingPolicy, findings, { ...policy, routeRule: javaRouteRule }),
  );
}

const BAD = 'src/main/java/demo/Bad.java';
const JACOCO = `<?xml version="1.0" encoding="UTF-8"?>
<report name="demo"><package name="demo">
  <class name="demo/Bad" sourcefilename="Bad.java">
    <method name="decode" desc="([B)Ljava/lang/String;" line="9">
      <counter type="LINE" missed="3" covered="0"/>
    </method>
  </class>
  <sourcefile name="Bad.java"><line nr="9" mi="2" ci="0" mb="2" cb="0"/><counter type="LINE" missed="3" covered="1"/></sourcefile>
</package></report>`;
const STRUCTURE = [
  {
    file: BAD,
    name: 'Bad.decode',
    start: 8,
    end: 14,
    lines: 7,
    parameters: 4,
    complexity: 12,
    signature: 'Bad.decode(byte[])',
  },
];

function projectWithOneComplexMethod(): string {
  const root = temporaryRoot('nitpicker-java-exceptions-');
  const reports = writeModules(root);
  mkdirSync(path.join(root, 'src/main/java/demo'), { recursive: true });
  const sourceLines = Array.from({ length: 9 }, () => '');
  sourceLines[8] = '    return new String(bytes);';
  writeFileSync(path.join(root, BAD), `${sourceLines.join('\n')}\n`);
  writeFileSync(
    path.join(reports, 'manifest.json'),
    JSON.stringify({ versions: {}, sourceRoots: ['src/main/java'] }),
  );
  for (const [name, tool] of [
    ['pmd.sarif', 'PMD'],
    ['spotbugs.sarif', 'SpotBugs'],
  ] as const) {
    writeFileSync(
      path.join(reports, name),
      JSON.stringify({ runs: [{ tool: { driver: { name: tool, rules: [] } }, results: [] }] }),
    );
  }
  writeFileSync(path.join(reports, 'format.txt'), '');
  writeFileSync(path.join(reports, 'checkstyle.xml'), '<checkstyle version="10"/>');
  writeFileSync(path.join(reportBaseOf(root), 'duplicates.json'), JSON.stringify({ runs: [] }));
  writeFileSync(path.join(reports, 'jacoco.xml'), JACOCO);
  writeFileSync(path.join(reports, 'structure.json'), JSON.stringify(STRUCTURE));
  writeFileSync(path.join(reports, 'classes.json'), '{"files":{},"classes":[]}');
  return root;
}

describe('readJavaFindings exception routes', () => {
  it('names the exception entry in the structure, CRAP and branch coverage findings, and each entry lifts its finding', () => {
    const findings = findingsOf(readJavaFindings(projectWithOneComplexMethod()).findings);
    const routed = findings.filter(({ rule }) =>
      ['function-parameters-limit', 'crap-score-limit', 'changed-branch-coverage'].includes(rule),
    );
    function entry(rule: string, functionName: string): object {
      return { rule, paths: [BAD], function: functionName };
    }

    expect(routed.map(({ rule, symbol }) => [rule, symbol])).toEqual([
      ['crap-score-limit', 'Bad.decode(byte[])'],
      ['function-parameters-limit', 'Bad.decode'],
      ['changed-branch-coverage', 'Bad.decode'],
    ]);
    expect(
      routed.map(({ message }) => /If this is intended.*$/.exec(textOf(message))?.[0]),
    ).toEqual([
      'If this is intended, add {"rule":"crap-score-limit","paths":["src/main/java/demo/Bad.java"],"function":"Bad.decode","reason":"..."} to "exceptions" in nitpicker.config.json.',
      'If this is intended, add {"rule":"function-parameters-limit","paths":["src/main/java/demo/Bad.java"],"function":"Bad.decode","reason":"..."} to "exceptions" in nitpicker.config.json.',
      'If this is intended, add {"rule":"changed-branch-coverage","paths":["src/main/java/demo/Bad.java"],"function":"Bad.decode","reason":"..."} to "exceptions" in nitpicker.config.json.',
    ]);
    const lifted = policed(findings, {
      exceptions: [
        entry('function-parameters-limit', 'Bad.decode'),
        entry('crap-score-limit', 'Bad.decode'),
        entry('changed-branch-coverage', 'Bad.decode'),
      ],
    });
    expect(lifted.filter((finding) => routed.includes(finding))).toEqual([]);
    expect(lifted).toHaveLength(findings.length - routed.length);
    expect(policed(findings, { exceptions: [entry('changed-branch-coverage', 'encode')] })).toEqual(
      policed(findings),
    );
  });
});
