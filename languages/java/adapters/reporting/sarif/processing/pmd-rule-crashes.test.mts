import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callUntyped, findingsOf, type JavaFinding } from '../../../typed/java-values.mts';
import {
  PMD_LOG,
  pmdLogRuleCrashes,
  pmdLoggedCrashFiles,
  pmdRuleCrashNotes,
} from './pmd-rule-crashes.mjs';

const ROOT = '/work/halo';
const directories: string[] = [];

function notes(log: string): JavaFinding[] {
  return findingsOf(callUntyped(pmdRuleCrashNotes, log, ROOT));
}

function loggedNotes(reportRoot: string): JavaFinding[] {
  return findingsOf(callUntyped(pmdLogRuleCrashes, reportRoot, ROOT));
}

function loggedFiles(reportRoot: string): unknown[] {
  const files: unknown = callUntyped(pmdLoggedCrashFiles, reportRoot, ROOT);
  return files instanceof Set ? [...files] : [];
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function warning(rule: string, file: string): string {
  return [
    `[main] WARN net.sourceforge.pmd.lang.rule.internal.RuleApplicator - Exception applying rule ${rule} on file ${file}, continuing with next rule`,
    'org.apache.commons.lang3.exception.ContextedRuntimeException: java.lang.NullPointerException',
    '\tat net.sourceforge.pmd.lang.rule.internal.RuleApplicator.applyOnIndex(RuleApplicator.java:79)',
    'Caused by: java.lang.NullPointerException: Cannot invoke "TypeNode.getTypeMirror()" because "type" is null',
  ].join('\n');
}

describe('pmdRuleCrashNotes', () => {
  it('notes one rule that crashed on two files once, naming both files', () => {
    const log = [
      warning('CloseResource', `${ROOT}/src/main/java/run/halo/DefaultIndices.java`),
      warning('CloseResource', `${ROOT}/src/test/java/run/halo/LocalSmtpServer.java`),
    ].join('\n');

    expect(notes(log)).toEqual([
      {
        tool: 'pmd',
        rule: 'rule-crashed',
        path: 'src/main/java/run/halo/DefaultIndices.java',
        identity: 'rule-crashed:CloseResource',
        message:
          "PMD's CloseResource crashed on 2 files and did not check them: DefaultIndices.java, " +
          'LocalSmtpServer.java. The other rules checked these files. The crash is a bug in the rule, ' +
          'not a problem in this code.',
        classification: 'descriptive',
      },
    ]);
  });

  it('keeps one note per rule and names a file once when a rule crashes on it twice', () => {
    const log = [
      warning('CloseResource', `${ROOT}/A.java`),
      warning('UnusedAssignment', `${ROOT}/A.java`),
      warning('CloseResource', `${ROOT}/A.java`),
    ].join('\n');

    expect(notes(log).map(({ identity, message }) => [identity, message])).toEqual([
      [
        'rule-crashed:CloseResource',
        "PMD's CloseResource crashed on 1 file and did not check it: A.java. The other rules checked " +
          'these files. The crash is a bug in the rule, not a problem in this code.',
      ],
      [
        'rule-crashed:UnusedAssignment',
        "PMD's UnusedAssignment crashed on 1 file and did not check it: A.java. The other rules " +
          'checked these files. The crash is a bug in the rule, not a problem in this code.',
      ],
    ]);
  });

  it('names five files and counts the rest', () => {
    const log = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
      .map((name) => warning('CloseResource', `${ROOT}/${name}.java`))
      .join('\n');

    expect(notes(log).map(({ message }) => message)).toEqual([
      "PMD's CloseResource crashed on 7 files and did not check them: A.java, B.java, C.java, D.java, " +
        'E.java and 2 more. The other rules checked these files. The crash is a bug in the rule, not a ' +
        'problem in this code.',
    ]);
  });

  it('reads the log PMD left next to its report, and nothing when there is none', () => {
    const reportRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-pmd-log-'));
    directories.push(reportRoot);

    const before = loggedNotes(reportRoot);
    writeFileSync(path.join(reportRoot, PMD_LOG), warning('CloseResource', `${ROOT}/A.java`));

    expect([before, loggedNotes(reportRoot).map(({ path: file }) => file)]).toEqual([
      [],
      ['A.java'],
    ]);
    expect(loggedFiles(reportRoot)).toEqual([path.resolve(ROOT, 'A.java')]);
  });
});
