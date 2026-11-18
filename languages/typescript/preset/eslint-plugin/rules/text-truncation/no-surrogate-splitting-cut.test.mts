import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { typedCases } from '../../test-support/typed-cases.mts';
import { rule } from './no-surrogate-splitting-cut.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-surrogate-');
afterAll(cleanup);
const untyped = typescriptRuleTester();
const ERROR = [{ messageId: 'surrogateCut' }];

function wrap(code: string) {
  return `export function cut(s: string, text: string, max: number, items: string[], hex: string) {\n${code}\n}`;
}

tester.run('no-surrogate-splitting-cut (typed)', rule, {
  valid: [
    wrap('return s.length > max ? Array.from(s).slice(0, max).join("") : s;'),
    wrap('return s.slice(0, max);'),
    wrap('return items.length > max ? items.slice(0, max) : items;'),
    wrap('if (s.length > max) { return s.slice(1, max); } return s;'),
    wrap('return s.length > max ? s.slice(0, 1) : s;'),
    wrap('return hex.length > max ? hex.slice(0, max) : hex;'),
    wrap('return s.length > 10 ? text.slice(0, 10) : text;'),
    wrap(
      'if (s.length > max) { const units = s.charCodeAt(max - 1); return s.slice(0, max - Number(units > 0)); } return s;',
    ),
    wrap('const seg = new Intl.Segmenter(); return s.length > max ? s.slice(0, max) : s;'),
    wrap('return s.length < max ? s.slice(0, max) : s;'),
    wrap('return s.length > 1 ? s.slice(0, -1) : s;'),
  ].map((code) => typed(code)),
  invalid: [
    wrap('return s.length > max ? s.slice(0, max) : s;'),
    wrap('return s.length > max ? s.substring(0, max - 3) + "..." : s;'),
    wrap('if (s.length > max) { return s.substr(0, max); } return s;'),
    wrap('if (s.length > max) { s = s.substring(0, max - 3) + "..."; } return s;'),
    wrap('if (s.length > 100) { return s.slice(0, 100); } return s;'),
    wrap('if (s.length <= max) { return s; } return s.slice(0, max);'),
    wrap('return s.length >= max && s.slice(0, max);'),
    wrap('return max < s.length ? s.slice(0, max) : s;'),
  ].map((code) => typed(code, ERROR)),
});

untyped.run('no-surrogate-splitting-cut (untyped)', rule, {
  valid: [
    'export const a = items.length > max ? items.slice(0, max) : items;',
    'export const b = s.length > max ? s.slice(0, max) : s;',
    'export const c = s.length > max ? s.slice(0, max) + "x" : s;',
  ],
  invalid: [
    { code: 'export const a = s.length > max ? s.slice(0, max - 3) + "..." : s;', errors: ERROR },
    { code: 'export const a = s.length > max ? `${s.slice(0, max - 1)}…` : s;', errors: ERROR },
  ],
});
