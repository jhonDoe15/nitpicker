import { typedCaseProject } from '../../test-support/projects/typed-ts-project.mts';
import { rule as noFalsyDefault } from '../../rules/signatures/no-falsy-default.mjs';
import { rule as noMutatingMethod } from '../../rules/domain/no-mutating-method-in-domain.mjs';

const { tester, typed } = typedCaseProject<never[]>({
  prefix: 'nitpicker-code-fixes-',
  lib: ['ES2023'],
});

const pick = (body: string) => `export function pick(limit?: number, other?: number) { ${body} }`;
const nullish = (name: string, output: string) => [
  {
    messageId: 'falsyDefault',
    data: { name },
    suggestions: [{ messageId: 'useNullishCoalescing', output }],
  },
];
const noSuggestion = (name: string) => [{ messageId: 'falsyDefault', data: { name } }];

tester.run('no-falsy-default suggestions', noFalsyDefault, {
  valid: [],
  invalid: [
    {
      ...typed(pick('return limit || 10;')),
      errors: nullish('limit', pick('return limit ?? 10;')),
    },
    {
      ...typed(pick('return (limit) || 10;')),
      errors: nullish('limit', pick('return (limit) ?? 10;')),
    },
    {
      ...typed(pick('return limit ? limit : 10;')),
      errors: nullish('limit', pick('return limit ?? 10;')),
    },
    {
      ...typed(pick('return limit ? limit : other ?? 3;')),
      errors: noSuggestion('limit'),
    },
    {
      ...typed(pick('return limit || other || 10;')),
      errors: [...noSuggestion('limit'), ...noSuggestion('other')],
    },
    {
      ...typed(pick('return limit || (other && 3);')),
      errors: noSuggestion('limit'),
    },
    {
      ...typed(pick('return limit ? limit : (other ? 1 : 2);')),
      errors: noSuggestion('limit'),
    },
    {
      ...typed(pick('return limit ? limit /* why */ : 10;')),
      errors: noSuggestion('limit'),
    },
  ],
});

const owner = (method: string) => [
  { messageId: 'mutatingMethod', data: { owner: 'Array', method } },
];

tester.run('no-mutating-method-in-domain fixes', noMutatingMethod, {
  valid: [],
  invalid: [
    {
      ...typed("export const a = (xs: string[]) => [...xs]['sort']();"),
      errors: owner('sort'),
      output: "export const a = (xs: string[]) => [...xs]['toSorted']();",
    },
    {
      ...typed('export const a = (xs: string[]) => xs.map((x) => x + x)["reverse"]();'),
      errors: owner('reverse'),
      output: 'export const a = (xs: string[]) => xs.map((x) => x + x)["toReversed"]();',
    },
    {
      ...typed("export const a = (xs: string[]) => xs['sort']();"),
      errors: owner('sort'),
      output: null,
    },
    {
      ...typed("export const a = (xs: string[]) => { [...xs]['sort'](); };"),
      errors: owner('sort'),
      output: null,
    },
    {
      ...typed("export const a = (xs: string[]) => [...xs]['splice'](0, 1);"),
      errors: owner('splice'),
      output: null,
    },
    {
      ...typed("export const a = (xs: string[]) => [...xs]['push']('a');"),
      errors: owner('push'),
      output: null,
    },
  ],
});
