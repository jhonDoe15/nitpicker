import { describe, expect, it } from 'vitest';
import {
  changeFindings,
  exceptionFor,
  projectChangeFindings,
  rows,
  ruleFindings,
  source,
  usesValues,
  WORKSPACE_POLICY,
  workspaceFiles,
} from '../../test-support/reuse-project.mjs';

const CART = 'src/features/cart/price.ts';
const CHECKOUT = 'src/features/checkout/price.ts';
const INVOICE = 'src/features/invoice/price.ts';
const RULE = 'sibling-copy-edit';
const ORIGINAL = 'return `${sign}${symbol}${whole}.${fraction}`;';
const EDITED = 'return `${sign}${symbol}${whole},${fraction}`;';
const OTHER_EDIT = 'return `${sign}${whole}.${fraction}${symbol}`;';

function formatPrice(tail = ORIGINAL, name = 'formatPrice') {
  return source(
    `export function ${name}(cents: number, currency: string): string {`,
    '  const symbol = currency === "USD" ? "$" : "EUR";',
    '  const whole = Math.floor(Math.abs(cents) / 100);',
    '  const fraction = String(Math.abs(cents) % 100).padStart(2, "0");',
    '  const sign = cents < 0 ? "-" : "";',
    `  ${tail}`,
    '}',
  );
}

function rewritten() {
  return source(
    'export function formatPrice(cents: number): string {',
    '  const options = { style: "currency", currency: "USD" };',
    '  return new Intl.NumberFormat("en", options).format(cents / 100);',
    '}',
  );
}

function changes(baseFiles, headFiles, config) {
  return changeFindings(baseFiles, headFiles, config).filter(({ rule }) => rule === RULE);
}

function pair(cart, checkout) {
  return { [CART]: cart, [CHECKOUT]: checkout };
}

