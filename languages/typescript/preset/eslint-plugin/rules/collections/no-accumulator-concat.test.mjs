import { typedIoProject } from '../../test-support/typed-io-project.mjs';
import { cases, typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-accumulator-concat.mjs';

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
        { messageId: 'loopConcat', line: 3 },
        { messageId: 'concat', line: 4 },
      ],
    },
  ],
});
