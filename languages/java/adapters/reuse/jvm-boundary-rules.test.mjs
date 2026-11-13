import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MESSAGES, messageFields } from '../../../../shared/policy.mjs';
import { exceptionText } from '../../../../shared/rules/exceptions.mjs';
import { readJvmReuseFindings } from './jvm-reuse-facts.mjs';

const RULE = 'shared-used-by-one-feature';
const JAVA_ROOT = 'src/main/java';
const KOTLIN_ROOT = 'src/main/kotlin';
const SINGLE = [{ qualifier: '', sourceRoots: [JAVA_ROOT], kotlinSourceRoots: [KOTLIN_ROOT] }];
const MONEY = `${JAVA_ROOT}/shop/shared/Money.java`;
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'jvm-boundary-rules-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function javaClass(packageName, name, body = '', imports = '') {
  return `package ${packageName};\n\n${imports}public class ${name} {\n${body}}\n`;
}

const SHARED_MONEY = javaClass(
  'shop.shared',
  'Money',
  '  public static long cents() { return 1; }\n',
);

function featureClass(feature, name, uses = 'Money.cents()') {
  return javaClass(
    `shop.features.${feature}`,
    name,
    `  long total() { return ${uses}; }\n`,
    'import shop.shared.Money;\n\n',
  );
}

function sharedUsage(files, options = {}) {
  return readJvmReuseFindings(project(files), { projects: SINGLE, ...options }).filter(
    ({ rule }) => rule === RULE,
  );
}

describe('shared-used-by-one-feature on Java and Kotlin', () => {
  it('reports a shared class that only one feature uses, with tool coupling', () => {
    const found = sharedUsage({
      [MONEY]: SHARED_MONEY,
      [`${JAVA_ROOT}/shop/features/billing/Invoice.java`]: featureClass('billing', 'Invoice'),
      [`${JAVA_ROOT}/shop/features/billing/Refund.java`]: featureClass('billing', 'Refund'),
    });

    expect(found).toEqual([
      {
        tool: 'coupling',
        rule: RULE,
        path: MONEY,
        identity: RULE,
        ...messageFields(MESSAGES.sharedUsedByOneFeature, {
          path: MONEY,
          feature: 'billing',
          directory: `${JAVA_ROOT}/shop/features/billing/`,
          exception: exceptionText(RULE, MONEY),
        }),
        classification: 'enforceable',
      },
    ]);
  });

  it('keeps a shared class that two features, or code outside any feature, use', () => {
    const shipping = `${JAVA_ROOT}/shop/features/shipping/Label.java`;
    const app = `${JAVA_ROOT}/shop/App.java`;
    const billing = {
      [`${JAVA_ROOT}/shop/features/billing/Invoice.java`]: featureClass('billing', 'Invoice'),
    };

    expect(
      sharedUsage({
        [MONEY]: SHARED_MONEY,
        ...billing,
        [shipping]: featureClass('shipping', 'Label'),
      }),
    ).toEqual([]);
    expect(
      sharedUsage({
        [MONEY]: SHARED_MONEY,
        ...billing,
        [app]: javaClass('shop', 'App', '  long run() { return shop.shared.Money.cents(); }\n'),
      }),
    ).toEqual([]);
  });

  it('follows shared files to the feature that reaches them through another shared file', () => {
    const format = `${JAVA_ROOT}/shop/shared/Format.java`;
    const found = sharedUsage({
      [MONEY]: SHARED_MONEY,
      [format]: javaClass(
        'shop.shared',
        'Format',
        '  static long shown() { return Money.cents(); }\n',
      ),
      [`${JAVA_ROOT}/shop/features/billing/Invoice.java`]: featureClass(
        'billing',
        'Invoice',
        'shop.shared.Format.shown()',
      ),
    });

    expect(found.map(({ path: file }) => file)).toEqual([format, MONEY]);
  });

  it('reads Kotlin top-level functions and the configured layout', () => {
    const ids = `${KOTLIN_ROOT}/shop/common/Ids.kt`;
    const files = {
      [ids]: 'package shop.common\n\nfun nextId(): Long = 1L\n',
      [`${KOTLIN_ROOT}/shop/modules/orders/Cart.kt`]:
        'package shop.modules.orders\n\nimport shop.common.nextId\n\nfun cartId() = nextId()\n',
    };
    const layout = { sharedRoots: ['**/common'], featureRoots: ['**/modules'] };

    expect(sharedUsage(files, { kotlin: true })).toEqual([]);
    expect(
      sharedUsage(files, { kotlin: true, policy: { layout } }).map(({ path: file }) => file),
    ).toEqual([ids]);
  });

  it.each([
    ['the file class', 'import shop.shared.IdsKt;', 'IdsKt.nextId()', ''],
    ['its JvmName', 'import static shop.shared.Ids.nextId;', 'nextId()', '@file:JvmName("Ids")\n'],
    ['a fully qualified file class', '', 'shop.shared.IdsKt.nextId()', ''],
  ])(
    'counts Java code that calls a shared Kotlin function through %s',
    (_, imports, call, head) => {
      const ids = `${KOTLIN_ROOT}/shop/shared/Ids.kt`;
      const files = {
        [ids]: `${head}package shop.shared\n\nfun nextId(): Long = 1L\n`,
        [`${KOTLIN_ROOT}/shop/features/orders/Cart.kt`]:
          'package shop.features.orders\n\nimport shop.shared.nextId\n\nfun cartId() = nextId()\n',
        [`${JAVA_ROOT}/shop/features/billing/Invoice.java`]: javaClass(
          'shop.features.billing',
          'Invoice',
          `  long id() { return ${call}; }\n`,
          `${imports}\n\n`,
        ),
      };

      expect(sharedUsage(files, { kotlin: true })).toEqual([]);
    },
  );

  it('counts a Kotlin import of a companion member', () => {
    const files = {
      [`${KOTLIN_ROOT}/shop/shared/Ids.kt`]:
        'package shop.shared\n\nclass Ids {\n  companion object {\n    fun next() = 1\n  }\n}\n',
      [`${KOTLIN_ROOT}/shop/features/orders/Cart.kt`]:
        'package shop.features.orders\n\nimport shop.shared.Ids\n\nfun cartId() = Ids.next()\n',
      [`${KOTLIN_ROOT}/shop/features/billing/Bill.kt`]:
        'package shop.features.billing\n\nimport shop.shared.Ids.Companion.next\n\nfun billId() = next()\n',
    };

    expect(sharedUsage(files, { kotlin: true })).toEqual([]);
  });

  it('is lifted by an exception and turned off by an empty feature list', () => {
    const files = {
      [MONEY]: SHARED_MONEY,
      [`${JAVA_ROOT}/shop/features/billing/Invoice.java`]: featureClass('billing', 'Invoice'),
    };

    expect(
      sharedUsage(files, { policy: { exceptions: [{ rule: RULE, paths: [MONEY] }] } }),
    ).toEqual([]);
    expect(sharedUsage(files, { policy: { layout: { featureRoots: [] } } })).toEqual([]);
  });
});

