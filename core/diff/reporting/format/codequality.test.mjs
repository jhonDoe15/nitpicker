import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { comparisonKey } from '../../comparison/fingerprint.mjs';
import { finding } from '../test-support/report-builders.mjs';
import { renderCodeQualityReport } from './codequality.mjs';

function fingerprint(projectDirectory, value) {
  return createHash('sha256')
    .update(`${projectDirectory}\n${comparisonKey(value)}`)
    .digest('hex');
}

describe('renderCodeQualityReport', () => {
  it('writes one Code Climate issue per finding, with the path from the repository root', () => {
    const enforceable = finding();
    const descriptive = finding({
      classification: 'descriptive',
      identity: 'other',
      location: undefined,
      message: 'Function is long',
      rule: 'max-lines-per-function',
    });

    expect(
      JSON.parse(
        renderCodeQualityReport([enforceable, descriptive], { projectPath: 'services/api' }),
      ),
    ).toEqual([
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
    const [issue] = JSON.parse(renderCodeQualityReport([finding()], { projectPath: '.' }));

    expect([issue.location.path, issue.fingerprint]).toEqual([
      'src/a.js',
      fingerprint('', finding()),
    ]);
  });

  it('names the project folder for a finding about the whole project', () => {
    const report = (projectPath) =>
      JSON.parse(renderCodeQualityReport([finding({ path: '' })], { projectPath }))[0].location
        .path;

    expect([report('services/api/'), report('.')]).toEqual(['services/api', '.']);
  });

  it('gives the same finding a different fingerprint in another project of the repository', () => {
    const fingerprints = ['web', 'api'].map(
      (projectPath) =>
        JSON.parse(renderCodeQualityReport([finding()], { projectPath }))[0].fingerprint,
    );

    expect(new Set(fingerprints).size).toBe(2);
  });

  it('writes an empty list when there is nothing to report', () => {
    expect(renderCodeQualityReport([])).toBe('[]\n');
  });
});
