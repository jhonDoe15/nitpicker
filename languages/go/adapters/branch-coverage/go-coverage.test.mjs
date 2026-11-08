import { describe, expect, it } from 'vitest';
import { parseCoverProfile } from './coverage-profile.mjs';
import { goBranchFindings } from './go-branch-coverage.mjs';
import { goCrapFindings } from './go-crap.mjs';

const PROFILE = `mode: count
example.com/shop/shop/grade.go:3.30,4.16 1 3
example.com/shop/shop/grade.go:4.16,6.3 1 1
example.com/shop/shop/grade.go:6.8,6.23 1 2
example.com/shop/shop/grade.go:6.23,8.3 1 1
example.com/shop/shop/grade.go:9.2,10.15 2 1
example.com/shop/shop/grade.go:10.15,12.3 1 0
example.com/shop/shop/grade.go:13.2,13.15 1 1
example.com/shop/shop/grade.go:14.12,15.15 1 1
example.com/shop/shop/grade.go:16.9,16.9 0 0
example.com/shop/shop/grade.go:18.2,18.38 1 1
example.com/shop/shop/grade.go:18.38,20.3 1 0
example.com/shop/shop/grade.go:21.2,21.18 1 1
example.com/shop/shop/grade.go:21.18,21.30 1 0
example.com/shop/shop/grade.go:22.2,23.14 2 1
example.com/shop/shop/grade.go:22.2,23.14 2 0
example.com/other/skipped.go:1.1,2.2 1 1
`;
const at = (line, column) => ({ line, column });
const arm = (label, from, to = from) => ({ label, from, to });
const IF_FALSE = 'the condition false (the if body skipped)';
const BRANCHES = [
  {
    at: at(4, 2),
    arms: [arm('the if body', at(4, 16)), arm('the else branch', at(6, 3), at(6, 9))],
  },
  { at: at(6, 9), arms: [arm('the if body', at(6, 23))], implicit: IF_FALSE },
  { at: at(10, 2), arms: [arm('the if body', at(10, 15))], implicit: IF_FALSE },
  {
    at: at(13, 2),
    arms: [arm('case 1, 2', at(14, 12)), arm('case 3', at(16, 9))],
    implicit: 'no case matching',
  },
  { at: at(18, 2), arms: [arm('the loop body', at(18, 38))] },
].map((branch) => ({ file: 'shop/grade.go', function: 'Grade', kind: 'if', ...branch }));
const SOURCE = Array.from({ length: 24 }, (_, index) => `line ${String(index + 1)}`);
const FUNCTIONS = [
  {
    file: 'shop/grade.go',
    name: 'Grade',
    start: 3,
    end: 24,
    complexity: 8,
    body: at(3, 30),
    close: at(24, 1),
  },
  {
    file: 'shop/grade.go',
    name: 'Grade.func1',
    start: 21,
    end: 21,
    complexity: 1,
    body: at(21, 18),
    close: at(21, 29),
  },
];

function branchSummary(findings) {
  return findings.map(({ rule, path, symbol, location, message }) => ({
    rule,
    path,
    symbol,
    line: location.line,
    missed: /Branch coverage is (?<percent>[\d.]+)%.*Not taken: (?<arms>.*?)\. Test it/u.exec(
      message,
    )?.groups,
  }));
}

describe('Go coverage', () => {
  const profile = parseCoverProfile(PROFILE, 'example.com/shop');

  it('reads the blocks of module files, adding up blocks that several test binaries report', () => {
    expect(profile.counted).toBe(true);
    expect([...profile.files.keys()]).toEqual(['shop/grade.go']);
    expect(profile.files.get('shop/grade.go').at(-1)).toEqual({
      start: at(22, 2),
      end: at(23, 14),
      statements: 2,
      count: 1,
    });
  });

  it('measures each branch outcome from its block, and implicit outcomes from the evaluations', () => {
    const findings = goBranchFindings({ branches: BRANCHES, profile, sourceLines: () => SOURCE });
    expect(branchSummary(findings)).toEqual([
      {
        rule: 'changed-branch-coverage',
        path: 'shop/grade.go',
        symbol: 'Grade',
        line: 10,
        missed: { percent: '50.00', arms: 'the if body (line 10)' },
      },
      {
        rule: 'changed-branch-coverage',
        path: 'shop/grade.go',
        symbol: 'Grade',
        line: 13,
        missed: { percent: '33.33', arms: 'case 3 (line 16); no case matching' },
      },
      {
        rule: 'changed-branch-coverage',
        path: 'shop/grade.go',
        symbol: 'Grade',
        line: 18,
        missed: { percent: '0.00', arms: 'the loop body (line 18)' },
      },
    ]);
  });

  it('leaves implicit outcomes out of a profile that only records whether a block ran', () => {
    const set = parseCoverProfile(PROFILE.replace('mode: count', 'mode: set'), 'example.com/shop');
    const findings = goBranchFindings({
      branches: BRANCHES,
      profile: set,
      sourceLines: () => SOURCE,
    });
    expect(
      branchSummary(findings).map(({ line, missed }) => `${String(line)} ${missed.percent}`),
    ).toEqual(['10 0.00', '13 50.00', '18 0.00']);
  });

  it('scores CRAP from the statement and branch coverage of a function, without its literals', () => {
    const findings = goCrapFindings({
      functions: FUNCTIONS,
      branches: BRANCHES,
      profile,
      functionText: ({ start, end }) => SOURCE.slice(start - 1, end).join('\n'),
    });
    expect(
      findings.map(({ rule, symbol, message }) => `${rule} ${symbol} ${message.split('.')[0]}`),
    ).toEqual(['crap-score-limit Grade Grade has CRAP 12']);
  });

  it('cannot score functions when no test wrote coverage, and skips files the build left out', () => {
    const empty = parseCoverProfile('', 'example.com/shop');
    const unknown = goCrapFindings({
      functions: FUNCTIONS,
      branches: [],
      profile: empty,
      functionText: () => 'x',
    });
    expect(unknown.map(({ rule, symbol }) => `${rule} ${symbol}`)).toEqual([
      'crap-coverage-unknown Grade',
      'crap-coverage-unknown Grade.func1',
    ]);
    const elsewhere = FUNCTIONS.map((fn) => ({ ...fn, file: 'shop/grade_windows.go' }));
    expect(
      goCrapFindings({ functions: elsewhere, branches: [], profile, functionText: () => 'x' }),
    ).toEqual([]);
  });
});