const BYPASS = 'public-alternative-bypass';
const INTERNAL_INVOICE = `${KOTLIN_ROOT}/shop/billing/internal/Invoice.kt`;
const BILLING_ALIASES = `${KOTLIN_ROOT}/shop/billing/Aliases.kt`;
const ALIASED_BILLING = {
  [INTERNAL_INVOICE]: 'package shop.billing.internal\n\nclass Invoice(val cents: Long)\n',
  [BILLING_ALIASES]: 'package shop.billing\n\ntypealias Invoice = shop.billing.internal.Invoice\n',
};

function bypasses(files) {
  return readJvmReuseFindings(project(files), { projects: SINGLE, kotlin: true })
    .filter(({ rule }) => rule === BYPASS)
    .map(({ tool, path: file, identity, allowedForm }) => [tool, file, identity, allowedForm]);
}

describe('public-alternative-bypass on Kotlin type aliases', () => {
  it('reports Kotlin code outside the package that names the class the alias stands for', () => {
    const cart = `${KOTLIN_ROOT}/shop/orders/Cart.kt`;

    expect(
      bypasses({
        ...ALIASED_BILLING,
        [cart]:
          'package shop.orders\n\nimport shop.billing.internal.Invoice\n\nfun bill() = Invoice(1)\n',
        [`${KOTLIN_ROOT}/shop/orders/Checkout.kt`]:
          'package shop.orders\n\nimport shop.billing.Invoice\n\nfun pay() = Invoice(2)\n',
        [`${KOTLIN_ROOT}/shop/billing/Refund.kt`]:
          'package shop.billing\n\nimport shop.billing.internal.Invoice\n\nfun refund() = Invoice(3)\n',
      }),
    ).toEqual([
      ['entry-points', cart, `target:${INTERNAL_INVOICE}`, 'Import Invoice from shop.billing.'],
    ]);
  });

  it('leaves Java code, which cannot use an alias, and private or generic aliases alone', () => {
    const files = {
      [INTERNAL_INVOICE]: 'package shop.billing.internal\n\nclass Invoice(val cents: Long)\n',
      [BILLING_ALIASES]: [
        'package shop.billing',
        '',
        'import shop.billing.internal.Invoice',
        '',
        'private typealias Hidden = shop.billing.internal.Invoice',
        'internal typealias Inside = shop.billing.internal.Invoice',
        'typealias Invoices = List<Invoice>',
        '',
      ].join('\n'),
      [`${KOTLIN_ROOT}/shop/orders/Cart.kt`]:
        'package shop.orders\n\nimport shop.billing.internal.Invoice\n\nfun bill() = Invoice(1)\n',
    };

    expect(bypasses(files)).toEqual([]);
    expect(
      bypasses({
        ...ALIASED_BILLING,
        [`${JAVA_ROOT}/shop/orders/Cart.java`]: javaClass(
          'shop.orders',
          'Cart',
          '  Object bill() { return new Invoice(1); }\n',
          'import shop.billing.internal.Invoice;\n\n',
        ),
      }),
    ).toEqual([]);
  });

  it('names a renamed alias, and leaves an alias of a class in its own package alone', () => {
    const cart = `${KOTLIN_ROOT}/shop/orders/Cart.kt`;
    const importer =
      'package shop.orders\n\nimport shop.billing.internal.Invoice\n\nfun bill() = Invoice(1)\n';
    const renamed = {
      ...ALIASED_BILLING,
      [BILLING_ALIASES]: 'package shop.billing\n\ntypealias Bill = shop.billing.internal.Invoice\n',
      [cart]: importer,
    };
    const sameFolder = {
      [INTERNAL_INVOICE]: ALIASED_BILLING[INTERNAL_INVOICE],
      [`${KOTLIN_ROOT}/shop/billing/internal/Names.kt`]:
        'package shop.billing.internal\n\ntypealias Bill = Invoice\n',
      [cart]: importer,
    };

    expect(bypasses(renamed).map(([, , , allowedForm]) => allowedForm)).toEqual([
      'Import Bill from shop.billing.',
    ]);
    expect(bypasses(sameFolder)).toEqual([]);
  });
});
