import { describe, expect, it } from 'vitest';
import { applyFindingExceptions, functionMatches } from './finding-exceptions.mjs';
import { exceptionRoute } from './rule-names.mjs';

const finding = (overrides) => ({
  tool: 'coverage',
  rule: 'changed-branch-coverage',
  path: 'src/a.ts',
  symbol: 'Store.save',
  ...overrides,
});

describe('functionMatches', () => {
  it.each([
    ['Store.save', 'Store.save', true],
    ['Store::save', 'Store.save', true],
    ['Calc.save', 'Calc::save( int a , int b)', true],
    ['Calc::save', 'Calc::save( long a)', true],
    ['save', 'Store.save', false],
    ['Store.save', 'save', false],
    ['ave', 'Store.save', false],
    ['Store', 'Store.save', false],
    ['Tests.`handles (x) input`', 'Tests.`handles (x) input`', true],
    ['Tests.`handles (x) input`', 'Tests.`handles (y) input`', false],
    ['save', undefined, false],
    ['save', '', false],
  ])('%s against %s is %s', (wanted, symbol, expected) => {
    expect(functionMatches(wanted, symbol)).toBe(expected);
  });
});

describe('applyFindingExceptions', () => {
  const lifted = { rule: 'changed-branch-coverage', paths: ['src/**'], function: 'Store.save' };

  it('drops only the findings of that rule, path and function', () => {
    const kept = [
      finding({ symbol: 'Store.load' }),
      finding({ symbol: 'save' }),
      finding({ symbol: 'Other.save' }),
      finding({ path: 'lib/a.ts' }),
      finding({ rule: 'crap-score-limit' }),
      finding({ symbol: undefined }),
    ];
    expect(applyFindingExceptions([finding(), ...kept], [lifted])).toEqual(kept);
  });

  it('drops every function of the path when the entry names no function', () => {
    expect(
      applyFindingExceptions(
        [finding(), finding({ symbol: 'load' })],
        [{ rule: 'changed-branch-coverage', paths: ['src/a.ts'] }],
      ),
    ).toEqual([]);
  });

  it('takes the rule as the finding prints it, <tool>/<rule>, with the tool of the finding', () => {
    const findings = [finding({ tool: 'coverage-py' }), finding({ tool: 'jacoco' })];

    expect(
      applyFindingExceptions(findings, [
        {
          rule: 'coverage-py/changed-branch-coverage',
          paths: ['src/a.ts'],
          function: 'Store.save',
        },
      ]),
    ).toEqual([findings[1]]);
  });

  it('narrows a PIT mutant to the method its symbol names', () => {
    const mutant = (symbol) => ({
      tool: 'pit',
      rule: 'mutant-survived',
      path: 'src/Calc.java',
      symbol,
    });
    const kept = [mutant('demo.Calc#load(I)I'), mutant('demo.Calc$Inner#save(I)I')];

    expect(
      applyFindingExceptions(
        [
          mutant('demo.Calc#save(IIII)I'),
          mutant('demo.Calc#save(I)I'),
          mutant('demo.Calc#lambda$save$0(I)I'),
          ...kept,
        ],
        [{ rule: 'mutant-survived', paths: ['src/Calc.java'], function: 'Calc.save' }],
      ),
    ).toEqual(kept);
  });

  it('narrows a dead-code finding to the declaration its name gives', () => {
    const unused = (symbol) => ({ tool: 'dead-code', rule: 'exports', path: 'src/lib.ts', symbol });

    expect(
      applyFindingExceptions(
        [unused('unusedA'), unused('unusedB')],
        [{ rule: 'exports', paths: ['src/lib.ts'], name: 'unusedA' }],
      ),
    ).toEqual([unused('unusedB')]);
  });

  it.each(['src/{x}/a.ts', 'src/[id]/a.ts', 'src/a,b/a.ts', 'src/a*/a.ts', 'src/what?/a.ts'])(
    'lifts the finding of %s with the entry its message prints',
    (path) => {
      const entry = JSON.parse(
        /add (\{.*\}) to/u.exec(exceptionRoute({ rule: 'duplicate-clone', path }))[1],
      );

      expect(
        applyFindingExceptions(
          [
            { tool: 'duplicates', rule: 'duplicate-clone', path },
            { tool: 'duplicates', rule: 'duplicate-clone', path: 'src/other/a.ts' },
          ],
          [entry],
        ),
      ).toEqual([{ tool: 'duplicates', rule: 'duplicate-clone', path: 'src/other/a.ts' }]);
    },
  );

  it('returns the findings untouched without exceptions', () => {
    const findings = [finding()];
    expect(applyFindingExceptions(findings, [])).toBe(findings);
  });
});
