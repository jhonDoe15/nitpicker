import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { run } from '../execution/python-process.mjs';
import { createToolContext } from '../python-tools.mjs';
import { pythonE2eEnabled } from '../e2e/test-support/python-e2e-support.mjs';
import { collectFacts, FACTS_REPORT } from './python-facts.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function factsOf(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-facts-')));
  const reportRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-facts-report-')));
  roots.push(root, reportRoot);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  const context = createToolContext({
    projectRoot: root,
    liveRoot: root,
    settings: { environment: 'path', sourceRoots: ['src'] },
    reportRoot,
  });
  const report = collectFacts(context, run);
  expect(JSON.parse(readFileSync(path.join(reportRoot, FACTS_REPORT), 'utf8'))).toEqual(report);
  return report;
}

const PRICING = `"""Prices."""
from decimal import Decimal as D
import shop.money as money

RATE = 2
_CACHE: dict[str, int] = {}
Cents = int


def total(amount: int, *, rate: int = RATE,) -> D:
    """Sum it."""
    return D(amount) * rate  # trailing note


class Cart:
    pass
`;

const SCRIPTS =
  '[project]\nname = "shop"\n[project.scripts]\nshop = "shop.cli:main"\n' +
  '[build-system]\nbuild-backend = "hatchling.build"\n';

const DOCUMENTED = [
  'class Cart:',
  '    """A cart.',
  '',
  '    Holds items.',
  '    """',
  '',
  '    def add(self):',
  '        """Add one.',
  '',
  '        Args:',
  '            item: the item.',
  '        """',
  '',
].join('\n');

function statement(from, to, names, line, extra = {}) {
  return { from, to, names, reexport: false, role: 'production', line, ...extra };
}

