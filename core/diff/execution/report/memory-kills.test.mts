import { describe, expect, it } from 'vitest';

import { MEMORY_TOOL, withMemoryKillReport } from './memory-kills.mts';
import { reportFromAnalyzerOutput } from './analyzer-report.mts';
import type { AnalyzerReport, ReportEntry } from '../../../../shared/values/findings.mts';

const GIB = 1024 ** 3;
const USE = { peak: 15 * GIB, limit: 16 * GIB, source: 'cgroup memory.peak and memory.max' };

function crash(name: string): string {
  try {
    reportFromAnalyzerOutput(
      { name, acceptedExitCodes: [0], reportedTools: [] },
      { status: null, signal: 'SIGKILL', stdoutText: '', stderrText: '' },
    );
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '';
}

function lintReport(): AnalyzerReport {
  return {
    findings: [
      {
        tool: 'eslint-lint',
        rule: 'tool-error',
        path: '.',
        identity: 'oxlint',
        classification: 'tool-error',
        message:
          'oxlint was killed by SIGKILL (usually the out-of-memory killer; run fewer jobs at once ' +
          'with NITPICKER_MAX_PARALLEL or give the job more memory)',
      },
    ],
  };
}

function run(toolErrors: ReportEntry[]): {
  reports: Map<string, AnalyzerReport>;
  toolErrors: ReportEntry[];
} {
  return { reports: new Map([['eslint-lint', lintReport()]]), toolErrors };
}

describe('withMemoryKillReport', () => {
  it('reports several kills once, with the peak, and keeps each analyzer failed', () => {
    const killed = withMemoryKillReport(
      run([
        { tool: 'structure', snapshot: 'head', message: crash('structure') },
        { tool: 'typescript-typecheck', snapshot: 'head', message: crash('typescript-typecheck') },
      ]),
      'head',
      () => USE,
    );
    const memory = killed.toolErrors.filter((entry) => entry.tool === MEMORY_TOOL);
    expect(memory).toHaveLength(1);
    expect(memory[0]?.message).toContain(
      '3 analyzers were killed with SIGKILL in this run ' +
        '(eslint-lint, structure, typescript-typecheck)',
    );
    expect(memory[0]?.message).toContain('The measured peak was 15.0 GB of a 16.0 GB limit');
    expect(killed.toolErrors.map((entry) => entry.tool)).toEqual([
      'structure',
      'typescript-typecheck',
      MEMORY_TOOL,
    ]);
    expect(killed.toolErrors[0]?.message).toMatch(
      /^structure crashed with signal SIGKILL: no diagnostic output \(see the memory report\)/u,
    );
    expect(String(killed.toolErrors[0]?.message)).not.toContain('NITPICKER_MAX_PARALLEL');
    expect(killed.reports.get('eslint-lint')?.findings[0]?.message).toBe(
      'oxlint was killed by SIGKILL (see the memory report)',
    );
  });

  it('leaves a single kill with its own remedy', () => {
    const single = run([]);
    expect(withMemoryKillReport(single, 'head', () => USE)).toBe(single);
  });

  it('counts an analyzer once when both its process and a finding report the kill', () => {
    const twice = run([{ tool: 'eslint-lint', snapshot: 'head', message: crash('eslint-lint') }]);
    expect(withMemoryKillReport(twice, 'head', () => USE)).toBe(twice);
  });

  it('ignores failures that are not kills', () => {
    const other = run([{ tool: 'structure', snapshot: 'head', message: 'structure timed out' }]);
    expect(withMemoryKillReport(other, 'head', () => USE)).toBe(other);
  });
});
