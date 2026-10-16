import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';
import { layeredPrettierOptions } from '../adapters/prettier/prettier-layers.mjs';
import { usesLayeredPrettier } from '../preset/head-policy.mjs';
import { PRETTIER_CONVENTIONS, prettierConventionOptions } from './prettier-conventions.mjs';

const helper = (index) => `
export function describeOrder${String(index)}(order, customer, warehouse) {
  const lines = order.items.map((item) => formatLine(item.sku, item.quantity, item.unitPrice, customer.currency));
  const summary = { id: order.id, customer: customer.name, warehouse: warehouse.code, total: totalOf(lines) };
  const shipping = selectShippingOption(order.destination, warehouse.region, customer.membershipLevel);
  const notice = shipping.delayed ? buildNotice('delayed', order.id, shipping.expectedDate) : undefined;
  if (summary.total > customer.creditLimit) {
    reportOverLimit(order.id, customer.id, summary.total - customer.creditLimit, warehouse.code);
  }
  return [summary, shipping, notice, lines.filter((line) => line.quantity > 0).map((line) => line.text)];
}
`;
const source = `import { formatLine, totalOf } from './lines.mjs';
import { buildNotice, reportOverLimit, selectShippingOption } from "./shipping.mjs";
${Array.from({ length: 6 }, (_, index) => helper(index)).join('')}`;

const formatted = (options) =>
  prettier.format(source, {
    parser: 'babel',
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 100,
    ...options,
  });

describe('Prettier conventions', () => {
  for (const convention of PRETTIER_CONVENTIONS) {
    for (const option of convention.options) {
      it(`reads ${convention.id} = ${option} from code Prettier formatted that way`, async () => {
        const text = await formatted(prettierConventionOptions({ [convention.id]: option }));

        expect(convention.measure(text)).toBe(option);
      });
    }
  }

  it('maps the chosen conventions to Prettier options', () => {
    expect(
      prettierConventionOptions({
        'prettier.quotes': 'double',
        'prettier.semicolons': 'never',
        'prettier.indentation': 'tab',
        'prettier.printWidth': '120',
        'prettier.trailingCommas': 'es5',
        'prettier.arrowParens': 'avoid',
        'prettier.bracketSpacing': 'tight',
        'prettier.endOfLine': 'crlf',
      }),
    ).toEqual({
      singleQuote: false,
      semi: false,
      useTabs: true,
      printWidth: 120,
      trailingComma: 'es5',
      arrowParens: 'avoid',
      bracketSpacing: false,
      endOfLine: 'crlf',
    });
    expect(prettierConventionOptions({ 'prettier.indentation': '4' })).toEqual({
      useTabs: false,
      tabWidth: 4,
    });
  });

  it('reads an annotated return type as no evidence about arrow parameters', () => {
    const arrowParens = PRETTIER_CONVENTIONS.find(({ id }) => id === 'prettier.arrowParens');

    expect(
      arrowParens.measure(
        'const a = (a: A): Result => a;\nconst b = (): void => b;\nf((item) => item);\n',
      ),
    ).toBe('always');
  });

  it('formats code files with the project conventions on top of the nitpicker policy', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-prettier-policy-'));
    const policyFile = path.join(directory, 'policy.json');
    writeFileSync(policyFile, JSON.stringify({ conventions: { 'prettier.quotes': 'double' } }));
    const previous = process.env.NITPICKER_POLICY;
    process.env.NITPICKER_POLICY = policyFile;
    try {
      function optionsFor(relativePath) {
        return layeredPrettierOptions(prettier, {
          precedence: ['nitpicker'],
          policyOptions: { singleQuote: true, printWidth: 100 },
          liveProjectRoot: directory,
          relativePath,
        });
      }
      expect(usesLayeredPrettier()).toBe(true);
      expect(await optionsFor('a.ts')).toEqual({ singleQuote: false, printWidth: 100 });
      expect(await optionsFor('package.json')).toEqual({ singleQuote: true, printWidth: 100 });
    } finally {
      if (previous === undefined) {
        delete process.env.NITPICKER_POLICY;
      } else {
        process.env.NITPICKER_POLICY = previous;
      }
      rmSync(directory, { recursive: true, force: true });
    }
    expect(usesLayeredPrettier({})).toBe(false);
  });
});
