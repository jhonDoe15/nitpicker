import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyFindingPolicy } from '../../../../../shared/findings/finding-policy.mjs';
import { javaRouteRule } from '../../java-policy.mjs';
import { readJavaFindings as readFindings } from '../java-reports.mjs';
import { readingFrom, reportBaseOf, writeModules } from '../../test-support/report-base.mjs';

const readJavaFindings = readingFrom(readFindings);
const policed = (findings, policy = {}) =>
  applyFindingPolicy(findings, { ...policy, routeRule: javaRouteRule });

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

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWithOneComplexMethod() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-exceptions-')));
  temporaryRoots.push(root);
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
  ]) {
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
    const { findings } = readJavaFindings(projectWithOneComplexMethod());
    const routed = findings.filter(({ rule }) =>
      ['function-parameters-limit', 'crap-score-limit', 'changed-branch-coverage'].includes(rule),
    );
    const entry = (rule, functionName) => ({ rule, paths: [BAD], function: functionName });

    expect(routed.map(({ rule, symbol }) => [rule, symbol])).toEqual([
      ['crap-score-limit', 'Bad.decode(byte[])'],
      ['function-parameters-limit', 'Bad.decode'],
      ['changed-branch-coverage', 'Bad.decode'],
    ]);
    expect(routed.map(({ message }) => message.match(/If this is intended.*$/)[0])).toEqual([
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
