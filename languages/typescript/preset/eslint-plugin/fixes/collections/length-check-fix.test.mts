import { afterAll } from 'vitest';
import { typedCases } from '../../test-support/typed-cases.mts';
import { typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from '../../rules/collections/pipelines/no-wasted-collection-step.mts';

const { tester, cleanup, typed } = typedCases('nitpicker-length-check-');
afterAll(cleanup);
const untyped = typescriptRuleTester();

const PRE = `export {}; interface Item { ok: boolean }
declare const xs: Item[]; declare const ro: readonly Item[]; declare const pair: [Item, Item];
declare const text: string; declare const anything: any; declare const set: Set<Item>;
declare const flag: boolean; declare const maybe: { list: Item[] } | undefined;
declare const holder: { list: Item[] }; declare const box: Box;
declare function items(): Item[]; declare let i: number;
class Box { list: Item[] = []; get view(): Item[] { return this.list; } check() { return CHECK; } }`;

function errors(method: string, answer: string) {
  return [{ messageId: 'lengthCheck', data: { method, answer } }];
}

function program(expression: string) {
  return PRE.replace('CHECK', 'true') + ` export const r = ${expression};`;
}

function fixes(before: string, after: string, method = 'some') {
  return {
    ...typed(program(before), errors(method, String(method === 'every'))),
    output: program(after),
  };
}

function declines(before: string, method = 'some') {
  return {
    ...typed(program(before), errors(method, String(method === 'every'))),
    output: null,
  };
}

function inClass(before: string, after: string | null, method = 'some') {
  const code = (check: string) => PRE.replace('CHECK', check) + ' export {};';
  return {
    ...typed(code(before), errors(method, String(method === 'every'))),
    output: after === null ? null : code(after),
  };
}

const NON_EMPTY = [
  'xs.length > 0',
  'xs.length !== 0',
  'xs.length != 0',
  'xs.length >= 1',
  '0 < xs.length',
  '1 <= xs.length',
  '0 !== xs.length',
];
const EMPTY = [
  'xs.length === 0',
  'xs.length == 0',
  'xs.length < 1',
  '0 === xs.length',
  '1 > xs.length',
];

tester.run('length check fix', rule, {
  valid: [
    typed(program('xs.length > 0 && ro.some((x) => x.ok)')),
    typed(program('xs.length && xs.some((x) => x.ok)')),
    typed(program('!xs.length || xs.every((x) => x.ok)')),
    typed(program('xs.length > 0 || xs.some((x) => x.ok)')),
    typed(program('xs.length === 0 && xs.every((x) => x.ok)')),
    typed(program('xs.length > 1 && xs.some((x) => x.ok)')),
    typed(program('xs.length === 0 || xs.some((x) => x.ok)')),
  ],
  invalid: [
    ...NON_EMPTY.map((test) => fixes(`${test} && xs.some((x) => x.ok)`, 'xs.some((x) => x.ok)')),
    ...EMPTY.map((test) =>
      fixes(`${test} || xs.every((x) => x.ok)`, 'xs.every((x) => x.ok)', 'every'),
    ),
    fixes('ro.length > 0 && ro.some((x) => x.ok)', 'ro.some((x) => x.ok)'),
    fixes('pair.length > 0 && pair.some((x) => x.ok)', 'pair.some((x) => x.ok)'),
    fixes(
      'holder.list.length > 0 && holder.list.some((x) => x.ok)',
      'holder.list.some((x) => x.ok)',
    ),
    fixes('(xs.length > 0 && xs.some((x) => x.ok)) || flag', '(xs.some((x) => x.ok)) || flag'),
    fixes(
      'flag || (xs.length === 0 || xs.every((x) => x.ok))',
      'flag || (xs.every((x) => x.ok))',
      'every',
    ),
    fixes('flag || xs.length > 0 && xs.some((x) => x.ok)', 'flag || xs.some((x) => x.ok)'),
    fixes('xs.length > 0 && xs.some((x) => x.ok) && flag', 'xs.some((x) => x.ok) && flag'),
    fixes('xs.length > 0 && xs.some(Boolean)', 'xs.some(Boolean)'),
    fixes(
      'xs[0] ? xs.length > 0 && xs.some((x) => x.ok) : flag',
      'xs[0] ? xs.some((x) => x.ok) : flag',
    ),
    fixes('(xs.length > 0) && (xs.some((x) => x.ok))', 'xs.some((x) => x.ok)'),
    fixes(
      'maybe!.list.length > 0 && maybe!.list.some((x) => x.ok)',
      'maybe!.list.some((x) => x.ok)',
    ),
    inClass('this.list.length > 0 && this.list.some((x) => x.ok)', 'this.list.some((x) => x.ok)'),
    declines('text.length > 0 && text.some((x) => x.ok)'),
    declines('anything.length > 0 && anything.some((x) => x.ok)'),
    declines('anything.length === 0 || anything.every((x) => x.ok)', 'every'),
    declines('maybe?.list.length > 0 && maybe?.list.some((x) => x.ok)'),
    declines('box.view.length > 0 && box.view.some((x) => x.ok)'),
    declines('xs.length > 0 && /* why */ xs.some((x) => x.ok)'),
    declines('xs.length > 0 /* why */ && xs.some((x) => x.ok)'),
    declines('xs[i++].length > 0 && xs[i++].some((x) => x.ok)'),
    declines('xs[i + 1].length > 0 && xs[i + 1].some((x) => x.ok)'),
    declines('(i, xs).length > 0 && (i, xs).some((x) => x.ok)'),
    inClass('this.view.length > 0 && this.view.some((x) => x.ok)', null),
  ],
});

const script = '/repo/src/main/features/billing/domain/totals.ts';

untyped.run('length check fix without types', rule, {
  valid: [],
  invalid: [
    {
      filename: script,
      code: 'const paid = items.length > 0 && items.some(isPaid);',
      errors: errors('some', 'false'),
      output: null,
    },
    {
      filename: '/repo/src/main/features/billing/domain/totals.mjs',
      code: 'const done = items.length === 0 || items.every(isPaid);',
      errors: errors('every', 'true'),
      output: null,
    },
  ],
});
