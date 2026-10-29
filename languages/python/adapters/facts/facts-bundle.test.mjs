import { describe, expect, it } from 'vitest';
import { factsBundle } from './facts-bundle.mjs';

function statement(line, module, aliases, extra = {}) {
  return {
    level: 0,
    module,
    names: aliases.map(([name]) => name),
    typeOnly: false,
    line,
    aliases: aliases.map(([name, alias = null]) => ({ name, alias })),
    ...extra,
  };
}

function definition(name, extra = {}) {
  return {
    name,
    kind: 'function',
    tag: 'function',
    line: 1,
    lines: 2,
    exported: !name.startsWith('_'),
    usedLocally: false,
    literal: false,
    tokens: ['def', name],
    free: [],
    ...extra,
  };
}

function file(extra = {}) {
  return {
    imports: [],
    definitions: [],
    qualifiedUses: [],
    exports: { all: null, reexports: [] },
    script: false,
    docComments: [],
    ...extra,
  };
}

const MODULES = [
  { file: 'src/shop/orders/__init__.py', module: 'shop.orders', isPackage: true },
  { file: 'src/shop/orders/cart.py', module: 'shop.orders.cart', isPackage: false },
  { file: 'src/shop/orders/lines.py', module: 'shop.orders.lines', isPackage: false },
];

function bundle(scanned, options = {}) {
  return factsBundle({
    modules: MODULES,
    scanned,
    isTest: (name) => name.startsWith('tests/'),
    ...options,
  });
}

