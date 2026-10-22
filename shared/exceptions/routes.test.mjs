import { describe, expect, it } from 'vitest';
import { withExceptionRoutes } from './routes.mjs';

const finding = (rule, overrides = {}) => ({
  tool: 'tool',
  rule,
  path: 'src/a.ts',
  identity: `${rule}:1`,
  message: 'The base message.',
  classification: 'enforceable',
  ...overrides,
});

const route = (entry) =>
  `If this is intended, add ${entry} to "exceptions" in nitpicker.config.json.`;

describe('withExceptionRoutes', () => {
  it.each([
    ['mutant-survived', 'mutation'],
    ['mutant-nocoverage', 'pit'],
    ['duplicate-clone', 'duplicates'],
    ['stability-direction', 'coupling'],
    ['no-production-runtime', 'test-runtime'],
    ['type-only-production-dependency', 'test-runtime'],
    ['public-alternative-bypass', 'entry-points'],
    ['files', 'dead-code'],
    ['public-contract-production-use', 'coding-standards'],
    ['runtime-boundary/no-fetch', 'coding-standards'],
    ['callback-protocol/no-promise-callback', 'coding-standards'],
    ['no-production-cycles', 'dependency-architecture'],
    ['domain-does-not-import-adapters', 'dependency-architecture'],
  ])('appends the entry that accepts %s for its path', (rule, tool) => {
    expect(withExceptionRoutes([finding(rule, { tool })])).toEqual([
      finding(rule, {
        tool,
        message: `The base message. ${route(`{"rule":"${rule}","paths":["src/a.ts"],"reason":"..."}`)}`,
      }),
    ]);
  });

  it('names the function of a mutant and the declaration of an unused export', () => {
    expect(
      withExceptionRoutes([
        finding('mutant-survived', { tool: 'pit', symbol: 'demo.Calc#save(IIII)I' }),
        finding('exports', { tool: 'dead-code', symbol: 'helper' }),
      ]).map(({ message }) => message),
    ).toEqual([
      `The base message. ${route('{"rule":"mutant-survived","paths":["src/a.ts"],"function":"Calc.save","reason":"..."}')}`,
      `The base message. ${route('{"rule":"exports","paths":["src/a.ts"],"name":"helper","reason":"..."}')}`,
    ]);
  });

  it('escapes the glob characters of a printed path', () => {
    expect(
      withExceptionRoutes([
        finding('duplicate-clone', { tool: 'duplicates', path: 'src/[id]/{x}/a.ts' }),
      ])[0].message,
    ).toBe(
      `The base message. ${route('{"rule":"duplicate-clone","paths":["src/\\\\[id\\\\]/\\\\{x\\\\}/a.ts"],"reason":"..."}')}`,
    );
  });

  it('ends a message that has no full stop before the entry', () => {
    expect(
      withExceptionRoutes([
        finding('stability-direction', { tool: 'coupling', message: 'a depends on b' }),
      ])[0].message,
    ).toBe(
      `a depends on b. ${route('{"rule":"stability-direction","paths":["src/a.ts"],"reason":"..."}')}`,
    );
  });

  it('leaves descriptive findings, other rules and rules of another tool alone', () => {
    const findings = [
      finding('mutant-survived', { tool: 'mutation', classification: 'descriptive' }),
      finding('function-lines-limit', { tool: 'structure' }),
      finding('files', { tool: 'eslint' }),
    ];
    expect(withExceptionRoutes(findings)).toEqual(findings);
  });

  it('routes the rules it is given', () => {
    expect(withExceptionRoutes([finding('exports')], ['exports'])).toEqual([
      finding('exports', {
        message: `The base message. ${route('{"rule":"exports","paths":["src/a.ts"],"reason":"..."}')}`,
      }),
    ]);
  });
});
