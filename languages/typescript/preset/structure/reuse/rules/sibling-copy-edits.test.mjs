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

function summing(altered = [], head = 'export function total(') {
  const line = (index) =>
    altered.includes(index)
      ? `  total -= source.other${String(index)} / 3;`
      : `  total += input.field${String(index)} * 2;`;
  return source(
    `${head}input: Record<string, number>, source: Record<string, number>): number {`,
    '  let total = 0;',
    ...Array.from({ length: 12 }, (_, index) => line(index)),
    '  return total;',
    '}',
  );
}

function listing(names, head = 'export function pick(', statements = ['  debugger;']) {
  return source(`${head}a: number) {`, ...statements, `  return [${names.join(', ')}];`, '}');
}

const NAMES = ['x0', 'x1', 'x2', 'x3', 'x4', 'x5'];

function changes(baseFiles, headFiles, options) {
  return changeFindings(baseFiles, headFiles, options).filter(({ rule }) => rule === RULE);
}

function pair(cart, checkout) {
  return { [CART]: cart, [CHECKOUT]: checkout };
}

function message(name, others, file) {
  return [
    `${name} is edited here but not in ${others}, where it has almost the same code.`,
    'Edit it there too, or merge the copies.',
    `If this is intended, add ${exceptionFor(RULE, file)}`,
    'to "exceptions" in nitpicker.config.json.',
  ].join(' ');
}