describe('the Python facts bundle', () => {
  it('resolves through a namespace package and splits re-exported names', () => {
    const { imports } = bundle({
      'src/shop/orders/__init__.py': file({
        imports: [statement(1, 'shop.orders.cart', [['add'], ['_draft']])],
        exports: {
          all: null,
          reexports: [
            { name: 'add', imported: 'add', module: 'shop.orders.cart', level: 0, line: 1 },
          ],
        },
      }),
      'src/shop/orders/cart.py': file({ definitions: [definition('add'), definition('_draft')] }),
      'src/shop/orders/lines.py': file(),
      'tests/test_cart.py': file({
        imports: [
          statement(1, 'shop', [['orders']]),
          statement(2, 'shop.orders', [['lines', 'order_lines']], { typeOnly: true }),
          statement(3, 'requests', [['get']]),
          statement(4, null, [['shop.orders.cart']]),
        ],
      }),
    });

    expect(imports).toEqual([
      {
        from: 'src/shop/orders/__init__.py',
        to: 'src/shop/orders/cart.py',
        names: [{ name: 'add' }],
        reexport: true,
        role: 'production',
        line: 1,
        typeOnly: false,
      },
      {
        from: 'src/shop/orders/__init__.py',
        to: 'src/shop/orders/cart.py',
        names: [{ name: '_draft' }],
        reexport: false,
        role: 'production',
        line: 1,
        typeOnly: false,
      },
      {
        from: 'tests/test_cart.py',
        to: 'src/shop/orders/__init__.py',
        names: [{ name: '*', alias: 'orders' }],
        reexport: false,
        role: 'test',
        line: 1,
        typeOnly: false,
      },
      {
        from: 'tests/test_cart.py',
        to: 'src/shop/orders/lines.py',
        names: [{ name: '*', alias: 'order_lines' }],
        reexport: false,
        role: 'test',
        line: 2,
        typeOnly: true,
      },
      {
        from: 'tests/test_cart.py',
        to: 'src/shop/orders/__init__.py',
        names: [],
        reexport: false,
        role: 'test',
        line: 4,
        typeOnly: false,
      },
      {
        from: 'tests/test_cart.py',
        to: 'src/shop/orders/cart.py',
        names: [{ name: '*' }],
        reexport: false,
        role: 'test',
        line: 4,
        typeOnly: false,
      },
    ]);
  });

  it('takes a name the package defines over a submodule of the same name', () => {
    const { imports } = bundle({
      'src/shop/orders/__init__.py': file({ definitions: [definition('lines')] }),
      'src/shop/orders/lines.py': file({
        imports: [statement(1, 'orders', [['cart']], { level: 2 })],
      }),
      'src/shop/orders/cart.py': file({
        imports: [statement(1, null, [['lines']], { level: 1 })],
      }),
    });

    expect(imports.map(({ from, to, names }) => [from, to, names])).toEqual([
      ['src/shop/orders/cart.py', 'src/shop/orders/__init__.py', [{ name: 'lines' }]],
      ['src/shop/orders/lines.py', 'src/shop/orders/cart.py', [{ name: '*', alias: 'cart' }]],
    ]);
  });

  it('keys a definition by the text and the resolved source of its free names', () => {
    const free = (binding) => [{ name: 'helper', binding }];
    const local = { kind: 'local' };
    const imported = { kind: 'import', module: 'shop.orders.lines', level: 0, name: 'helper' };
    const external = { kind: 'import', module: 'tools', level: 0, name: 'helper' };
    const module = { kind: 'module', module: 'shop.orders.lines', level: 0 };
    const { definitions } = bundle({
      'src/shop/orders/cart.py': file({
        definitions: [
          definition('helper'),
          definition('first', { tokens: ['body'], free: free(local) }),
          definition('second', { tokens: ['body'], free: free(imported) }),
          definition('third', { tokens: ['body'], free: free(external) }),
          definition('fourth', { tokens: ['body'], free: free(module) }),
          definition('fifth', { tokens: ['body'], free: [{ name: 'gone', binding: local }] }),
        ],
      }),
      'src/shop/orders/lines.py': file(),
    });
    const keys = definitions.map(({ key }) => key);

    expect(new Set(keys).size).toBe(keys.length);
    expect(definitions[1]).toEqual({
      file: 'src/shop/orders/cart.py',
      name: 'first',
      kind: 'function',
      line: 1,
      lines: 2,
      exported: true,
      tokens: ['body'],
      literal: false,
      usedLocally: false,
      text: 'function|body',
      key: expect.any(String),
      entry: false,
    });
  });

  it('marks scripts, __main__ files and entry points as entries', () => {
    const report = bundle(
      {
        'src/shop/__main__.py': file(),
        'src/shop/orders/cart.py': file({ definitions: [definition('main'), definition('add')] }),
        'src/shop/orders/lines.py': file({ script: true }),
        'src/shop/orders/__init__.py': file(),
      },
      {
        published: true,
        entryPoints: ['shop.orders.cart:main', 'missing.module:run', 'shop.orders'],
      },
    );

    expect(report.modules.map(({ file: name, entry }) => [name, entry])).toEqual([
      ['src/shop/__main__.py', true],
      ['src/shop/orders/__init__.py', true],
      ['src/shop/orders/cart.py', true],
      ['src/shop/orders/lines.py', true],
    ]);
    expect(report.definitions.map(({ name, entry }) => [name, entry])).toEqual([
      ['main', true],
      ['add', false],
    ]);
    expect(report.packages).toEqual([{ root: '', published: true }]);
  });

  it('lists doc comments with their file', () => {
    const docComments = [
      { line: 2, name: 'add', qualifier: 'Cart.add', lines: ['Adds.'], detailed: true },
    ];

    expect(bundle({ 'src/shop/orders/cart.py': file({ docComments }) }).docComments).toEqual([
      { file: 'src/shop/orders/cart.py', ...docComments[0] },
    ]);
  });
  it('resolves references to the exact name and loads to the fetched names', () => {
    const references = [
      { name: 'shop.orders.lines.helper', line: 2 },
      { name: 'shop.orders.cart', line: 3 },
      { name: 'shop.orders.*', line: 4, dynamic: true },
    ];
    const { imports } = bundle({
      'src/shop/orders/__init__.py': file({ references, fetchedNames: ['run'] }),
      'src/shop/orders/cart.py': file(),
      'src/shop/orders/lines.py': file(),
    });

    expect(imports.map(({ to, names, line, reference }) => [to, names, line, reference])).toEqual([
      ['src/shop/orders/lines.py', [{ name: 'helper' }], 2, true],
      ['src/shop/orders/cart.py', [], 3, true],
      ['src/shop/orders/cart.py', [{ name: 'run' }], 4, true],
      ['src/shop/orders/lines.py', [{ name: 'run' }], 4, true],
    ]);
  });

  it('counts only the attributes a migration reads', () => {
    const migration = 'src/shop/migrations/0001_initial.py';
    const binding = { kind: 'module', module: 'shop', level: 0 };
    const { imports, definitions } = bundle(
      {
        [migration]: file({
          imports: [statement(1, null, [['shop.orders.lines']])],
          attributeUses: [{ binding, attributes: ['orders', 'lines', 'helper'], line: 5 }],
          definitions: [definition('Migration')],
        }),
        'src/shop/orders/__init__.py': file(),
        'src/shop/orders/lines.py': file(),
      },
      { referenceFiles: [migration] },
    );

    expect(definitions).toEqual([]);
    expect(imports.map(({ to, names, reference = false }) => [to, names, reference])).toEqual([
      ['src/shop/orders/__init__.py', [], false],
      ['src/shop/orders/lines.py', [], false],
      ['src/shop/orders/lines.py', [{ name: 'helper' }], true],
    ]);
  });

  it('scopes definitions to their distribution and Django names to a Django application', () => {
    const scanned = {
      'src/shop/orders/cart.py': file({ definitions: [definition('Command')] }),
      'src/shop/orders/lines.py': file({ definitions: [definition('Config')] }),
    };
    const packageOf = (name) => (name.endsWith('cart.py') ? 'src/shop' : '');
    const rowsOf = ({ definitions }) =>
      definitions.map(({ name, entry, package: root }) => [name, entry, root]);

    expect(rowsOf(bundle(scanned, { packageOf }))).toEqual([
      ['Command', false, 'src/shop'],
      ['Config', false, undefined],
    ]);
    expect(rowsOf(bundle(scanned, { packageOf, django: true }))).toEqual([
      ['Command', true, 'src/shop'],
      ['Config', true, undefined],
    ]);
  });
});
