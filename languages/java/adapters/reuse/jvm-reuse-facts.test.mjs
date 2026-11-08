import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { jvmReuseFacts, readJvmReuseFindings } from './jvm-reuse-facts.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'jvm-reuse-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const JAVA_ROOT = 'src/main/java';
const KOTLIN_ROOT = 'src/main/kotlin';
const SINGLE = [{ qualifier: '', sourceRoots: [JAVA_ROOT], kotlinSourceRoots: [KOTLIN_ROOT] }];

function javaClass(packageName, name, body, imports = '') {
  return `package ${packageName};\n\n${imports}public class ${name} {\n${body}}\n`;
}

const CLEAN = `  private static String clean(String value) {
    return value.trim().toLowerCase();
  }
  public String label(String value) { return clean(value); }
`;

function rows(findings) {
  return findings.map(({ rule, path: file, identity }) => [rule, file, identity]);
}

function findings(files, options = {}) {
  const root = project(files);
  return readJvmReuseFindings(root, { projects: SINGLE, ...options });
}

describe('duplicate-definition on Java and Kotlin', () => {
  it('reports a small private static helper copied into two classes of one module', () => {
    const found = findings({
      [`${JAVA_ROOT}/shop/orders/Orders.java`]: javaClass('shop.orders', 'Orders', CLEAN),
      [`${JAVA_ROOT}/shop/invoices/Invoices.java`]: javaClass('shop.invoices', 'Invoices', CLEAN),
    });

    expect(rows(found)).toEqual([
      [
        'duplicate-definition',
        `${JAVA_ROOT}/shop/invoices/Invoices.java`,
        'duplicate:Invoices.clean',
      ],
      ['duplicate-definition', `${JAVA_ROOT}/shop/orders/Orders.java`, 'duplicate:Orders.clean'],
    ]);
    const invoices = `${JAVA_ROOT}/shop/invoices/Invoices.java`;

    expect(found[0]).toEqual({
      tool: 'structure',
      rule: 'duplicate-definition',
      path: invoices,
      identity: 'duplicate:Invoices.clean',
      symbol: 'clean',
      location: { line: 4 },
      classification: 'enforceable',
      message: [
        `Invoices.clean is also defined with the same code in ${JAVA_ROOT}/shop/orders/Orders.java.`,
        'Move it to one module and import it.',
        exceptionHint('duplicate-definition', invoices),
      ].join(' '),
      allowedForm: 'Move it to one module and import it.',
    });
  });

  it('counts a public static method used only as Class.method from another file as used', () => {
    const helper = '  public static int twice(int x) { return x * 2; }\n';
    const found = findings({
      [`${JAVA_ROOT}/shop/a/MathA.java`]: javaClass('shop.a', 'MathA', helper),
      [`${JAVA_ROOT}/shop/b/MathB.java`]: javaClass('shop.b', 'MathB', helper),
      [`${JAVA_ROOT}/shop/c/Use.java`]: javaClass(
        'shop.c',
        'Use',
        '  int run() { return MathA.twice(1) + shop.b.MathB.twice(2); }\n',
        'import shop.a.MathA;\n\n',
      ),
    });

    expect(rows(found).map(([, , identity]) => identity)).toEqual([
      'duplicate:MathA.twice',
      'duplicate:MathB.twice',
    ]);
  });

  it('leaves alone copies that call different same-named helpers, unused copies and other modules', () => {
    const calls = (value) =>
      `  private static int limit() { return ${value}; }\n  private static int capped(int x) { return Math.min(x, limit()); }\n  int use() { return capped(1); }\n`;
    const twoModules = [
      { qualifier: 'orders', sourceRoots: [`orders/${JAVA_ROOT}`] },
      { qualifier: 'billing', sourceRoots: [`billing/${JAVA_ROOT}`] },
    ];

    expect(
      findings({
        [`${JAVA_ROOT}/shop/a/A.java`]: javaClass('shop.a', 'A', calls('10')),
        [`${JAVA_ROOT}/shop/b/B.java`]: javaClass('shop.b', 'B', calls('20')),
        [`${JAVA_ROOT}/shop/c/C.java`]: javaClass(
          'shop.c',
          'C',
          '  private static int unused() { return 1; }\n',
        ),
        [`${JAVA_ROOT}/shop/d/D.java`]: javaClass(
          'shop.d',
          'D',
          '  private static int unused() { return 1; }\n',
        ),
      }),
    ).toEqual([]);
    expect(
      readJvmReuseFindings(
        project({
          [`orders/${JAVA_ROOT}/shop/Orders.java`]: javaClass('shop', 'Orders', CLEAN),
          [`billing/${JAVA_ROOT}/shop/Billing.java`]: javaClass('shop', 'Billing', CLEAN),
        }),
        { projects: twoModules },
      ),
    ).toEqual([]);
  });

  it('reports Kotlin top-level functions and exported literal constants, and honours exceptions', () => {
    const file = (packageName) =>
      `package ${packageName}\n\nconst val TAX_RATE = 0.2\n\nfun rounded(x: Double) = Math.round(x * 100) / 100.0\n\nfun total(x: Double) = rounded(x * TAX_RATE)\n`;
    const files = {
      [`${KOTLIN_ROOT}/shop/a/Money.kt`]: file('shop.a'),
      [`${KOTLIN_ROOT}/shop/b/Money.kt`]: file('shop.b'),
    };

    expect(
      rows(findings(files, { kotlin: true })).map(([, file, identity]) => `${file} ${identity}`),
    ).toEqual([
      `${KOTLIN_ROOT}/shop/a/Money.kt duplicate:rounded`,
      `${KOTLIN_ROOT}/shop/a/Money.kt duplicate:TAX_RATE`,
      `${KOTLIN_ROOT}/shop/b/Money.kt duplicate:rounded`,
      `${KOTLIN_ROOT}/shop/b/Money.kt duplicate:TAX_RATE`,
    ]);
    const policy = {
      exceptions: [{ rule: 'duplicate-definition', paths: [`${KOTLIN_ROOT}/shop/b/**`] }],
    };

    expect(findings(files, { kotlin: true, policy })).toEqual([]);
  });
});