describe('sibling-copy-edit', () => {
  it('reports the edited copy, names the other copy and the exception that lifts the rule', () => {
    const base = pair(formatPrice(), formatPrice());
    const findings = changes(base, pair(formatPrice(EDITED), formatPrice()));

    expect(findings.map(({ path, symbol, location }) => [path, symbol, location])).toEqual([
      [CART, 'formatPrice', { line: 1 }],
    ]);
    expect(findings[0].identity).toBe('sibling-copy:formatPrice');
    expect(findings[0].message).toEqual(message('formatPrice', CHECKOUT, CART));
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

  it('treats a moved and edited copy as a new one when the move is not known', () => {
    const base = pair(formatPrice(), formatPrice());
    const head = { [CART]: formatPrice(), [INVOICE]: formatPrice(EDITED) };

    expect(changes(base, head)).toEqual([]);
  });
});

describe('sibling-copy-edit against the base pair', () => {
  const diverged = (altered) => pair(summing(altered), summing());

  it('reports an edit that moves a pair that was identical or alike further apart', () => {
    expect(rows(changes(diverged([]), pair(summing([0, 1]), summing())))).toEqual([
      [RULE, CART, 'sibling-copy:total'],
    ]);
    expect(rows(changes(diverged([0]), pair(summing([0, 1, 2]), summing())))).toEqual([
      [RULE, CART, 'sibling-copy:total'],
    ]);
  });

  it('reports nothing for an edit that moves the copies closer', () => {
    const toward = pair(summing([0]), summing());

    expect(changes(diverged([0, 1, 2]), toward)).toEqual([]);
    expect(changes(diverged([0, 1, 2, 3, 4, 5, 6, 7]), toward)).toEqual([]);
  });

  it('reports nothing for an edit that leaves the copies no further apart', () => {
    expect(changes(diverged([0, 1]), pair(summing([2, 3]), summing()))).toEqual([]);
  });

  it('reports nothing when the pair was less than 80% alike before and after', () => {
    const far = diverged([0, 1, 2, 3, 4, 5, 6, 7]);

    expect(changes(far, pair(summing([0, 1, 2, 3, 4, 5, 6]), summing()))).toEqual([]);
  });
});

describe('sibling-copy-edit with three copies', () => {
  const three = { [CART]: formatPrice(), [CHECKOUT]: formatPrice(), [INVOICE]: formatPrice() };

  it('lists the untouched copies of a name that exists in three modules', () => {
    const findings = changes(three, { ...three, [CART]: formatPrice(EDITED) });

    expect(rows(findings)).toEqual([[RULE, CART, 'sibling-copy:formatPrice']]);
    expect(findings[0].message).toEqual(message('formatPrice', `${CHECKOUT}, ${INVOICE}`, CART));
  });

  it('reports every edited copy while a third copy is untouched', () => {
    const head = { ...three, [CART]: formatPrice(EDITED), [CHECKOUT]: formatPrice(OTHER_EDIT) };
    const findings = changes(three, head);

    expect(findings.map(({ path, message: text }) => [path, text])).toEqual([
      [CART, message('formatPrice', INVOICE, CART)],
      [CHECKOUT, message('formatPrice', INVOICE, CHECKOUT)],
    ]);
  });

  it('reports nothing when all three copies are edited, or the only untouched one differs', () => {
    const edited = { [CART]: formatPrice(EDITED), [CHECKOUT]: formatPrice(EDITED) };

    expect(changes(three, { ...edited, [INVOICE]: formatPrice(OTHER_EDIT) })).toEqual([]);
    expect(changes(three, { ...edited, [INVOICE]: rewritten() })).toEqual([]);
  });

  it('names only the untouched copies that are alike, and drops the excepted ones', () => {
    const head = { ...three, [CART]: formatPrice(EDITED) };
    const excepting = (...paths) => ({
      config: { exceptions: [{ rule: RULE, paths, reason: 'kept on purpose' }] },
    });

    expect(changes(three, head, excepting(INVOICE))[0].message).toEqual(
      message('formatPrice', CHECKOUT, CART),
    );
    expect(changes(three, head, excepting(CHECKOUT, INVOICE))).toEqual([]);
    expect(changes(three, { ...head, [INVOICE]: rewritten() })[0].message).toEqual(
      message('formatPrice', CHECKOUT, CART),
    );
  });
});

describe('sibling-copy-edit and moved files', () => {
  const MOVED = 'src/features/shop/price.ts';

  it('counts a moved and edited copy as edited, and a moved unedited one as untouched', () => {
    const base = pair(formatPrice(), formatPrice());
    const head = { [MOVED]: formatPrice(EDITED), [CHECKOUT]: formatPrice() };
    const findings = changes(base, head, { baselinePaths: new Map([[MOVED, CART]]) });

    expect(findings.map(({ path, message: text }) => [path, text])).toEqual([
      [MOVED, message('formatPrice', CHECKOUT, MOVED)],
    ]);
  });

  it('reports the edited copy while its untouched sibling was moved', () => {
    const base = pair(formatPrice(), formatPrice());
    const head = { [CART]: formatPrice(EDITED), [MOVED]: formatPrice() };
    const findings = changes(base, head, { baselinePaths: new Map([[MOVED, CHECKOUT]]) });

    expect(findings.map(({ path, message: text }) => [path, text])).toEqual([
      [CART, message('formatPrice', MOVED, CART)],
    ]);
  });

  it('reports nothing when both copies moved and one was edited with the other', () => {
    const base = pair(formatPrice(), formatPrice());
    const head = { [MOVED]: formatPrice(EDITED), [INVOICE]: formatPrice(EDITED) };
    const baselinePaths = new Map([
      [MOVED, CART],
      [INVOICE, CHECKOUT],
    ]);

    expect(changes(base, head, { baselinePaths })).toEqual([]);
  });
});

describe('sibling-copy-edit scope', () => {
  const edit = (base, head, options) => rows(changes(base, head, options));

  it('compares definitions of 20 tokens and skips those of 19', () => {
    const edited = ['y0', ...NAMES.slice(1)];
    const compared = (build) =>
      edit(pair(build(NAMES), build(NAMES)), pair(build(edited), build(NAMES)));

    expect(compared((names) => listing(names))).toEqual([[RULE, CART, 'sibling-copy:pick']]);
    expect(compared((names) => listing(names, undefined, []))).toEqual([]);
  });

  it('compares copies that are exactly 80% alike and skips copies that are less alike', () => {
    const names = Array.from({ length: 46 }, (_, index) => `x${String(index)}`);
    const replaced = (count) => names.map((name, index) => (index < count ? `y${name}` : name));
    const base = pair(listing(names), listing(names));
    const withEdit = (count) => pair(listing(replaced(count)), listing(names));

    expect(edit(base, withEdit(20))).toEqual([[RULE, CART, 'sibling-copy:pick']]);
    expect(edit(base, withEdit(21))).toEqual([]);
  });

  it('compares arrow function constants as functions', () => {
    const arrow = (tail) =>
      source(
        'export const formatPrice = (cents: number, currency: string): string => {',
        ...formatPrice(tail).split('\n').slice(1, -2),
        '};',
      );
    const base = pair(arrow(ORIGINAL), arrow(ORIGINAL));

    expect(edit(base, pair(arrow(EDITED), arrow(ORIGINAL)))).toEqual([
      [RULE, CART, 'sibling-copy:formatPrice'],
    ]);
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
    const asFunction = formatPrice(ORIGINAL, 'Price');

    expect(edit(base, pair(klass('`${whole},00`'), klass('`${whole}.00`')))).toEqual([
      [RULE, CART, 'sibling-copy:Price'],
    ]);
    expect(
      edit(pair(klass('`${whole}.00`'), asFunction), pair(klass('`${whole},00`'), asFunction)),
    ).toEqual([]);
  });

  it('leaves types, interfaces, enums and constants alone', () => {
    const shape = (extra) =>
      `export interface Money {\n  cents: number;\n  currency: string;\n${extra}}\nexport type Cents = number;\nexport enum Unit {\n  A,\n  B,\n}\n`;
    const base = pair(shape(''), shape(''));

    expect(edit(base, pair(shape('  note: string;\n'), shape('')))).toEqual([]);
  });

  it('leaves default exports and route handlers alone, and compares named functions', () => {
    const edited = ['y0', 'y1', ...NAMES.slice(2)];
    const compared = (head) =>
      edit(
        pair(listing(NAMES, head), listing(NAMES, head)),
        pair(listing(edited, head), listing(NAMES, head)),
      );
    const entries = [
      'export default function Page(',
      'export function GET(',
      'export async function POST(',
      'export function DELETE(',
    ];

    expect(entries.map(compared)).toEqual(entries.map(() => []));
    expect(compared('export function handler(')).toEqual([[RULE, CART, 'sibling-copy:handler']]);
    expect(compared('function render(')).toEqual([[RULE, CART, 'sibling-copy:render']]);
  });

  it('leaves a function exported as default or as a route method under another name alone', () => {
    const aliased = (alias) =>
      `${listing(NAMES, 'function render(')}export { render as ${alias} };\n`;
    const edited = `${listing(['y0', 'y1', ...NAMES.slice(2)], 'function render(')}export { render as default };\n`;

    expect(
      edit(pair(aliased('default'), aliased('default')), pair(edited, aliased('default'))),
    ).toEqual([]);
    expect(
      edit(
        pair(aliased('PUT'), aliased('PUT')),
        pair(edited.replace('default', 'PUT'), aliased('PUT')),
      ),
    ).toEqual([]);
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
    const config = WORKSPACE_POLICY;

    expect(changes(base, { ...base, [ui]: formatPrice(EDITED) }, { config })).toEqual([]);
    expect(rows(changes(base, { ...base, [web]: formatPrice(EDITED) }, { config }))).toEqual([
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
    const withAll = (text) => Object.fromEntries([CART, ...skipped].map((file) => [file, text]));
    const base = withAll(formatPrice());

    expect(
      changes(base, { ...base, ...withAll(formatPrice(EDITED)), [CART]: formatPrice() }),
    ).toEqual([]);
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
      config: { exceptions: [{ rule, paths: [file], reason: 'kept on purpose' }] },
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
