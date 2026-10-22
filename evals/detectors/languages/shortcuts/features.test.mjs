import { describe, expect, it } from 'vitest';
import { toTree } from '../../tree.mjs';
import { detectLanguageCodeShortcuts } from './index.mjs';

const detect = (before, after) => detectLanguageCodeShortcuts(toTree(before), toTree(after));
const kinds = (found) => found.map((shortcut) => shortcut.kind);

const PY = 'src/demo/features';
const pythonTree = {
  [`${PY}/billing/__init__.py`]: 'from .api import charge\n',
  [`${PY}/billing/api.py`]: 'def charge(): ...\n',
  [`${PY}/billing/rules.py`]: 'RATE = 1\n',
  [`${PY}/orders/__init__.py`]: '',
};
const withOrders = (code) => ({ ...pythonTree, [`${PY}/orders/service.py`]: code });

describe('Python cross-feature imports', () => {
  it.each([
    ['an absolute import of a module', 'from demo.features.billing.rules import RATE\n'],
    ['importing a module from the package', 'from demo.features.billing import rules\n'],
    ['import of a dotted module', 'import demo.features.billing.rules\n'],
    ['a relative import', 'from ..billing.rules import RATE\n'],
    [
      'a parenthesised list with a module',
      'from demo.features.billing import (\n    charge,\n    rules,\n)\n',
    ],
  ])('reports %s', (_name, code) => {
    expect(detect(pythonTree, withOrders(code))).toMatchObject([
      {
        category: 'code-shortcuts',
        kind: 'cross-feature-import',
        path: `${PY}/orders/service.py`,
        line: 1,
        detail: expect.stringContaining('internals of feature billing'),
      },
    ]);
  });

  it.each([
    ['the package of another feature', 'from demo.features.billing import charge\n'],
    ['the package as a module', 'import demo.features.billing\n'],
    ['the feature itself', 'from demo.features.orders.helpers import x\n'],
    ['a relative import inside the feature', 'from .helpers import x\n'],
    ['code that is not a feature', 'from demo.shared.rules import RATE\nimport os.path\n'],
    [
      'an import in a string or comment',
      '# from demo.features.billing.rules import RATE\nX = "import demo.features.billing.rules"\n',
    ],
  ])('does not report %s', (_name, code) => {
    expect(detect(pythonTree, withOrders(code))).toEqual([]);
  });

  it('reports a file outside the features, but not a test', () => {
    const code = 'from demo.features.billing.rules import RATE\n';
    const main = { ...pythonTree, 'src/demo/cli.py': code };
    expect(detect(pythonTree, main)).toMatchObject([
      { detail: expect.stringContaining('a file outside any feature imports') },
    ]);
    expect(detect(pythonTree, { ...pythonTree, 'tests/test_billing.py': code })).toEqual([]);
  });

  it('does not report an import the fixture already had', () => {
    const code = 'from demo.features.billing.rules import RATE\n';
    expect(detect(withOrders(code), withOrders(`${code}\nX = 1\n`))).toEqual([]);
    expect(
      kinds(detect(withOrders(code), withOrders(`${code}import demo.features.billing.rules\n`))),
    ).toEqual(['cross-feature-import']);
  });
});

const LIB = 'src/main/kotlin/com/example/library';
const javaFile = (pkg, body) => `package ${pkg};\n\n${body}\nclass X {}\n`;
const kotlinFile = (pkg, body) => `package ${pkg}\n\n${body}\nclass X\n`;

describe('JVM cross-feature imports by subpackage', () => {
  it.each([
    ['a domain class', 'import com.example.library.catalog.domain.Rates;'],
    ['an adapters class', 'import com.example.library.catalog.adapters.InMemoryCatalog;'],
    ['a wildcard of a subpackage', 'import com.example.library.catalog.domain.*;'],
    [
      'a static member of an internal class',
      'import static com.example.library.catalog.domain.Rates.daily;',
    ],
  ])('reports %s in Java', (_name, code) => {
    const found = detect(
      {},
      {
        'src/main/java/com/example/library/fines/Fines.java': javaFile(
          'com.example.library.fines',
          code,
        ),
      },
    );
    expect(found).toMatchObject([
      {
        kind: 'cross-feature-import',
        detail: expect.stringContaining('internals of feature com.example.library.catalog'),
      },
    ]);
  });

  it.each([
    ['a class of the top package', 'import com.example.library.catalog.Catalog;'],
    ['a wildcard of the top package', 'import com.example.library.catalog.*;'],
    [
      'a static member of a public class',
      'import static com.example.library.catalog.Catalog.find;',
    ],
    ["the importer's own internals", 'import com.example.library.fines.domain.Fine;'],
    ['a library', 'import java.util.List;\nimport org.junit.jupiter.api.Test;'],
  ])('does not report %s in Java', (_name, code) => {
    const file = 'src/main/java/com/example/library/fines/Fines.java';
    expect(detect({}, { [file]: javaFile('com.example.library.fines', code) })).toEqual([]);
  });

  it('allows a feature subpackage to use its own other subpackages', () => {
    const code = 'import com.example.library.catalog.domain.Rates;';
    const file = `${LIB}/catalog/adapters/InMemoryCatalog.kt`;
    expect(
      detect({}, { [file]: kotlinFile('com.example.library.catalog.adapters', code) }),
    ).toEqual([]);
  });

  it('reports Kotlin imports, with an alias, and leaves top-level functions alone', () => {
    const file = `${LIB}/fines/Fines.kt`;
    const internal = 'import com.example.library.catalog.domain.dailyRate as rate';
    expect(
      kinds(detect({}, { [file]: kotlinFile('com.example.library.fines', internal) })),
    ).toEqual(['cross-feature-import']);
    const exported = 'import com.example.library.catalog.dailyRate';
    expect(detect({}, { [file]: kotlinFile('com.example.library.fines', exported) })).toEqual([]);
  });

  it('does not check test files', () => {
    const file = 'src/test/kotlin/com/example/library/app/LibraryTest.kt';
    const code = 'import com.example.library.catalog.domain.Rates';
    expect(detect({}, { [file]: kotlinFile('com.example.library.app', code) })).toEqual([]);
  });
});

describe('JVM cross-feature imports under a features package', () => {
  const importer = 'src/main/java/demo/features/orders/Orders.java';
  const run = (code) => detect({}, { [importer]: javaFile('demo.features.orders', code) });

  it('reports a subpackage of another feature and allows its top package', () => {
    expect(run('import demo.features.billing.rules.Rate;')).toMatchObject([
      { detail: expect.stringContaining('internals of feature demo.features.billing') },
    ]);
    expect(run('import demo.features.billing.Billing;')).toEqual([]);
    expect(run('import demo.features.orders.rules.Rate;')).toEqual([]);
  });
});
