import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule as noFalsyDefault } from '../../rules/signatures/no-falsy-default.mjs';
import { rule as noMutatingMethod } from '../../rules/domain/no-mutating-method-in-domain.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-code-fixes-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      noEmit: true,
      types: [],
      lib: ['ES2023'],
    },
    include: ['src'],
  }),
);
mkdirSync(path.join(root, 'src'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });

function typed(code) {
  const file = path.join(root, `src/case-${randomUUID()}.ts`);
  writeFileSync(file, code);
  return { filename: file, code };
}

const pick = (body) => `export function pick(limit?: number, other?: number) { ${body} }`;
const nullish = (name, output) => [
  {
    messageId: 'falsyDefault',
    data: { name },
    suggestions: [{ messageId: 'useNullishCoalescing', output }],
  },
];
const noSuggestion = (name) => [{ messageId: 'falsyDefault', data: { name } }];

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

const owner = (method) => [{ messageId: 'mutatingMethod', data: { owner: 'Array', method } }];

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
