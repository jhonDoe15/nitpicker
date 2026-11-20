import { describe, expect, it } from 'vitest';
import { ts } from '../../../typescript-api/typescript-api.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { firstOf } from '../test-support/finding-comparison.mts';
import { collapseAnyChains as collapse } from './any-chain.mts';

const SOURCE = [
  'export function price(items: any[]) {',
  '  return items.map((i) => i.price + i.tax)[0].fee;',
  '}',
  'export function other(value: any) {',
  '  return value.name;',
  '}',
  'const top = (globalThing as any).x;',
  'export function pair(a: any, b: any) {',
  '  return a.x + b.y + a.z;',
  '}',
  '',
].join('\n');
const sourceFile = ts.createSourceFile('a.ts', SOURCE, ts.ScriptTarget.Latest, true);

type Collapsed = {
  readonly ruleId: unknown;
  readonly message: unknown;
  readonly messageId: unknown;
  readonly chainUses: unknown;
  readonly line: unknown;
  readonly column: unknown;
};

function project(item: unknown): Collapsed {
  return {
    ruleId: fieldOf(item, 'ruleId'),
    message: fieldOf(item, 'message'),
    messageId: fieldOf(item, 'messageId'),
    chainUses: fieldOf(item, 'chainUses'),
    line: fieldOf(item, 'line'),
    column: fieldOf(item, 'column'),
  };
}

function collapseAnyChains(messages: readonly unknown[], file: typeof sourceFile): Collapsed[] {
  return collapse(messages, file).map(project);
}

function lineAt(index: number): string {
  return SOURCE.split('\n')[index] ?? '';
}

function report(
  ruleId: string,
  text: string,
  line: number,
  needle: string,
  extra: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  const column = lineAt(line - 1).indexOf(needle) + 1;
  return {
    ruleId,
    message: text,
    line,
    column,
    endLine: line,
    endColumn: column + needle.length,
    ...extra,
  };
}

const member = (needle: string, line = 2): Readonly<Record<string, unknown>> =>
  report(
    '@typescript-eslint/no-unsafe-member-access',
    `Unsafe member access .${needle.split('.').at(-1) ?? ''} on an \`any\` value.`,
    line,
    needle,
    { messageId: 'unsafeMemberExpression' },
  );
const plus = (needle: string): Readonly<Record<string, unknown>> =>
  report(
    '@typescript-eslint/restrict-plus-operands',
    "Invalid operand of type 'any' for a '+' operation.",
    2,
    needle,
  );
const returned = report(
  '@typescript-eslint/no-unsafe-return',
  'Unsafe return of a value of type `any`.',
  2,
  'items.map((i) => i.price + i.tax)[0].fee',
  { messageId: 'unsafeReturn' },
);

describe('collapseAnyChains', () => {
  it('reports one finding per function for every use that follows from an any value', () => {
    const messages = [
      member('i.price'),
      plus('i.price'),
      member('i.tax'),
      returned,
      member('[0].fee'),
    ];
    const collapsed = collapseAnyChains(messages, sourceFile);
    const only = firstOf(collapsed);

    expect(collapsed.slice(1)).toEqual([]);
    expect(only.ruleId).toBe('@typescript-eslint/no-unsafe-member-access');
    expect(only.messageId).toBe('anyChain:items');
    expect(only.chainUses).toBe(5);
    expect(only.line).toBe(1);
    expect(only.column).toBe(lineAt(0).indexOf('items') + 1);
    expect(only.message).toBe(
      'Unsafe use of the `any` value `items` in price: it affects 5 places.',
    );
  });

  it('names the first report of the most specific rule, in any order', () => {
    const only = firstOf(
      collapseAnyChains([returned, plus('i.price'), member('i.tax')], sourceFile),
    );

    expect(only.ruleId).toBe('@typescript-eslint/no-unsafe-member-access');
    expect(only.message).toBe(
      'Unsafe use of the `any` value `items` in price: it affects 3 places.',
    );
    expect(only.chainUses).toBe(3);
  });

  it('keeps one finding for a single use, with the same identity as a larger chain', () => {
    const only = firstOf(collapseAnyChains([member('value.name', 5)], sourceFile));

    expect(only.messageId).toBe('anyChain:value');
    expect(only.chainUses).toBe(1);
    expect(only.message).toBe(
      'Unsafe use of the `any` value `value` in other: it affects 1 place.',
    );
  });

  it('keeps a separate finding for each function', () => {
    const result = collapseAnyChains([member('i.price'), member('value.name', 5)], sourceFile);

    expect(result.map(({ line }) => line)).toEqual([1, 4]);
  });

  it('gives each any parameter its own finding, anchored on the parameter', () => {
    const result = collapseAnyChains(
      [member('a.x', 9), member('b.y', 9), member('a.z', 9)],
      sourceFile,
    );

    expect(result.map(({ messageId, chainUses }) => [messageId, chainUses])).toEqual([
      ['anyChain:a', 2],
      ['anyChain:b', 1],
    ]);
    expect(result.map(({ column }) => column)).toEqual([
      lineAt(7).indexOf('a:') + 1,
      lineAt(7).indexOf('b:') + 1,
    ]);
  });

  it('keeps the rule of the cause whatever the members of the chain are', () => {
    const onlyReturn = firstOf(collapseAnyChains([returned], sourceFile));
    const withMember = firstOf(collapseAnyChains([returned, member('i.tax')], sourceFile));

    expect(onlyReturn.ruleId).toBe(withMember.ruleId);
  });

  it('does not merge reports about other types that contain any', () => {
    const generic = report(
      '@typescript-eslint/no-unsafe-argument',
      'Unsafe argument of type `Map<string, any>` assigned to a parameter of type `string`.',
      2,
      'i.price',
    );
    const array = report(
      '@typescript-eslint/no-unsafe-argument',
      'Unsafe argument of type `any[]` assigned to a parameter of type `string`.',
      2,
      'i.tax',
    );
    const messages = [generic, array];

    expect(collapseAnyChains(messages, sourceFile)).toEqual(messages.map(project));
  });

  it('leaves reports outside functions and reports of other kinds alone', () => {
    const topLevel = report(
      '@typescript-eslint/no-unsafe-member-access',
      'Unsafe member access .x on an `any` value.',
      7,
      '.x',
    );
    const unresolved = report(
      '@typescript-eslint/no-unsafe-member-access',
      'Unsafe member access .x on an `error` typed value.',
      2,
      'i.price',
    );
    const unrelated = report('eqeqeq', 'Expected === and instead saw ==.', 2, '+');
    const messages = [topLevel, unresolved, unrelated, null, 'text'];

    expect(collapseAnyChains(messages, sourceFile)).toEqual(messages.map(project));
  });
});