describe('sibling-copy-edit', () => {
  it('reports the edited copy, names the other copy and the exception that lifts the rule', () => {
    const base = pair(formatPrice(), formatPrice());
    const findings = changes(base, pair(formatPrice(EDITED), formatPrice()));

    expect(findings.map(({ path, symbol, location }) => [path, symbol, location])).toEqual([
      [CART, 'formatPrice', { line: 1 }],
    ]);
    expect(findings[0].identity).toBe('sibling-copy:formatPrice');
    expect(findings[0].message).toBe(
      [
        `formatPrice is edited here but not in ${CHECKOUT}, where it has almost the same code.`,
        'Edit it there too, or merge the copies.',
        `If this is intended, add ${exceptionFor(RULE, CART)}`,
        'to "exceptions" in nitpicker.config.json.',
      ].join(' '),
    );
  });

  it('reports the copy that was edited, whichever it is', () => {
    const base = pair(formatPrice(), formatPrice());

    expect(rows(changes(base, pair(formatPrice(), formatPrice(EDITED))))).toEqual([
      [RULE, CHECKOUT, 'sibling-copy:formatPrice'],
    ]);
  });

  it('reports nothing when neither copy is edited, even for a pair that already differs', () => {
    const diverged = pair(formatPrice(), formatPrice(EDITED));
    const unrelated = { 'src/other.ts': 'export const LIMIT = 5;\n' };

    expect(changes(diverged, diverged)).toEqual([]);
    expect(changes(diverged, { ...diverged, ...unrelated })).toEqual([]);
  });

  it('reports nothing when both copies are edited, the same way or differently', () => {
    const base = pair(formatPrice(), formatPrice());

    expect(changes(base, pair(formatPrice(EDITED), formatPrice(EDITED)))).toEqual([]);
    expect(changes(base, pair(formatPrice(EDITED), formatPrice(OTHER_EDIT)))).toEqual([]);
  });

  it('reports nothing when the edit leaves the copies less than 80% alike', () => {
    const base = pair(formatPrice(), formatPrice());

    expect(changes(base, pair(rewritten(), formatPrice()))).toEqual([]);
  });

  it('reports nothing when the edit makes the copies identical', () => {
    const base = pair(formatPrice(EDITED), formatPrice());

    expect(changes(base, pair(formatPrice(), formatPrice()))).toEqual([]);
  });

  it('ignores an edit of whitespace, comments, quotes and semicolons', () => {
    const base = pair(formatPrice(), formatPrice());
    const reformatted = formatPrice(ORIGINAL).replace('"USD"', "'USD'").replace('{\n', '{ // x\n');

    expect(changes(base, pair(reformatted, formatPrice()))).toEqual([]);
  });

  it('leaves a new near-copy to duplicate-definition', () => {
    const base = { [CART]: formatPrice() };

    expect(changes(base, pair(formatPrice(), formatPrice(EDITED)))).toEqual([]);
    expect(changes(base, pair(formatPrice(EDITED), formatPrice()))).toEqual([]);
    expect(changes(base, pair(formatPrice(), formatPrice()))).toEqual([]);
  });

  it('does not report twice what duplicate-definition reports for a new identical copy', () => {
    const small = 'export function twice(amount: number) {\n  return amount * 2;\n}\n';
    const used = `${small}${usesValues('twice')}`;
    const findings = changeFindings({ 'src/a.ts': used }, { 'src/a.ts': used, 'src/b.ts': used });

    expect(findings.map(({ rule }) => rule)).toEqual([
      'duplicate-definition',
      'duplicate-definition',
    ]);
  });

  it('treats a moved and edited copy as a new one', () => {
    const base = pair(formatPrice(), formatPrice());
    const head = { [CART]: formatPrice(), [INVOICE]: formatPrice(EDITED) };

    expect(changes(base, head)).toEqual([]);
  });

  it('lists the untouched copies of a name that exists in three modules', () => {
    const base = { [CART]: formatPrice(), [CHECKOUT]: formatPrice(), [INVOICE]: formatPrice() };
    const findings = changes(base, { ...base, [CART]: formatPrice(EDITED) });

    expect(rows(findings)).toEqual([[RULE, CART, 'sibling-copy:formatPrice']]);
    expect(findings[0].message).toMatch(new RegExp(`not in ${CHECKOUT}, ${INVOICE}, where`, 'u'));
  });

  it('reports every edited copy while a third copy is untouched', () => {
    const base = { [CART]: formatPrice(), [CHECKOUT]: formatPrice(), [INVOICE]: formatPrice() };
    const head = { ...base, [CART]: formatPrice(EDITED), [CHECKOUT]: formatPrice(OTHER_EDIT) };
    const findings = changes(base, head);

    expect(rows(findings).map(([, file]) => file)).toEqual([CART, CHECKOUT]);
    expect(findings.map(({ message }) => message.split(', where')[0])).toEqual([
      `formatPrice is edited here but not in ${INVOICE}`,
      `formatPrice is edited here but not in ${INVOICE}`,
    ]);
  });

  it('reports nothing when all three copies are edited, or the only untouched one differs', () => {
    const base = { [CART]: formatPrice(), [CHECKOUT]: formatPrice(), [INVOICE]: formatPrice() };
    const edited = { [CART]: formatPrice(EDITED), [CHECKOUT]: formatPrice(EDITED) };

    expect(changes(base, { ...edited, [INVOICE]: formatPrice(OTHER_EDIT) })).toEqual([]);
    expect(changes(base, { ...edited, [INVOICE]: rewritten() })).toEqual([]);
  });

  it('skips definitions too small for a one-token edit to leave them near-identical', () => {
    const small = (value) => `export function get(a: number) {\n  return a + ${value};\n}\n`;
    const base = pair(small(1), small(1));

    expect(changes(base, pair(small(2), small(1)))).toEqual([]);
  });

  it('compares functions and classes of one name and one kind', () => {
    const klass = (tail) =>
      source(
        'export class Price {',
        '  constructor(readonly cents: number, readonly currency: string) {}',
        '  format(): string {',
        '    const whole = Math.floor(this.cents / 100);',
        `    return ${tail};`,
        '  }',
        '}',
      );
    const base = pair(klass('`${whole}.00`'), klass('`${whole}.00`'));

    expect(rows(changes(base, pair(klass('`${whole},00`'), klass('`${whole}.00`'))))).toEqual([
      [RULE, CART, 'sibling-copy:Price'],
    ]);
  });

  it('leaves types, interfaces and constants alone', () => {
    const shape = (extra) =>
      `export interface Money {\n  cents: number;\n  currency: string;\n${extra}}\nexport type Cents = number;\n`;
    const base = pair(shape(''), shape(''));

    expect(changes(base, pair(shape('  note: string;\n'), shape('')))).toEqual([]);
  });

  it('compares within one package of a monorepo and not across packages', () => {
    const ui = 'packages/ui/src/price.ts';
    const web = 'packages/web/src/price.ts';
    const webAgain = 'packages/web/src/cart/price.ts';
    const base = workspaceFiles({
      [ui]: formatPrice(),
      [web]: formatPrice(),
      [webAgain]: formatPrice(),
    });
    const head = { ...base, [ui]: formatPrice(EDITED) };

    expect(changes(base, head, WORKSPACE_POLICY)).toEqual([]);
    expect(rows(changes(base, { ...base, [web]: formatPrice(EDITED) }, WORKSPACE_POLICY))).toEqual([
      [RULE, web, 'sibling-copy:formatPrice'],
    ]);
  });

  it('skips tests, stories, mocks, fixtures and declaration files, as duplicate-definition does', () => {
    const skipped = [
      'src/features/cart/price.test.ts',
      'src/features/cart/price.stories.ts',
      'src/features/cart/price.story.tsx',
      'src/features/__tests__/price.ts',
      'src/features/__mocks__/price.ts',
      'src/features/__fixtures__/price.ts',
      'src/features/fixtures/price.ts',
      'src/features/stories/price.ts',
      'test/price.ts',
    ];
    const base = Object.fromEntries([CART, ...skipped].map((file) => [file, formatPrice()]));
    const editedAll = Object.fromEntries(
      [CART, ...skipped].map((file) => [file, formatPrice(EDITED)]),
    );

    expect(changes(base, { ...base, ...editedAll, [CART]: formatPrice() })).toEqual([]);
    expect(changes(base, { ...base, [CART]: formatPrice(EDITED) })).toEqual([]);
  });

  it('reports nothing without a base to compare with', () => {
    const files = pair(formatPrice(EDITED), formatPrice());

    expect(ruleFindings(RULE)(files)).toEqual([]);
  });

  it('is lifted by an exception for the edited copy or for the untouched one', () => {
    const base = pair(formatPrice(), formatPrice());
    const head = pair(formatPrice(EDITED), formatPrice());
    const excepting = (file, rule = RULE) => ({
      exceptions: [{ rule, paths: [file], reason: 'kept on purpose' }],
    });

    expect(changes(base, head, excepting(CART))).toEqual([]);
    expect(changes(base, head, excepting(CHECKOUT))).toEqual([]);
    expect(changes(base, head, excepting('src/features/**'))).toEqual([]);
    expect(changes(base, head, excepting(CART, 'duplicate-definition'))).toHaveLength(1);
  });
});

describe('sibling-copy-edit in the structure check', () => {
  const base = pair(formatPrice(), formatPrice());
  const head = pair(formatPrice(EDITED), formatPrice());
  const siblingRows = (snapshot) =>
    rows(projectChangeFindings(base, head, snapshot).filter(({ rule }) => rule === RULE));

  it('reports an edit of one copy in the head snapshot', () => {
    expect(siblingRows('head')).toEqual([[RULE, CART, 'sibling-copy:formatPrice']]);
  });

  it('reports nothing in the base snapshot, so only the head side holds the finding', () => {
    expect(siblingRows('base')).toEqual([]);
  });
});
