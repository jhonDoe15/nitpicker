import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { noteSectionLines, noteSummaryLines } from './format/notes.mjs';
import { renderJunitReport } from './junit.mjs';
import { writeDiffReports } from './reporters.mjs';
import { renderSarifReport } from './sarif.mjs';
import { renderConsoleSummary } from './summary.mjs';
import { renderTextReport } from './text.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const NOTE = {
  tool: 'python',
  snapshot: 'base',
  rule: 'tests-failed',
  path: '.',
  message: 'pytest exited with 1: 2 failed',
};

const JAVA_NOTE = { ...NOTE, tool: 'java', message: 'Execution failed for task test' };

function report(notes) {
  return {
    summary: {
      requestedBaseRef: 'main',
      mergeBaseSha: 'abc',
      headSha: 'def',
      overallStatus: 'completed',
      newEnforceableFindings: 0,
      elapsedMs: 10,
      tools: [],
    },
    newFindings: [],
    resolvedFindings: [],
    unchangedFindings: [],
    changedMetrics: [],
    toolErrors: [],
    notes,
  };
}

describe('red-base notes in the reports', () => {
  it('lists a Notes section, one line per note', () => {
    expect(noteSectionLines([NOTE, JAVA_NOTE])).toEqual([
      '',
      'Notes:',
      'python (base): pytest exited with 1: 2 failed',
      'java (base): Execution failed for task test',
    ]);
  });

  it('adds nothing without notes', () => {
    expect({
      section: [noteSectionLines([]), noteSectionLines(undefined)],
      summary: [noteSummaryLines([]), noteSummaryLines(undefined)],
    }).toEqual({ section: [[], []], summary: [[], []] });
  });

  it('indents the continuation lines of a note under its first line', () => {
    const note = { ...NOTE, message: 'Tests fail on the base:\n  tests/a.py::test_x' };

    expect(noteSectionLines([note])).toEqual([
      '',
      'Notes:',
      'python (base): Tests fail on the base:',
      '    tests/a.py::test_x',
    ]);
  });

  it('names each tool once in the console note', () => {
    expect(noteSummaryLines([NOTE, NOTE, JAVA_NOTE])).toEqual([
      "Note: the project's tests fail on the base (python, java).",
      'Coverage, CRAP, mutation, slow-test and test-console results are unknown there, ' +
        'so only added files and edited lines are judged on them.',
    ]);
  });

  it('says the head counts as new when the change removes tests', () => {
    const removed = { ...NOTE, tool: 'nitpicker', snapshot: 'head', rule: 'tests-removed' };

    expect(noteSummaryLines([NOTE, removed])).toEqual([
      "Note: the project's tests fail on the base (python).",
      'The change removes tests, so every coverage, CRAP, mutation, slow-test and test-console ' +
        'result of the head counts as new.',
    ]);
  });

  it('keeps a red-base report green and lists the note in text and console output', () => {
    const text = renderTextReport(report([NOTE]));
    const summary = renderConsoleSummary(report([NOTE]), { color: false });

    expect(text.split('\n').slice(-4)).toEqual([
      '',
      'Notes:',
      'python (base): pytest exited with 1: 2 failed',
      '',
    ]);
    expect(summary.split('\n')).toEqual([
      '',
      'Quality gate summary',
      '✓ No new enforceable violations',
      ...noteSummaryLines([NOTE]),
      'Full diagnostics: reports/quality/diff/combined/report.txt',
      '',
    ]);
  });

  it('puts the notes in the JUnit output without failing the suite', () => {
    const xml = renderJunitReport(report([NOTE, JAVA_NOTE]));

    expect(xml.split('\n')).toEqual([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<testsuite name="quality.diff" tests="1" failures="0" errors="0" time="0.010">',
      '  <testcase classname="quality.diff" name="framework" time="0"></testcase>',
      '  <system-out>Notes:',
      'python (base): pytest exited with 1: 2 failed',
      'java (base): Execution failed for task test</system-out>',
      '</testsuite>',
      '',
    ]);
  });

  it('puts the notes in the SARIF output as note-level notifications', () => {
    const [run] = JSON.parse(renderSarifReport(report([NOTE, JAVA_NOTE]))).runs;

    expect(run.invocations).toEqual([
      {
        executionSuccessful: true,
        toolExecutionNotifications: [
          { level: 'note', message: { text: 'python (base): pytest exited with 1: 2 failed' } },
          { level: 'note', message: { text: 'java (base): Execution failed for task test' } },
        ],
      },
    ]);
  });

  it('writes notes.json, empty when the base is green', () => {
    const outputRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-notes-'));
    temporaryRoots.push(outputRoot);

    writeDiffReports(outputRoot, report([NOTE]));
    const withNote = JSON.parse(readFileSync(path.join(outputRoot, 'notes.json'), 'utf8'));
    writeDiffReports(outputRoot, report([]));
    const without = JSON.parse(readFileSync(path.join(outputRoot, 'notes.json'), 'utf8'));

    expect({ withNote, without }).toEqual({ withNote: [NOTE], without: [] });
  });
});
