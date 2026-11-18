import { runInNewContext } from 'node:vm';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { ruleModule } from '../../test-support/rule-tester.mts';
import { rule } from './shorter-boolean-logic.mts';

const NUMBERS = [-1, 0, 1, 3, 4, 5, 6, 9, 10, 15, 19, 20, 25];
const VALUES = [...NUMBERS, true, false, '', 'a  b', null, undefined];
const CONFIG = [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { nitpicker: { rules: { 'shorter-boolean-logic': ruleModule(rule) } } },
    rules: { 'nitpicker/shorter-boolean-logic': 'error' as const },
  },
];

function lint(code: string) {
  const linter = new Linter({ configType: 'flat' });
  const messages = linter.verify(code, CONFIG, { filename: 'case.ts' });
  const result = linter.verifyAndFix(code, CONFIG, { filename: 'case.ts' });
  return { reported: messages.length > 0, output: result.fixed ? result.output : undefined };
}

function results(code: string, values: readonly unknown[]): unknown[] {
  return runInNewContext(
    `${code}
     const seen = [];
     for (const n of values) for (const x of values) for (const a of [true, false]) for (const b of [true, false])
       seen.push(run(n, x, a, b));
     seen`,
    { values },
  );
}

function run(body: string): string {
  return `function run(n, x, a, b) { ${body} }`;
}

describe('the shorter-boolean-logic fix', () => {
  it.each([
    'if ((a && b) || (a && !b)) { return 1; } return 0;',
    'if ((b && a) || (n > 3 && b) || (!(n > 3) && a)) { return 1; } return 0;',
    'if (!((a && b) || (a && !b))) { return 1; } return 0;',
  ])('keeps what %s returns', (body) => {
    const { output } = lint(run(body));

    expect(output).toBeDefined();
    expect(results(output ?? '', VALUES)).toEqual(results(run(body), VALUES));
  });

  it.each([
    ['return n > 3 && n > 5;', 'return n > 5;'],
    ['return n > 5 || n > 3;', 'return n > 3;'],
    ['return (x >= 0 && x < 10) || (x >= 10 && x < 20);', 'return x >= 0 && x < 20;'],
    ['return !(n > 3 && n > 5);', 'return !(n > 5);'],
    ['return n > 3 && a && n > 5;', 'return a && n > 5;'],
  ])('writes %s as %s, which returns the same for numbers', (body, fixed) => {
    expect(results(run(fixed), NUMBERS)).toEqual(results(run(body), NUMBERS));
  });

  it('keeps the text of a string leaf as written', () => {
    expect(
      lint(run("if ((x === 'a  b' && a) || (x === 'a  b' && !a)) { return 1; } return 0;")).output,
    ).toBe(run("if (x === 'a  b') { return 1; } return 0;"));
  });

  it.each([
    'if (((a as boolean) && b) || (a && !b)) { return 1; } return 0;',
    'if ((a && b) || /* other */ (a && !b)) { return 1; } return 0;',
  ])('reports %s and leaves it without a fix', (body) => {
    expect(lint(run(body))).toEqual({ reported: true, output: undefined });
  });

  it.each([
    'if ((g() && a) || (g() && !a)) { return 1; } return 0;',
    'if (u !== null && u.n > 1 && u.n > 0 && u.n > -1) { return 1; } return 0;',
  ])('leaves %s unreported, as a dropped call or a narrowing leaf would change it', (body) => {
    const code = `declare function g(): boolean; declare const u: any; ${run(body)}`;

    expect(lint(code)).toEqual({ reported: false, output: undefined });
  });
});
