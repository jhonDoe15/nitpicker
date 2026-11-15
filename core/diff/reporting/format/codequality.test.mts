import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { comparisonKey } from '../../comparison/fingerprint.mjs';
import { fieldAt, listOf } from '../../../../scripts/json/fields.mts';
import { parseJson } from '../../../../shared/values/readers.mts';
import type { ReportEntry } from '../../../../shared/values/findings.mts';
import { finding } from '../test-support/report-builders.mts';
import { renderCodeQualityReport } from './codequality.mts';

function fingerprint(projectDirectory: string, value: ReportEntry): string {
  return createHash('sha256')
    .update(`${projectDirectory}\n${comparisonKey(value)}`)
    .digest('hex');
}

function issuesOf(
  findings: readonly ReportEntry[],
  options?: { readonly projectPath?: string },
): readonly unknown[] {
  return listOf(parseJson(renderCodeQualityReport(findings, options)));
}

describe('renderCodeQualityReport', () => {
  it('writes one Code Climate issue per finding, with the path from the repository root', () => {
    const enforceable = finding();
    const descriptive: ReportEntry = {
      ...finding({
        classification: 'descriptive',
        identity: 'other',
        message: 'Function is long',
        rule: 'max-lines-per-function',
      }),
      location: undefined,
    };

    expect(issuesOf([enforceable, descriptive], { projectPath: 'services/api' })).toEqual([
      {
        description: 'Unexpected console statement',
        check_name: 'eslint/no-console',
        fingerprint: fingerprint('services/api', enforceable),
        severity: 'major',
        location: { path: 'services/api/src/a.js', lines: { begin: 12 } },
      },
      {
        description: 'Function is long',
        check_name: 'eslint/max-lines-per-function',
        fingerprint: fingerprint('services/api', descriptive),
        severity: 'info',
        location: { path: 'services/api/src/a.js', lines: { begin: 1 } },
      },
    ]);
  });

  it('keeps paths as they are for a project at the repository root', () => {
    const [issue] = issuesOf([finding()], { projectPath: '.' });

    expect([fieldAt(issue, 'location', 'path'), fieldAt(issue, 'fingerprint')]).toEqual([
      'src/a.js',
      fingerprint('', finding()),
    ]);
  });

  it('names the project folder for a finding about the whole project', () => {
    const report = (projectPath: string): unknown =>
      fieldAt(issuesOf([finding({ path: '' })], { projectPath }), 0, 'location', 'path');

    expect([report('services/api/'), report('.')]).toEqual(['services/api', '.']);
  });

  it('gives the same finding a different fingerprint in another project of the repository', () => {
    const fingerprints = ['web', 'api'].map((projectPath) =>
      fieldAt(issuesOf([finding()], { projectPath }), 0, 'fingerprint'),
    );

    expect(new Set(fingerprints).size).toBe(2);
  });

  it('writes an empty list when there is nothing to report', () => {
    expect(renderCodeQualityReport([])).toBe('[]\n');
  });
});

describe('renderCodeQualityReport with findings GitLab would merge', () => {
  it('keeps the first of the findings that share a fingerprint', () => {
    const first = finding({ message: 'first' });
    const again = finding({ message: 'again', location: { line: 40 } });

    expect(issuesOf([first, again]).map((issue) => fieldAt(issue, 'description'))).toEqual([
      'first',
    ]);
  });

  it('starts every location at line 1 or later', () => {
    const lines = [0, -3].map((line) =>
      fieldAt(issuesOf([finding({ location: { line } })]), 0, 'location', 'lines', 'begin'),
    );

    expect(lines).toEqual([1, 1]);
  });
});
