import { describe, expect, it } from 'vitest';
import { filesEnvironment } from '../../../test-support/env.mjs';
import { findTestFile } from '../index.mjs';

const FEATURE = {
  'src/main/features/invoices/adapters/format.ts': 'export function formatInvoice() {}',
  'src/main/features/invoices/index.ts': "export { formatInvoice } from './adapters/format.js';",
  'src/main/root.ts':
    "import { formatInvoice } from './features/invoices/index.js';\n" +
    'export function invoice() {}\nexport function checkout() {}',
  'test/checkout/flow.test.ts': "import { checkout } from '../../src/main/root.js';\ncheckout();",
  'test/invoices/invoice.test.ts': "import { invoice } from '../../src/main/root.js';\ninvoice();",
};

const find = (file, files, symbol) => findTestFile(file, filesEnvironment(files), symbol);

describe('the test that reaches a module through other modules', () => {
  it('is the nearest test that runs it, preferring one in a folder named like the source', () => {
    expect(find('src/main/features/invoices/adapters/format.ts', FEATURE, 'formatInvoice')).toEqual(
      {
        path: 'test/invoices/invoice.test.ts',
        exists: true,
      },
    );
  });

  it('prefers a test that calls the function among direct importers', () => {
    expect(find('src/main/root.ts', FEATURE, 'checkout')).toEqual({
      path: 'test/checkout/flow.test.ts',
      exists: true,
    });
  });

  it('skips a test that imports other names of a barrel', () => {
    const files = {
      ...FEATURE,
      'src/main/root.ts': 'export const unrelated = 1;',
      'test/invoices/invoice.test.ts': '',
      'src/main/features/invoices/index.ts':
        "export { formatInvoice } from './adapters/format.js';\nexport const other = 1;",
      'test/other.test.ts': "import { other } from '../src/main/features/invoices/index.js';",
    };

    expect(find('src/main/features/invoices/adapters/format.ts', files)).toEqual({
      path: 'test/invoices/format.test.ts',
      exists: false,
    });
  });

  it('stops at a module that exports nothing', () => {
    const files = {
      'src/util.ts': 'export const util = 1;',
      'src/main.ts': "import { util } from './util';\nconsole.log(util);",
      'test/main.test.ts': "import '../src/main';",
    };

    expect(find('src/util.ts', files)).toEqual({ path: 'test/util.test.ts', exists: false });
  });

  it('passes the names on through an export star', () => {
    const files = {
      'src/x.ts': 'export function x() {}',
      'src/y.ts': 'export function y() {}',
      'src/a/index.ts': "export * from '../x';\nexport * from '../y';",
      'test/i.test.ts': "import { y } from '../src/a/index';",
    };

    expect(find('src/x.ts', files)).toEqual({ path: 'test/x.test.ts', exists: false });
  });

  it('counts only real calls of the function in a tie', () => {
    const files = {
      'src/parse.ts': 'export function parse() {}',
      'src/root.ts': "import { parse } from './parse';\nexport function run() {}",
      'test/a.test.ts':
        "import { run } from '../src/root';\nrun();\n// parse(x) is slow\nJSON.parse('1');",
      'test/b.test.ts': "import { run } from '../src/root';\nconst value = parse ('1');",
    };

    expect(find('src/parse.ts', files, 'parse').path).toBe('test/b.test.ts');
  });

  it('does not continue through a helper module under a test folder', () => {
    const files = {
      'src/x.ts': 'export function x() {}',
      'test/helpers.ts': "import { x } from '../src/x';\nexport function helper() {}",
      'test/b.test.ts': "import { helper } from './helpers';",
    };

    expect(find('src/x.ts', files)).toEqual({ path: 'test/x.test.ts', exists: false });
  });

  it('walks a wide layered project quickly', () => {
    const layer = (depth) =>
      Array.from({ length: 40 }, (_, at) => `src/l${String(depth)}/m${String(at)}.ts`);
    const files = Object.fromEntries(
      [1, 2, 3, 4, 5].flatMap((depth) =>
        layer(depth).map((name, at) => [
          name,
          depth === 1
            ? `export function f${String(at)}() {}`
            : `${layer(depth - 1)
                .map(
                  (other, index) =>
                    `import { f${String(index)} } from '../l${String(depth - 1)}/${other.split('/').at(-1).replace('.ts', '')}';`,
                )
                .join('\n')}\nexport function f${String(at)}() {}`,
        ]),
      ),
    );
    const started = performance.now();

    expect(find('src/l1/m0.ts', files)).toEqual({ path: 'src/l1/m0.test.ts', exists: false });
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
