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

describe('withExceptionRoutes', () => {
  it.each([
    ['mutant-survived'],
    ['mutant-nocoverage'],
    ['duplicate-clone'],
    ['stability-direction'],
  ])('appends the entry that accepts %s for its path', (rule) => {
    expect(withExceptionRoutes([finding(rule)])).toEqual([
      finding(rule, {
        message: `The base message. If a reviewer agrees this is intended, add {"rule":"${rule}","paths":["src/a.ts"],"reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.`,
      }),
    ]);
  });

  it('ends a message that has no full stop before the entry', () => {
    expect(
      withExceptionRoutes([finding('stability-direction', { message: 'a depends on b' })]),
    ).toEqual([
      finding('stability-direction', {
        message:
          'a depends on b. If a reviewer agrees this is intended, add {"rule":"stability-direction","paths":["src/a.ts"],"reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
      }),
    ]);
  });

  it('leaves descriptive findings and other rules alone', () => {
    const findings = [
      finding('mutant-survived', { classification: 'descriptive' }),
      finding('function-lines-limit'),
    ];
    expect(withExceptionRoutes(findings)).toEqual(findings);
  });

  it('routes the rules it is given', () => {
    expect(withExceptionRoutes([finding('exports')], ['exports'])).toEqual([
      finding('exports', {
        message:
          'The base message. If a reviewer agrees this is intended, add {"rule":"exports","paths":["src/a.ts"],"reason":"<why this is intended>"} to "exceptions" in nitpicker.config.json.',
      }),
    ]);
  });
});