describe('duplicate-definition keys', () => {
  it('tells apart copies that name different library types, own state or other base classes', () => {
    const use = (name) => `  int ${name.toLowerCase()}() { return 1; }\n`;
    const files = {
      [`${JAVA_ROOT}/shop/a/A.java`]: javaClass(
        'shop.a',
        'A',
        `  public static String f(Date x) { return x.toString(); }\n${use('A')}`,
        'import java.util.Date;\n\n',
      ),
      [`${JAVA_ROOT}/shop/b/B.java`]: javaClass(
        'shop.b',
        'B',
        `  public static String f(Date x) { return x.toString(); }\n${use('B')}`,
        'import java.sql.Date;\n\n',
      ),
      [`${JAVA_ROOT}/shop/c/C.java`]: javaClass(
        'shop.c',
        'C',
        '  private static int counter;\n  private static int next() { return ++counter; }\n  int a() { return next(); }\n',
      ),
      [`${JAVA_ROOT}/shop/d/D.java`]: javaClass(
        'shop.d',
        'D',
        '  private static int counter;\n  private static int next() { return ++counter; }\n  int a() { return next(); }\n',
      ),
      [`${JAVA_ROOT}/shop/use/Use.java`]: javaClass(
        'shop.use',
        'Use',
        '  void run() { shop.a.A.f(null); shop.b.B.f(null); }\n',
      ),
      [`${JAVA_ROOT}/shop/e/E.java`]:
        'package shop.e;\n\nclass E extends BaseE {\n  private static int twice() { return LIMIT * 2; }\n  int a() { return twice(); }\n}\n',
      [`${JAVA_ROOT}/shop/f/F.java`]:
        'package shop.f;\n\nclass F extends BaseF {\n  private static int twice() { return LIMIT * 2; }\n  int a() { return twice(); }\n}\n',
    };

    expect(findings(files)).toEqual([]);
  });
});

