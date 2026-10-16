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

describe.skipIf(!pythonE2eEnabled)('the facts scan', () => {
  it('lists production modules and test files, flagging the tests', () => {
    const report = factsOf({
      'src/shop/__init__.py': '',
      'src/shop/pricing.py': 'X = 1\n',
      'src/shop/test_inline.py': 'def test_x():\n    pass\n',
      'tests/conftest.py': '',
      'tests/unit/test_pricing.py': 'from shop.pricing import X\n',
    });

    expect(report.modules.map(({ module }) => module)).toEqual(['shop', 'shop.pricing']);
    expect(Object.entries(report.files).map(([file, { test }]) => [file, test])).toEqual([
      ['src/shop/__init__.py', false],
      ['src/shop/pricing.py', false],
      ['src/shop/test_inline.py', true],
      ['tests/conftest.py', true],
      ['tests/unit/test_pricing.py', true],
    ]);
  });

  it('records each import with its line and aliases', () => {
    const { imports } = factsOf({ 'src/shop/pricing.py': PRICING }).files['src/shop/pricing.py'];

    expect(imports).toEqual([
      {
        level: 0,
        module: 'decimal',
        names: ['Decimal'],
        typeOnly: false,
        line: 2,
        aliases: [{ name: 'Decimal', alias: 'D' }],
      },
      {
        level: 0,
        module: null,
        names: ['shop.money'],
        typeOnly: false,
        line: 3,
        aliases: [{ name: 'shop.money', alias: 'money' }],
      },
    ]);
  });

  it('records module-level definitions with normalized tokens and free names', () => {
    const { definitions, qualifiedUses } = factsOf({ 'src/shop/pricing.py': PRICING }).files[
      'src/shop/pricing.py'
    ];
    const total = definitions.find(({ name }) => name === 'total');

    expect(
      definitions.map(({ name, kind, tag, line, exported, literal }) => ({
        name,
        kind,
        tag,
        line,
        exported,
        literal,
      })),
    ).toEqual([
      { name: 'RATE', kind: 'constant', tag: 'constant', line: 5, exported: true, literal: true },
      {
        name: '_CACHE',
        kind: 'constant',
        tag: 'constant',
        line: 6,
        exported: false,
        literal: true,
      },
      { name: 'Cents', kind: 'constant', tag: 'constant', line: 7, exported: true, literal: false },
      {
        name: 'total',
        kind: 'function',
        tag: 'function',
        line: 10,
        exported: true,
        literal: false,
      },
      { name: 'Cart', kind: 'class', tag: 'class', line: 15, exported: true, literal: false },
    ]);
    expect(total.tokens.join(' ')).toBe(
      'def total ( amount : int , * , rate : int = RATE ) -> D : return D ( amount ) * rate',
    );
    expect(total.lines).toBe(3);
    expect(total.free).toEqual([
      { name: 'D', binding: { kind: 'import', module: 'decimal', level: 0, name: 'Decimal' } },
      { name: 'RATE', binding: { kind: 'local' } },
    ]);
    expect(definitions.find(({ name }) => name === 'RATE').usedLocally).toBe(true);
    expect(definitions.find(({ name }) => name === 'Cart').usedLocally).toBe(false);
    expect(qualifiedUses).toEqual([]);
  });

  it('spells strings by value and reads type aliases, decorators and qualified uses', () => {
    const { definitions, qualifiedUses } = factsOf({
      'src/shop/a.py':
        'import shop.money as money\nfrom typing import TypeAlias\nA = "x"\nB = \'x\'\nC: TypeAlias = int\n\n\n@money.cached\nasync def d():\n    return money.Coin\n',
    }).files['src/shop/a.py'];

    expect(definitions.map(({ name, tag, tokens }) => [name, tag, tokens.join(' ')])).toEqual([
      ['A', 'constant', "A = str:'x'"],
      ['B', 'constant', "B = str:'x'"],
      ['C', 'type', 'C : TypeAlias = int'],
      ['d', 'function:async', '@ money . cached async def d ( ) : return money . Coin'],
    ]);
    expect(qualifiedUses).toEqual(['money.Coin', 'money.cached']);
  });

  it('records __all__ and the re-exports of a package', () => {
    const files = factsOf({
      'src/shop/__init__.py': 'from .pricing import total as price\nfrom . import _private\n',
      'src/shop/api.py': 'from shop.pricing import total, Cart\n__all__ = ["total"]\n',
      'src/shop/pricing.py': 'def total():\n    pass\n',
    }).files;

    expect(files['src/shop/__init__.py'].exports).toEqual({
      all: null,
      reexports: [{ name: 'price', imported: 'total', module: 'pricing', level: 1, line: 1 }],
    });
    expect(files['src/shop/api.py'].exports).toEqual({
      all: ['total'],
      reexports: [{ name: 'total', imported: 'total', module: 'shop.pricing', level: 0, line: 1 }],
    });
    expect(files['src/shop/pricing.py'].exports).toEqual({ all: null, reexports: [] });
  });

  it('leaves out a file that does not parse', () => {
    expect(Object.keys(factsOf({ 'src/shop/bad.py': 'def (:\n' }).files)).toEqual([]);
  });
});