describe.skipIf(!pythonE2eEnabled)('the facts scan', () => {
  it('lists production modules and test files with their role and entry flag', () => {
    const report = factsOf({
      'pyproject.toml': SCRIPTS,
      'src/shop/__init__.py': '',
      'src/shop/__main__.py': '',
      'src/shop/cli.py': 'def main():\n    pass\n',
      'src/shop/pricing.py': 'X = 1\n',
      'src/shop/tool.py': 'if __name__ == "__main__":\n    pass\n',
      'src/shop/test_inline.py': 'def test_x():\n    pass\n',
      'tests/conftest.py': '',
      'tests/unit/test_pricing.py': 'from shop.pricing import X\n',
    });

    expect(
      report.modules.map(({ file, role, entry, module }) => [file, role, entry, module]),
    ).toEqual([
      ['src/shop/__init__.py', 'production', false, 'shop'],
      ['src/shop/__main__.py', 'production', true, 'shop.__main__'],
      ['src/shop/cli.py', 'production', true, 'shop.cli'],
      ['src/shop/pricing.py', 'production', false, 'shop.pricing'],
      ['src/shop/test_inline.py', 'test', false, undefined],
      ['src/shop/tool.py', 'production', true, 'shop.tool'],
      ['tests/conftest.py', 'test', false, undefined],
      ['tests/unit/test_pricing.py', 'test', false, undefined],
    ]);
    expect(report.packages).toEqual([{ root: '', published: true }]);
    expect(report.definitions.find(({ name }) => name === 'main').entry).toBe(true);
  });

  it('resolves each import statement to the project files it names', () => {
    const { imports } = factsOf({
      'src/shop/__init__.py': 'from .pricing import total as price\nfrom . import _private\n',
      'src/shop/_private.py': '',
      'src/shop/money/__init__.py': '',
      'src/shop/money/coin.py': 'class Coin:\n    pass\n',
      'src/shop/pricing.py': [
        'from decimal import Decimal as D',
        'import shop.money.coin',
        'from shop.money import coin as c',
        'from .money.coin import Coin',
        '',
        '',
        'def total():',
        '    pass',
        '',
      ].join('\n'),
      'tests/test_pricing.py': 'from shop import price\nfrom shop.pricing import *\n',
    });
    const init = 'src/shop/__init__.py';
    const pricing = 'src/shop/pricing.py';
    const coin = 'src/shop/money/coin.py';
    const test = { role: 'test' };

    expect(
      imports.map(({ from, to, names, reexport, role, line }) => ({
        from,
        to,
        names,
        reexport,
        role,
        line,
      })),
    ).toEqual([
      statement(init, pricing, [{ name: 'total', alias: 'price' }], 1, { reexport: true }),
      statement(init, 'src/shop/_private.py', [{ name: '*', alias: '_private' }], 2),
      statement(pricing, init, [], 2),
      statement(pricing, 'src/shop/money/__init__.py', [], 2),
      statement(pricing, coin, [{ name: '*' }], 2),
      statement(pricing, coin, [{ name: '*', alias: 'c' }], 3),
      statement(pricing, coin, [{ name: 'Coin' }], 4),
      statement('tests/test_pricing.py', init, [{ name: 'price' }], 1, test),
      statement('tests/test_pricing.py', pricing, [{ name: '*' }], 2, test),
    ]);
  });

  it('records module-level definitions with normalized tokens and text', () => {
    const { definitions } = factsOf({ 'src/shop/pricing.py': PRICING });
    const total = definitions.find(({ name }) => name === 'total');

    expect(
      definitions.map(({ name, kind, line, lines, exported, literal, usedLocally }) => [
        name,
        kind,
        line,
        lines,
        exported,
        literal,
        usedLocally,
      ]),
    ).toEqual([
      ['RATE', 'const', 5, 1, true, true, true],
      ['_CACHE', 'const', 6, 1, false, true, false],
      ['Cents', 'const', 7, 1, true, false, false],
      ['total', 'function', 10, 3, true, false, false],
      ['Cart', 'class', 15, 2, true, false, false],
    ]);
    expect(total.tokens.join(' ')).toBe(
      'def total ( amount : int , * , rate : int = RATE ) -> D : return D ( amount ) * rate',
    );
    expect(total.text).toBe(`function|${total.tokens.join(' ')}`);
    expect(total.entry).toBe(false);
  });

  it('gives two copies the same key only when their free names resolve alike', () => {
    const copy = 'def total(amount):\n    return helper(amount)\n';
    const { definitions } = factsOf({
      'src/shop/a.py': `from shop.money import helper\n\n\n${copy}`,
      'src/shop/b.py': `from .money import helper\n\n\n${copy}`,
      'src/shop/c.py': `def helper(amount):\n    return amount\n\n\n${copy}`,
      'src/shop/money.py': 'def helper(amount):\n    return amount\n',
    });
    const keys = Object.fromEntries(
      definitions.filter(({ name }) => name === 'total').map(({ file, key }) => [file, key]),
    );

    expect(keys['src/shop/a.py']).toBe(keys['src/shop/b.py']);
    expect(keys['src/shop/c.py']).not.toBe(keys['src/shop/a.py']);
  });

  it('spells strings by value and reads type aliases, decorators and qualified uses', () => {
    const report = factsOf({
      'src/shop/a.py': [
        'import shop.money as money',
        'from typing import TypeAlias',
        'A = "x"',
        "B = 'x'",
        'C: TypeAlias = int',
        '',
        '',
        '@money.cached',
        'async def d():',
        '    return money.Coin',
        '',
      ].join('\n'),
    });

    expect(report.definitions.map(({ name, kind, text }) => [name, kind, text])).toEqual([
      ['A', 'const', "const|A = str:'x'"],
      ['B', 'const', "const|B = str:'x'"],
      ['C', 'type', 'type|C : TypeAlias = int'],
      ['d', 'function', 'function:async|@ money . cached async def d ( ) : return money . Coin'],
    ]);
    expect(report.modules[0].qualifiedUses).toEqual(['money.Coin', 'money.cached']);
  });

  it('records the description lines of every docstring', () => {
    expect(factsOf({ 'src/shop/a.py': DOCUMENTED }).docComments).toEqual([
      {
        file: 'src/shop/a.py',
        line: 2,
        name: 'Cart',
        qualifiedName: 'Cart',
        lines: ['A cart.', 'Holds items.'],
      },
      {
        file: 'src/shop/a.py',
        line: 8,
        name: 'add',
        qualifiedName: 'Cart.add',
        lines: ['Add one.'],
      },
    ]);
  });

  it('leaves out a file that does not parse', () => {
    expect(factsOf({ 'src/shop/bad.py': 'def (:\n' }).modules).toEqual([]);
  });
});
