import { runInNewContext } from 'node:vm';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { ruleModule } from '../../test-support/rule-tester.mts';
import { rule } from './simpler-boolean-logic.mts';

const VALUES = [true, false, 0, 1, '', 'x', null, undefined, Number.NaN];
const CONFIG = [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker: { rules: { 'simpler-boolean-logic': ruleModule(rule) } } },
    rules: { 'nitpicker/simpler-boolean-logic': 'error' as const },
  },
];

function fixed(code: string): string | undefined {
  const result = new Linter({ configType: 'flat' }).verifyAndFix(code, CONFIG, {
    filename: 'case.ts',
  });
  return result.fixed ? result.output : undefined;
}

function results(code: string): unknown {
  const seen: unknown = runInNewContext(
    `const calls = [];
     function f(value) { calls.push(value); return value; }
     ${code}
     const seen = [];
     for (const a of values) for (const b of values) for (const c of values) {
       calls.length = 0;
       seen.push([run(a, b, c), [...calls]]);
     }
     seen`,
    { values: VALUES },
  );
  return seen;
}

const PURE = [
  ['if (a < b) { return true; } return false;', 'return a < b;'],
  ['return !a && !b;', 'return !(a || b);'],
  ['return !a || !b || !c;', 'return !(a && b && c);'],
  ['return a ? false : b < c;', 'return !a && b < c;'],
  ['return a ? b < c : true;', 'return !a || b < c;'],
  ['return !a ? b : c;', 'return a ? c : b;'],
  ['return !!a ? b : c;', 'return a ? b : c;'],
  ['return !!!a ? b : c;', 'return a ? c : b;'],
  ['return !(a === b) && c;', 'return a !== b && c;'],
  ["return !(a == 'x') || !c;", "return a != 'x' || !c;"],
];

const WITH_CALLS = [
  ['return !f(a) && !f(b);', 'return !(f(a) || f(b));'],
  ['return !!f(a) ? b : c;', 'return f(a) ? b : c;'],
  ['return !f(a) ? b : c;', 'return f(a) ? c : b;'],
];

function run(body: string): string {
  return `function run(a, b, c) { ${body} }`;
}

describe('the simpler-boolean-logic fix', () => {
  it.each([...PURE, ...WITH_CALLS])(
    'writes %s as %s, which returns and calls the same',
    (body, form) => {
      expect(fixed(run(body))).toBe(run(form));
      expect(results(run(form))).toEqual(results(run(body)));
    },
  );

  it.each(['return !true && f(a);', 'return !(/* why */ a) && !b;'])(
    'reports %s and leaves it without a fix',
    (body) => {
      const code = run(body);
      const messages = new Linter({ configType: 'flat' }).verify(code, CONFIG, {
        filename: 'case.ts',
      });

      expect(messages.map(({ ruleId }) => ruleId)).toEqual(['nitpicker/simpler-boolean-logic']);
      expect(fixed(code)).toBeUndefined();
    },
  );
});
