import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { noteSectionLines, noteSummaryText } from './format/notes.mjs';
import { writeDiffReports } from './reporters.mjs';
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
      summary: [noteSummaryText([]), noteSummaryText(undefined)],
    }).toEqual({ section: [[], []], summary: [undefined, undefined] });
  });

  it('names each tool once in the console note', () => {
    expect(noteSummaryText([NOTE, NOTE, JAVA_NOTE])).toEqual(
      "Note: the project's tests fail on the base (python, java), so its coverage, CRAP and mutation results are unknown there. Only added files and edited lines are judged on them.",
    );
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
    expect(summary.split('\n').filter((line) => line.startsWith('Note:'))).toEqual([
      "Note: the project's tests fail on the base (python), so its coverage, CRAP and mutation results are unknown there. Only added files and edited lines are judged on them.",
    ]);
    expect(summary.includes('✓ No new enforceable violations')).toBe(true);
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