describe('exported-name-collision on Java and Kotlin', () => {
  const MONEY = {
    [`${JAVA_ROOT}/shop/money/Money.java`]: javaClass(
      'shop.money',
      'Money',
      '  public int cents;\n',
    ),
    [`${JAVA_ROOT}/shop/billing/Money.java`]: javaClass(
      'shop.billing',
      'Money',
      '  public long amount;\n',
    ),
  };

  it('reports a Java class imported while another class of its name is written fully qualified', () => {
    const found = findings({
      ...MONEY,
      [`${JAVA_ROOT}/shop/orders/Orders.java`]: javaClass(
        'shop.orders',
        'Orders',
        '  Object both() { return new Money().cents + new shop.billing.Money().amount; }\n',
        'import shop.money.Money;\n\n',
      ),
    });

    expect(rows(found)).toEqual([
      ['exported-name-collision', `${JAVA_ROOT}/shop/billing/Money.java`, 'collision:Money'],
      ['exported-name-collision', `${JAVA_ROOT}/shop/money/Money.java`, 'collision:Money'],
    ]);
    expect(found[0].message).toBe(
      [
        `Money is also exported by ${JAVA_ROOT}/shop/money/Money.java;`,
        `${JAVA_ROOT}/shop/orders/Orders.java imports both.`,
        'Rename one, or use both by their fully qualified names.',
        exceptionHint('exported-name-collision', `${JAVA_ROOT}/shop/billing/Money.java`),
      ].join(' '),
    );
  });

  it('reports a Kotlin import alias, but not same-named functions, which overload', () => {
    const found = findings(
      {
        ...MONEY,
        [`${KOTLIN_ROOT}/shop/fmt/F.kt`]: 'package shop.fmt\n\nfun format(x: Int) = x.toString()\n',
        [`${KOTLIN_ROOT}/shop/other/G.kt`]: 'package shop.other\n\nfun format(x: String) = x\n',
        [`${KOTLIN_ROOT}/shop/use/Use.kt`]: [
          'package shop.use',
          '',
          'import shop.money.Money',
          'import shop.billing.Money as BillingMoney',
          'import shop.fmt.format',
          'import shop.other.format',
          '',
          'fun use() = listOf(Money(), BillingMoney(), format(1), format("x"))',
          '',
        ].join('\n'),
      },
      { kotlin: true },
    );

    expect(rows(found).map(([rule, file]) => `${rule} ${file}`)).toEqual([
      `exported-name-collision ${JAVA_ROOT}/shop/billing/Money.java`,
      `exported-name-collision ${JAVA_ROOT}/shop/money/Money.java`,
    ]);
    expect(found[0].message).toBe(
      [
        `Money is also exported by ${JAVA_ROOT}/shop/money/Money.java;`,
        `${KOTLIN_ROOT}/shop/use/Use.kt imports both. Rename one, or alias both imports.`,
        exceptionHint('exported-name-collision', `${JAVA_ROOT}/shop/billing/Money.java`),
      ].join(' '),
    );
  });

  it('lets an import shadow a same-package class of that name, as javac does', () => {
    expect(
      findings({
        ...MONEY,
        [`${JAVA_ROOT}/shop/billing/Invoice.java`]: javaClass(
          'shop.billing',
          'Invoice',
          '  Object total() { return new Money(); }\n',
          'import shop.money.Money;\n\n',
        ),
      }),
    ).toEqual([]);
  });
});

