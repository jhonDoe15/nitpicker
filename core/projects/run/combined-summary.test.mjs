import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { combinedSummary, exitCodeOf, writeCombinedReports } from './combined-summary.mjs';
import { outcomeOf, reportFolder } from './outcome.mjs';

const statuses = (...names) => names.map((status) => ({ status }));

describe('exitCodeOf', () => {
  it.each([
    [statuses('passed', 'skipped'), 0],
    [statuses('passed', 'failed', 'error'), 1],
    [statuses('failed'), 1],
    [statuses('passed', 'error'), 2],
    [[], 0],
  ])('%j is %i', (results, expected) => {
    expect(exitCodeOf(results)).toBe(expected);
  });

  it('is zero whatever the result when exits are deferred', () => {
    expect(exitCodeOf(statuses('failed', 'error'), { deferExit: true })).toBe(0);
  });
});

describe('outcomeOf', () => {
  function reportRoot(files) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-outcome-'));
    for (const [name, value] of Object.entries(files)) {
      writeFileSync(path.join(root, name), JSON.stringify(value));
    }
    return root;
  }

  it('reads a comparison report', () => {
    const root = reportRoot({
      'summary.json': { newEnforceableFindings: 2, policyDigest: 'abc123abc123' },
      'tool-errors.json': [],
    });

    expect(outcomeOf({ exitCode: 1, reportRoot: root })).toEqual({
      exitCode: 1,
      newEnforceableFindings: 2,
      toolErrors: 0,
      policyDigest: 'abc123abc123',
      status: 'failed',
    });
  });

  it('reads a snapshot report', () => {
    const root = reportRoot({
      'summary.json': { enforceableFindings: 3 },
      'tool-errors.json': [],
    });

    expect(outcomeOf({ exitCode: 1, reportRoot: root })).toEqual({
      exitCode: 1,
      newEnforceableFindings: 3,
      toolErrors: 0,
      status: 'failed',
    });
  });

  it('calls a clean report passed and one with tool errors an error', () => {
    const clean = reportRoot({
      'summary.json': { newEnforceableFindings: 0 },
      'tool-errors.json': [],
    });
    const broken = reportRoot({
      'summary.json': { newEnforceableFindings: 0 },
      'tool-errors.json': [{ tool: 'x' }],
    });

    expect(outcomeOf({ exitCode: 0, reportRoot: clean }).status).toBe('passed');
    expect(outcomeOf({ exitCode: 2, reportRoot: broken })).toEqual({
      exitCode: 2,
      newEnforceableFindings: 0,
      toolErrors: 1,
      status: 'error',
    });
  });

  it('prefers failed over error when both apply, as the exit code does', () => {
    const root = reportRoot({
      'summary.json': { newEnforceableFindings: 1 },
      'tool-errors.json': [{ tool: 'x' }],
    });

    expect(outcomeOf({ exitCode: 1, reportRoot: root }).status).toBe('failed');
  });

  it('treats a missing report as clean unless the run exited with 2', () => {
    const root = reportRoot({});

    expect(outcomeOf({ exitCode: 0, reportRoot: root }).status).toBe('passed');
    expect(outcomeOf({ exitCode: 2, reportRoot: root }).status).toBe('error');
  });

  it('records a project that could not run', () => {
    expect(outcomeOf({ exitCode: 2, reportRoot: '/nowhere', error: 'bad config' })).toEqual({
      exitCode: 2,
      newEnforceableFindings: 0,
      toolErrors: 0,
      error: 'bad config',
      status: 'error',
    });
  });

  it('names the folder of the project at the root apart from the combined files', () => {
    expect(reportFolder('.')).toBe('_root');
    expect(reportFolder('web')).toBe('web');
  });
});

describe('combinedSummary', () => {
  const plan = { source: 'detected' };
  const row = (project, selected, outcome) => ({
    project: { path: project, preset: 'typescript' },
    selection: { selected, reason: selected ? '1 changed file' : 'no changed files' },
    ...(outcome === undefined ? {} : { outcome }),
  });

  it('lists every project with its status, counts and report location', () => {
    const summary = combinedSummary({
      plan,
      outside: ['README.md'],
      elapsedMs: 12,
      results: [
        row('web', true, {
          exitCode: 1,
          status: 'failed',
          newEnforceableFindings: 2,
          toolErrors: 0,
          policyDigest: 'abc',
        }),
        row('api', true, {
          exitCode: 2,
          status: 'error',
          newEnforceableFindings: 0,
          toolErrors: 0,
          error: 'boom',
        }),
        row('app', false),
        row('.', true, { exitCode: 0, status: 'passed', newEnforceableFindings: 0, toolErrors: 0 }),
      ],
    });

    expect(summary).toEqual({
      source: 'detected',
      overallStatus: 'tool-error',
      newEnforceableFindings: 2,
      counts: { projects: 4, run: 3, passed: 1, failed: 1, errored: 1, skipped: 1 },
      projects: [
        {
          path: 'web',
          preset: 'typescript',
          status: 'failed',
          reason: '1 changed file',
          exitCode: 1,
          newEnforceableFindings: 2,
          toolErrors: 0,
          report: 'web',
          summary: 'web/summary.json',
          policyDigest: 'abc',
        },
        {
          path: 'api',
          preset: 'typescript',
          status: 'error',
          reason: '1 changed file',
          exitCode: 2,
          newEnforceableFindings: 0,
          toolErrors: 0,
          report: 'api',
          summary: 'api/summary.json',
          error: 'boom',
        },
        { path: 'app', preset: 'typescript', status: 'skipped', reason: 'no changed files' },
        {
          path: '.',
          preset: 'typescript',
          status: 'passed',
          reason: '1 changed file',
          exitCode: 0,
          newEnforceableFindings: 0,
          toolErrors: 0,
          report: '_root',
          summary: '_root/summary.json',
        },
      ],
      outsideProjects: ['README.md'],
      elapsedMs: 12,
    });
  });

  it('is completed when no project is incomplete', () => {
    const summary = combinedSummary({
      plan,
      outside: [],
      elapsedMs: 0,
      results: [row('web', false)],
    });

    expect(summary.overallStatus).toBe('completed');
    expect(summary.counts.run).toBe(0);
  });

  it('writes the summary and the text next to each other', () => {
    const root = path.join(mkdtempSync(path.join(tmpdir(), 'nitpicker-combined-')), 'out');

    writeCombinedReports(root, { overallStatus: 'completed' }, 'text\n');

    expect(JSON.parse(readFileSync(path.join(root, 'summary.json'), 'utf8'))).toEqual({
      overallStatus: 'completed',
    });
    expect(readFileSync(path.join(root, 'report.txt'), 'utf8')).toBe('text\n');
  });
});
