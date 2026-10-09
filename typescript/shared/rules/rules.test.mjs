import { describe, expect, it } from 'vitest';
import { branchCoverageFindings } from './branch-coverage.mjs';
import { crapFindings } from './crap.mjs';
import { mutantFindings } from './mutation.mjs';

describe('crapFindings', () => {
  const fn = { path: 'a.ts', name: 'f', identity: 'function:f', line: 3 };

  it('fails at or above the limit and passes below it', () => {
    const findings = crapFindings(
      [
        { ...fn, crap: 9 },
        { ...fn, identity: 'low', crap: 8.99 },
      ],
      { tool: 'crap' },
    );
    expect(findings).toEqual([
      {
        tool: 'crap',
        rule: 'crap-score-limit',
        path: 'a.ts',
        identity: 'function:f',
        message: 'f has CRAP 9.00; score must be below 9',
        classification: 'enforceable',
        symbol: 'f',
        location: { line: 3 },
      },
    ]);
  });

  it('reports unknown coverage when there is no finite score', () => {
    const findings = crapFindings([{ ...fn, line: undefined }], { tool: 'crap', limit: 5 });
    expect(findings).toEqual([
      expect.objectContaining({
        rule: 'crap-coverage-unknown',
        message: 'f has unknown coverage and no CRAP score',
        symbol: 'f',
      }),
    ]);
    expect(findings[0]).not.toHaveProperty('location');
  });
});

describe('branchCoverageFindings', () => {
  const identify = (key, occurrence) => `${key}:${String(occurrence)}`;

  it('numbers only the failing branches that share a key', () => {
    const findings = branchCoverageFindings(
      [
        { path: 'a', key: 'k', percent: 50, line: 1 },
        { path: 'a', key: 'k', percent: 100, line: 2 },
        { path: 'a', key: 'k', percent: 0, line: 3 },
        { path: 'b', key: 'k', percent: 94.9 },
      ],
      { tool: 'cov', identify },
    );
    expect(findings.map((finding) => finding.identity)).toEqual(['k:1', 'k:2', 'k:1']);
    expect(findings[0]).toMatchObject({
      rule: 'changed-branch-coverage',
      message: 'Branch coverage is 50.00%; minimum is 95%',
      classification: 'enforceable',
      location: { line: 1 },
    });
    expect(findings[2]).not.toHaveProperty('location');
  });

  it('passes a branch at the minimum', () => {
    expect(
      branchCoverageFindings([{ path: 'a', key: 'k', percent: 95 }], { tool: 'cov', identify }),
    ).toEqual([]);
  });
});

describe('mutantFindings', () => {
  it('enforces survived and uncovered mutants only', () => {
    const findings = mutantFindings(
      [
        { path: 'a', identity: '1', status: 'Survived', label: 'Op', line: 4, symbol: 'C#m' },
        { path: 'a', identity: '2', status: 'NoCoverage', label: 'Op' },
        { path: 'a', identity: '3', status: 'Timeout', label: 'Op' },
      ],
      { tool: 'mut' },
    );
    expect(findings.map((finding) => [finding.rule, finding.classification])).toEqual([
      ['mutant-survived', 'enforceable'],
      ['mutant-nocoverage', 'enforceable'],
      ['mutant-timeout', 'descriptive'],
    ]);
    expect(findings[0]).toMatchObject({
      message: 'Survived Op',
      symbol: 'C#m',
      location: { line: 4 },
    });
    expect(findings[1]).not.toHaveProperty('location');
  });
});
