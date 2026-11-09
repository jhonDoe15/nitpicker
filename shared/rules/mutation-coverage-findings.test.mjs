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
        message:
          'f has CRAP 9.00; score must be below 9. Test its uncovered branches, or split a branchy part into its own function. If this is intended, add {"rule":"crap-score-limit","paths":["a.ts"],"function":"f","reason":"..."} to "exceptions" in nitpicker.config.json.',
        allowedForm: 'Test its uncovered branches, or split a branchy part into its own function.',
        classification: 'enforceable',
        symbol: 'f',
        location: { line: 3 },
      },
    ]);
  });

  it('names the exception entry in the unknown-coverage and ratchet messages', () => {
    const [unknown] = crapFindings([{ ...fn, line: undefined }], {
      tool: 'crap',
    });
    expect(unknown.message).toBe(
      'f has unknown coverage and no CRAP score: no test runs it. Add a test that calls it; for inline composition-root wiring, move it to a named function in adapters/ and test that. If this is intended, add {"rule":"crap-coverage-unknown","paths":["a.ts"],"function":"f","reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
    const [ratcheted] = crapFindings([{ ...fn, ratchetKey: 'f:crap', crap: 12 }], { tool: 'crap' });
    expect(ratcheted.ratchet.worseMessage).toBe(
      'f CRAP rose from {base} to 12 (limit 9). Put new code in a new function and cover it with tests. If this is intended, add {"rule":"crap-score-limit","paths":["a.ts"],"function":"f","reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
  });

  it('reports unknown coverage when there is no finite score', () => {
    const findings = crapFindings([{ ...fn, line: undefined }], { tool: 'crap', limit: 5 });
    expect(findings).toEqual([
      expect.objectContaining({
        rule: 'crap-coverage-unknown',
        message: expect.stringContaining(
          'f has unknown coverage and no CRAP score: no test runs it',
        ),
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
      message:
        'Branch coverage is 50.00%; minimum is 95%. Add a test for each outcome it misses. To accept the file, add it to "exclude" in nitpicker.config.json.',
      classification: 'enforceable',
      location: { line: 1 },
    });
    expect(findings[2]).not.toHaveProperty('location');
  });

  it('names the per-function exception when the branch knows its function', () => {
    const [finding] = branchCoverageFindings(
      [{ path: 'src/a.py', key: 'k', percent: 50, symbol: 'Store.save', arms: ['the exit'] }],
      { tool: 'cov', identify },
    );
    expect(finding.message).toBe(
      'Branch coverage is 50.00%; minimum is 95%. Not taken: the exit. Test it, or remove it if it can\'t happen. If this is intended, add {"rule":"changed-branch-coverage","paths":["src/a.py"],"function":"Store.save","reason":"..."} to "exceptions" in nitpicker.config.json.',
    );
    expect(finding.symbol).toBe('Store.save');
  });

  it('gives each finding the allowed form its message states', () => {
    const findings = branchCoverageFindings(
      [
        { path: 'a', key: 'k', percent: 50 },
        { path: 'a', key: 'j', percent: 50, arms: ['the exit'] },
      ],
      { tool: 'cov', identify },
    );

    expect(
      findings.map(({ message, allowedForm }) => [allowedForm, message.includes(allowedForm)]),
    ).toEqual([
      ['Add a test for each outcome it misses.', true],
      ["Test it, or remove it if it can't happen.", true],
    ]);
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
      message:
        'Survived Op: no test fails when this code changes. Add an assertion that would. If no input can tell the two apart, simplify the code so this mutant disappears.',
      symbol: 'C#m',
      location: { line: 4 },
    });
    expect(findings[1]).not.toHaveProperty('location');
  });
});
