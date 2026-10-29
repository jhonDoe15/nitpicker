import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { compareFindings } from '../../../../../../core/diff/comparison/compare.mjs';
import { normalizeEslintResults } from '../../../../adapters/eslint/normalize.mjs';
import { strictPresetConfig } from '../../../eslint-config/strict.mjs';
import { resolveLayout } from '../../../layout.mjs';
import { nitpickerRules } from '../../index.mjs';
import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-forwarding-method-alias.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-forwarding-method-')));
writeFileSync(
  path.join(root, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      noEmit: true,
      types: [],
      lib: ['ES2022'],
    },
    include: ['src', 'generated'],
  }),
);
mkdirSync(path.join(root, 'src/gen'), { recursive: true });
mkdirSync(path.join(root, 'generated'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const parserOptions = { project: './tsconfig.json', tsconfigRootDir: root };
const tester = typescriptRuleTester(parserOptions);

function typed(code, errors) {
  const digest = createHash('sha256').update(code).digest('hex').slice(0, 12);
  const file = path.join(root, `src/case-${digest}.ts`);
  writeFileSync(file, code);
  return { filename: file, code, ...(errors === undefined ? {} : { errors }) };
}

const HEADER = [
  'type Item = { id: string };',
  'type Options = { deep: boolean };',
  'interface Totals { count(items: Item[]): number; }',
  'class Base { sum(items: Item[]): number { return items.length; } }',
  '',
].join('\n');
const SUM = '  sum(items: Item[]): number { return items.length; }';
const TOTAL = '  total(items: Item[]): number { return this.sum(items); }';

function inClass(members, heritage = '') {
  return typed(`${HEADER}export class Cart${heritage} {\n${members}\n}\n`);
}

function aliasIn(members, [name, target], heritage = '', messageId = 'forwardingMethodAlias') {
  const errors = [{ messageId, data: { name, target } }];
  return typed(`${HEADER}export class Cart${heritage} {\n${members}\n}\n`, errors);
}

const allowedMembers = [
  `${SUM}\n  "of"(items: Item[]): number { return this.sum(items); }`,
  `${SUM}\n  total(@inject() items: Item[]): number { return this.sum(items); }`,
  `${SUM}\n  async total(items: Item[]): Promise<void> { this.sum(items); }`,
  `${SUM}\n  total(items: Item[]): number { return this.sum(items); }\n  total(items: Item[], more: number): number { return this.sum(items) + more; }`,
  `${SUM}\n  total(items: Item[]): number { return this.sum(items) + 1; }`,
  `${SUM}\n  total(items: Item[], extra: Item[]): number { return this.sum(extra); }`,
  `${SUM}\n  total(items: Item[]): number { const n = this.sum(items); return n; }`,
  `${SUM}\n  total(items: Item[]): number { log(items); return this.sum(items); }`,
  `${SUM}\n  total(items: Item[]): number { return this.sum(items.slice()); }`,
  `${SUM}\n  other = new Base();\n  total(items: Item[]): number { return this.other.sum(items); }`,
  `${SUM}\n  total(items: Item[]): number { return this.sum?.(items); }`,
  `${SUM}\n  total(items: Item[]): number { return Cart.prototype.sum.call(this, items); }`,
  `${SUM}\n  total = (items: Item[]): number => this.sum(items);`,
  `${SUM}\n  total(): number { return this.sum([]); }`,
  `${SUM}\n  sumAll(items: Item[]): number { return this.sumAll(items); }`,
  `${SUM}\n  total(items: Item[] = []): number { return this.sum(items); }`,
  `${SUM}\n  total({ length }: { length: number }): number { return this.sum([]); }`,
  `${SUM}\n  total<T extends Item>(items: T[]): number { return this.sum(items); }`,
  `${SUM}\n  total(items: Item[]): number { return this.sum<Item>(items); }`,
  `${SUM}\n  async total(items: Item[]): Promise<number> { return this.sum(items); }`,
  `${SUM}\n  *total(items: Item[]): Generator<number> { yield this.sum(items); }`,
  `${SUM}\n  total(items: readonly Item[]): number { return this.sum([...items]); }`,
  `${SUM}\n  total(items: Item[]): number | undefined { return this.sum(items); }`,
  `${SUM}\n  total(items: Item[]): number;\n  total(items: Item[], more: number): number;\n  total(items: Item[]): number { return this.sum(items); }`,
  `${SUM}\n  @track\n  total(items: Item[]): number { return this.sum(items); }`,
  `${SUM}\n  /** @deprecated Use sum. */\n  total(items: Item[]): number { return this.sum(items); }`,
  `${SUM}\n  of(items: Item[]): number { return this.sum(items); }`,
  `${SUM}\n  from(items: Item[]): number { return this.sum(items); }`,
  `${SUM}\n  constructor(items: Item[]) { this.sum(items); }`,
  `${SUM}\n  get total(): number { return this.sum([]); }`,
  `${SUM}\n  total(items: Item[]): number { this.sum(items); return 1; }`,
  `${SUM}\n  total(items: Item[]): number { this.sum(items); }`,
  '  sum(items: Item[], options?: Options): number { return items.length; }\n  total(items: Item[], options: Options | undefined): number { return this.sum(items, options); }',
  '  sum(items: Item[]): number { return items.length; }\n  total(items: Item[]): string { return String(this.sum(items)); }',
  "  sum(id: string): number { return id.length; }\n  total(id: 'a' | 'b'): number { return this.sum(id); }",
  '  sum(id: string): number;\n  sum(id: string, more: string): number;\n  sum(id: string): number { return id.length; }\n  total(id: string): number { return this.sum(id); }',
  '  isItem(value: unknown): value is Item { return true; }\n  check(value: unknown): value is Item { return this.isItem(value); }',
];

const inheritedMembers = [
  [
    '  count(items: Item[]): number { return 0; }\n  sum(items: Item[]): number { return this.count(items); }',
    ' extends Base',
  ],
  [
    '  override sum(items: Item[]): number { return this.count(items); }\n  count(items: Item[]): number { return 0; }',
    ' extends Base',
  ],
  [
    '  sum(items: Item[]): number { return 0; }\n  count(items: Item[]): number { return this.sum(items); }',
    ' implements Totals',
  ],
  [
    '  sum(items: Item[]): number { return 0; }\n  other(items: Item[]): number { return this.sum(items); }',
    ' extends Missing',
  ],
  [TOTAL, ' extends Base'],
];

const mergedInterface = typed(
  `${HEADER}export class Cart {\n${SUM}\n${TOTAL}\n}\nexport interface Cart { total(items: Item[]): number; }\n`,
);

const staticMembers =
  '  static sum(items: Item[]): number { return 0; }\n  static of(items: Item[]): number { return this.sum(items); }';

const classExpression = typed(`${HEADER}export const Cart = class {\n${SUM}\n${TOTAL}\n};\n`);

tester.run('no-forwarding-method-alias', rule, {
  valid: [
    ...allowedMembers.map((members) => inClass(members)),
    ...inheritedMembers.map(([members, heritage]) => inClass(members, heritage)),
    inClass(staticMembers),
    mergedInterface,
    typed(
      `${HEADER}export abstract class Cart {\n  abstract sum(items: Item[]): number;\n${TOTAL}\n}\n`,
    ),
    classExpression,
    typed(
      `${HEADER}export const wrap = { total(items: Item[]): number { return items.length; } };\n`,
    ),
  ],
  invalid: [
    aliasIn(`${SUM}\n${TOTAL}`, ['total', 'sum']),
    aliasIn(`${TOTAL}\n${SUM}`, ['total', 'sum']),
    aliasIn(`${SUM}\n  total(items: Item[]) { return this.sum(items); }`, ['total', 'sum']),
    aliasIn(
      '  sum(items: Item[], options: Options): number { return items.length; }\n  total(items: Item[], options: Options): number { return this.sum(items, options); }',
      ['total', 'sum'],
    ),
    aliasIn(
      '  sum(...ids: string[]): number { return ids.length; }\n  total(...ids: string[]): number { return this.sum(...ids); }',
      ['total', 'sum'],
    ),
    aliasIn(
      '  sum(id: string, retry?: number): number { return 0; }\n  total(id: string, retry?: number): number { return this.sum(id, retry); }',
      ['total', 'sum'],
    ),
    aliasIn(
      '  log(message: string): void {}\n  write(message: string): void { this.log(message); }',
      ['write', 'log'],
    ),
    aliasIn(
      '  async load(id: string): Promise<number> { return id.length; }\n  async fetch(id: string): Promise<number> { return await this.load(id); }',
      ['fetch', 'load'],
    ),
    aliasIn(
      '  async load(id: string): Promise<number> { return id.length; }\n  fetch(id: string): Promise<number> { return this.load(id); }',
      ['fetch', 'load'],
    ),
    aliasIn(
      '  #sum(items: Item[]): number { return items.length; }\n  total(items: Item[]): number { return this.#sum(items); }',
      ['total', '#sum'],
      '',
      'forwardingMethodRename',
    ),
    aliasIn(
      '  private sum(items: Item[]): number { return items.length; }\n  public total(items: Item[]): number { return this.sum(items); }',
      ['total', 'sum'],
      '',
      'forwardingMethodRename',
    ),
    aliasIn(
      '  protected sum(items: Item[]): number { return items.length; }\n  total(items: Item[]): number { return this.sum(items); }',
      ['total', 'sum'],
      '',
      'forwardingMethodRename',
    ),
    aliasIn(
      '  private sum(items: Item[]): number { return items.length; }\n  private total(items: Item[]): number { return this.sum(items); }',
      ['total', 'sum'],
    ),
    aliasIn(
      '  protected sum(items: Item[]): number { return items.length; }\n  private total(items: Item[]): number { return this.sum(items); }',
      ['total', 'sum'],
    ),
    aliasIn(
      '  total(items: Item[]): number { return this.sum(items); }\n  sum(items: Item[]): number { return this.total(items); }',
      ['sum', 'total'],
    ),
    aliasIn(
      "  'sum'(items: Item[]): number { return items.length; }\n  'total'(items: Item[]): number { return this.sum(items); }",
      ['total', 'sum'],
    ),
    aliasIn(
      '  sum(items: Item[], done: (count: number) => void): void {}\n  total(items: Item[], done: (count: number) => void): void { this.sum(items, done); }',
      ['total', 'sum'],
    ),
    aliasIn(
      '  async load(id: string): Promise<void> {}\n  async fetch(id: string): Promise<void> { await this.load(id); }',
      ['fetch', 'load'],
    ),
    aliasIn(
      '  static sum(items: Item[]): number { return 0; }\n  static total(items: Item[]): number { return this.sum(items); }',
      ['total', 'sum'],
    ),
    aliasIn(
      '  size(items: Item[]): number { return items.length; }\n  total(items: Item[]): number { return this.size(items); }',
      ['total', 'size'],
      ' extends Base',
    ),
    aliasIn(
      `${SUM}\n  total(items: Item[]): number { return this.sum(items); }`,
      ['total', 'sum'],
      ' implements Totals',
    ),
  ],
});

const linter = new Linter({ cwd: root });
const LINTED_FILES = ['src/identity.ts', 'src/cart.ts', 'generated/client.ts', 'src/gen/client.ts'];

for (const file of LINTED_FILES) {
  writeFileSync(path.join(root, file), 'export {};\n');
}

function aliasMessages(code, file, config) {
  const filename = path.join(root, file);
  writeFileSync(filename, code);
  return {
    filename,
    messages: linter
      .verify(code, config, { filename })
      .filter(({ ruleId }) => ruleId === 'nitpicker/no-forwarding-method-alias'),
  };
}

const ALIAS_SOURCE = `type Item = { id: string };\nexport class Cart {\n${SUM}\n${TOTAL}\n}\n`;

describe('stable identity', () => {
  const config = [
    {
      files: ['**/*.ts'],
      languageOptions: { parser: tseslint.parser, parserOptions },
      plugins: { nitpicker: nitpickerRules },
      rules: { 'nitpicker/no-forwarding-method-alias': 'error' },
    },
  ];

  function findingsOf(code) {
    const { filename, messages } = aliasMessages(code, 'src/identity.ts', config);
    return normalizeEslintResults({
      value: [{ filePath: filename, messages }],
      projectRoot: root,
      analyzerName: 'eslint-strict',
    });
  }

  it('keeps the finding baselined when lines move or the body changes', () => {
    const base = findingsOf(ALIAS_SOURCE);
    const moved = findingsOf(`// one\n// two\n${ALIAS_SOURCE}`);
    const edited = findingsOf(
      ALIAS_SOURCE.replace('{ return this.sum(items); }', '{ return this.sum(items) }'),
    );
    const outcome = (head) => compareFindings({ baseFindings: base, headFindings: head });

    expect(base).toHaveLength(1);
    expect(base[0].symbol).toBe('Cart.total');
    expect([moved, edited].map((head) => outcome(head).newFindings)).toEqual([[], []]);
    expect(outcome(moved).unchangedFindings).toHaveLength(1);
  });

  it('reports a second alias with the same name in another class as new', () => {
    const second = `${ALIAS_SOURCE}export class Basket {\n${SUM}\n${TOTAL}\n}\n`;
    const result = compareFindings({
      baseFindings: findingsOf(ALIAS_SOURCE),
      headFindings: findingsOf(second),
    });

    expect(result.newFindings.map(({ symbol }) => symbol)).toEqual(['Basket.total']);
  });
});

describe('generated code', () => {
  const layout = resolveLayout({}, ['src/gen/**']);
  const config = strictPresetConfig(layout, parserOptions);

  it('is reported in a hand-written source file', () => {
    expect(aliasMessages(ALIAS_SOURCE, 'src/cart.ts', config).messages).toHaveLength(1);
  });

  it.each(['generated/client.ts', 'src/gen/client.ts'])(
    'is not reported in an excluded or built-in generated folder: %s',
    (file) => {
      expect(aliasMessages(ALIAS_SOURCE, file, config).messages).toEqual([]);
    },
  );
});
