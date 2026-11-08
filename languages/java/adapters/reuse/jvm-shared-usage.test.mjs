import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
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
  const root = mkdtempSync(path.join(tmpdir(), 'jvm-shared-usage-'));
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
        message: expect.stringContaining(exceptionHint(RULE, MONEY)),
        allowedForm: expect.any(String),
        classification: 'enforceable',
      },
    ]);
    expect(found[0].message).toContain(`${JAVA_ROOT}/shop/features/billing/`);
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