describe('sibling-copy-edit on Java and Kotlin', () => {
  const TOTAL = `  public static int total(int a, int b, int c) {
    int sum = a + b + c;
    if (sum > 100) {
      return sum - 10;
    }
    return sum;
  }
`;
  const edited = TOTAL.replace('sum - 10', 'sum - 20');

  function headAndBase(headFiles, baseFiles) {
    return { head: project(headFiles), base: project(baseFiles) };
  }

  it('reports a method edited in one class while its copy in another stays as it was', () => {
    const base = {
      [`${JAVA_ROOT}/shop/a/A.java`]: javaClass('shop.a', 'A', TOTAL),
      [`${JAVA_ROOT}/shop/b/B.java`]: javaClass('shop.b', 'B', TOTAL),
    };
    const { head, base: baselineRoot } = headAndBase(
      { ...base, [`${JAVA_ROOT}/shop/a/A.java`]: javaClass('shop.a', 'A', edited) },
      base,
    );
    const policy = { baseline: { snapshot: 'head' }, baselineRoot };

    expect(rows(readJvmReuseFindings(head, { projects: SINGLE, policy }))).toEqual([
      ['sibling-copy-edit', `${JAVA_ROOT}/shop/a/A.java`, 'sibling-copy:A.total'],
    ]);
    expect(readJvmReuseFindings(head, { projects: SINGLE })).toEqual([]);
    expect(
      readJvmReuseFindings(head, {
        projects: SINGLE,
        policy: { baseline: { snapshot: 'base' }, baselineRoot },
      }),
    ).toEqual([]);
  });

  it('follows a renamed file to its base copy through the moves file', () => {
    const { head, base } = headAndBase(
      {
        [`${JAVA_ROOT}/shop/a/Renamed.java`]: javaClass('shop.a', 'A', edited),
        [`${JAVA_ROOT}/shop/b/B.java`]: javaClass('shop.b', 'B', TOTAL),
      },
      {
        [`${JAVA_ROOT}/shop/a/A.java`]: javaClass('shop.a', 'A', TOTAL),
        [`${JAVA_ROOT}/shop/b/B.java`]: javaClass('shop.b', 'B', TOTAL),
      },
    );
    const movesRoot = project({
      'moves.json': JSON.stringify([
        [`${JAVA_ROOT}/shop/a/A.java`, `${JAVA_ROOT}/shop/a/Renamed.java`],
      ]),
    });
    const policy = { baseline: { snapshot: 'head' }, baselineRoot: base };

    expect(readJvmReuseFindings(head, { projects: SINGLE, policy })).toEqual([]);
    expect(
      rows(
        readJvmReuseFindings(head, {
          projects: SINGLE,
          policy: { ...policy, baselineMovesFile: path.join(movesRoot, 'moves.json') },
        }),
      ),
    ).toEqual([['sibling-copy-edit', `${JAVA_ROOT}/shop/a/Renamed.java`, 'sibling-copy:A.total']]);
  });
});

describe('jvmReuseFacts', () => {
  it('lists the production sources of every module once, skipping build output and excluded files', () => {
    const root = project({
      [`app/${JAVA_ROOT}/shop/App.java`]: javaClass(
        'shop',
        'App',
        '  public static void main(String[] a) {}\n',
      ),
      [`app/${JAVA_ROOT}/shop/Skipped.java`]: javaClass('shop', 'Skipped', ''),
      [`app/build/generated/shop/Gen.java`]: javaClass('shop', 'Gen', ''),
    });
    const projects = [
      {
        qualifier: 'app',
        sourceRoots: [`app/${JAVA_ROOT}`, `app/${JAVA_ROOT}`, 'app/build/generated'],
      },
    ];

    const facts = jvmReuseFacts(root, { projects, exclude: ['**/Skipped.java'] });

    expect([facts.modules, facts.packages, facts.imports]).toEqual([
      [{ file: `app/${JAVA_ROOT}/shop/App.java`, role: 'production', entry: true }],
      [{ root: 'app', published: false }],
      [],
    ]);
  });
});
