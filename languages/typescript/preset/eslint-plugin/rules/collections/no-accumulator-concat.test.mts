import { typedIoProject } from '../../test-support/projects/typed-io-project.mts';
import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mts';
import { rule } from './no-accumulator-concat.mts';

const ruleTester = typescriptRuleTester();

ruleTester.run('no-accumulator-concat', rule, {
  valid: cases([
    'items.reduce((sum, item) => sum + item.price, 0);',
    'items.reduce(combine, []);',
    'items.map((acc) => acc.concat(1));',
    'const all = left.concat(right);',
    'let all = []; all = all.concat(first);',
    'let all = []; for (const item of items) { all = other.concat(item); }',
    'let all = []; for (const item of items) { all = [...all, item]; }',
    'for (const item of items) { let row = []; row = row.concat(item); use(row); }',
    'let all = []; function add(item) { all = all.concat(item); } for (const item of items) { add(item); }',
    "let text = ''; for (const part of parts) { text = text.concat(part); }",
    "items.reduce((text, item) => text.concat(item.name), '');",
    'let all = []; for (const item of items) { all += all.concat(item); }',
  ]),
  invalid: [
    ...[
      'items.reduce((acc, item) => acc.concat([item.id]), []);',
      'items.reduceRight(function (all, item) { return all.concat(item.tags); }, []);',
    ].map((code) => ({ code, errors: [{ messageId: 'concat' }] })),
    ...[
      'let all = []; for (const item of items) { all = all.concat(item.tags); }',
      'let all = []; items.forEach((item) => { all = all.concat(item); });',
      'let all = []; let i = 0; while (i < items.length) { all = all.concat(items[i]); i += 1; }',
    ].map((code) => ({ code, errors: [{ messageId: 'loopConcat', data: { name: 'all' } }] })),
  ],
});

const { tester, typed } = typedIoProject('accumulator-concat', 'export const none = 0;');

tester.run('no-accumulator-concat with types', rule, {
  valid: [
    [
      'export function text(parts: string[]) {',
      "  let joined = '';",
      '  for (const part of parts) { joined = joined.concat(part); }',
      "  return parts.reduce((all, part) => all.concat(part), '') + joined;",
      '}',
    ].join('\n'),
  ].map((code) => typed(code)),
  invalid: [
    {
      ...typed(
        [
          'export function lists(groups: number[][]) {',
          '  let all: number[] = [];',
          '  for (const group of groups) { all = all.concat(group); }',
          '  return groups.reduce((acc: number[], group) => acc.concat(group), all);',
          '}',
        ].join('\n'),
      ),
      errors: [
        {
          messageId: 'loopConcat',
          line: 3,
          suggestions: [
            {
              messageId: 'pushOntoArray',
              output: [
                'export function lists(groups: number[][]) {',
                '  const all: number[] = [];',
                '  for (const group of groups) { for (const item of group) all.push(item); }',
                '  return groups.reduce((acc: number[], group) => acc.concat(group), all);',
                '}',
              ].join('\n'),
            },
          ],
        },
        { messageId: 'concat', line: 4 },
      ],
    },
  ],
});

const strings = typedIoProject('accumulator-concat-strings', 'export const none = 0;');

strings.tester.run('no-accumulator-concat leaves strings and non-array unions alone', rule, {
  valid: [
    "export function a(parts: string[]) { let text = ''; for (const part of parts) { text = text.concat(part); } return text; }",
    "export function b(parts: string[]) { let text: string = ''; for (const part of parts) { text = text.concat(part); } return text; }",
    'export function c(parts: string[], text: string | string[]) { for (const part of parts) { text = text.concat(part); } return text; }',
    "export function d(parts: string[]) { let text: string | string[] = ''; for (const part of parts) { text = text.concat(part); } return text; }",
    'export function e(parts: string[][]) { let all: string[] | string = []; for (const part of parts) { all = all.concat(part); } return all; }',
    'export function f(parts: Uint8Array[]) { let bytes = new Uint8Array(0); for (const part of parts) { bytes = bytes.concat(part); } return bytes; }',
    'export function g(parts: string[], seed: any) { let all: any = seed; for (const part of parts) { all = all.concat(part); } return all; }',
    'export function h(parts: string[], seed: unknown) { let all = seed as string; for (const part of parts) { all = all.concat(part); } return all; }',
    "export function i(parts: string[]) { return parts.reduce((text, part) => text.concat(part), ''); }",
    'export function j(parts: string[], seed: string | string[]) { return parts.reduce((text, part) => text.concat(part), seed); }',
  ].map((code) => strings.typed(code)),
  invalid: [
    {
      ...strings.typed(
        'export function a(parts: string[][], make: () => string[]) { let all = make(); for (const part of parts) { all = all.concat(part); } return all; }',
      ),
      errors: [{ messageId: 'loopConcat' }],
    },
  ],
});

ruleTester.run('no-accumulator-concat without types only trusts an array literal seed', rule, {
  valid: cases([
    "let text = ''; for (const part of parts) { text = text.concat(part); }",
    'let all = existing; for (const part of parts) { all = all.concat(part); }',
    'let all = make(); for (const part of parts) { all = all.concat(part); }',
    "let all = flag ? [] : ''; for (const part of parts) { all = all.concat(part); }",
    'let all = new Array(); for (const part of parts) { all = all.concat(part); }',
    'function f(all) { for (const part of parts) { all = all.concat(part); } return all; }',
    "parts.reduce((text, part) => text.concat(part), '')",
    'parts.reduce((all, part) => all.concat(part), existing)',
  ]),
  invalid: [],
});
