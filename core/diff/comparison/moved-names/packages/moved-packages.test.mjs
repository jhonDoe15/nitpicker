import { describe, expect, it } from 'vitest';
import { movedPackages } from './moved-packages.mjs';

function movedWith({ baseFiles, headFiles, renames }) {
  return movedPackages({ baseFiles, headFiles, renames: new Map(renames) });
}

function moved(baseFiles, ...renames) {
  const renamed = new Map(renames);
  return movedWith({
    baseFiles,
    headFiles: baseFiles.map((file) => renamed.get(file) ?? file),
    renames,
  });
}

describe('packages that moved as a whole', () => {
  it.each([
    {
      name: 'every file of it moved to one folder',
      baseFiles: [
        'src/main/java/shop/service/Audit.java',
        'src/main/java/shop/service/Request.java',
        'src/main/java/shop/web/Page.java',
      ],
      renames: [
        ['src/main/java/shop/service/Audit.java', 'src/main/java/shop/audit/Audit.java'],
        ['src/main/java/shop/service/Request.java', 'src/main/java/shop/audit/Request.java'],
      ],
    },
    {
      name: 'all of its source roots moved',
      baseFiles: [
        'src/main/java/shop/service/A.java',
        'src/main/java/shop/service/B.java',
        'src/test/java/shop/service/ATest.java',
        'src/test/java/shop/service/BTest.java',
      ],
      renames: [
        ['src/main/java/shop/service/A.java', 'src/main/java/shop/audit/A.java'],
        ['src/main/java/shop/service/B.java', 'src/main/java/shop/audit/B.java'],
        ['src/test/java/shop/service/ATest.java', 'src/test/java/shop/audit/ATest.java'],
        ['src/test/java/shop/service/BTest.java', 'src/test/java/shop/audit/BTest.java'],
      ],
    },
    {
      name: 'a file that is not a source stayed behind',
      baseFiles: [
        'src/main/java/shop/service/A.java',
        'src/main/java/shop/service/B.java',
        'src/main/java/shop/service/notes.md',
      ],
      renames: [
        ['src/main/java/shop/service/A.java', 'src/main/java/shop/audit/A.java'],
        ['src/main/java/shop/service/B.java', 'src/main/java/shop/audit/B.java'],
      ],
    },
  ])('maps a Java package when $name', ({ baseFiles, renames }) => {
    expect(moved(baseFiles, ...renames).get('shop.service')).toBe('shop.audit');
  });

  it('keeps a package whose files only partly moved, in main or in test', () => {
    const partly = [
      'src/main/java/shop/service/Audit.java',
      'src/main/java/shop/service/Stays.java',
    ];
    const rename = ['src/main/java/shop/service/Audit.java', 'src/main/java/shop/audit/Audit.java'];
    expect(moved(partly, rename).has('shop.service')).toBe(false);

    const withTests = [
      'src/main/java/shop/service/Audit.java',
      'src/test/java/shop/service/AuditTest.java',
    ];
    expect(moved(withTests, rename).has('shop.service')).toBe(false);
  });

  it('drops a package whose files went to different folders', () => {
    const baseFiles = ['src/main/kotlin/shop/service/A.kt', 'src/main/kotlin/shop/service/B.kt'];

    expect(
      moved(
        baseFiles,
        ['src/main/kotlin/shop/service/A.kt', 'src/main/kotlin/shop/one/A.kt'],
        ['src/main/kotlin/shop/service/B.kt', 'src/main/kotlin/shop/two/B.kt'],
      ).has('shop.service'),
    ).toBe(false);
  });

  it('maps a Python namespace package without an __init__ module', () => {
    const baseFiles = ['src/shop/service/tax.py', 'src/shop/service/fees.py'];

    expect(
      moved(
        baseFiles,
        ['src/shop/service/tax.py', 'src/shop/billing/tax.py'],
        ['src/shop/service/fees.py', 'src/shop/billing/fees.py'],
      ).get('shop.service'),
    ).toBe('shop.billing');
  });

  it('maps a TypeScript top folder whose files, nested ones included, all moved', () => {
    const baseFiles = [
      'src/main/orders/a.ts',
      'src/main/orders/domain/b.ts',
      'src/main/billing/c.ts',
    ];

    expect(
      moved(
        baseFiles,
        ['src/main/orders/a.ts', 'src/main/ordering/a.ts'],
        ['src/main/orders/domain/b.ts', 'src/main/ordering/domain/b.ts'],
      ).get('orders'),
    ).toBe('ordering');
  });

  it('keeps a TypeScript folder that kept a file or shares its name with another folder', () => {
    const rename = ['src/main/orders/a.ts', 'src/main/ordering/a.ts'];

    expect(moved(['src/main/orders/a.ts', 'src/main/orders/stays.ts'], rename).has('orders')).toBe(
      false,
    );
    expect(moved(['src/main/orders/a.ts', 'src/test/orders/a.test.ts'], rename).has('orders')).toBe(
      false,
    );
  });

  it('keeps a package that moved into a package the base already had', () => {
    const baseFiles = ['src/main/java/shop/service/A.java', 'src/main/java/shop/audit/B.java'];

    expect(
      moved(baseFiles, [
        'src/main/java/shop/service/A.java',
        'src/main/java/shop/audit/A.java',
      ]).has('shop.service'),
    ).toBe(false);
    expect(
      moved(
        ['src/main/orders/a.ts', 'src/main/ordering/b.ts'],
        ['src/main/orders/a.ts', 'src/main/ordering/a.ts'],
      ).has('orders'),
    ).toBe(false);
  });
});

describe('packages that did not provably move as a whole', () => {
  const service = [
    'src/main/java/shop/service/Audit.java',
    'src/main/java/shop/service/Request.java',
  ];
  const audit = ['src/main/java/shop/audit/Audit.java', 'src/main/java/shop/audit/Request.java'];
  const renames = service.map((file, index) => [file, audit[index]]);

  it('does not infer a move from a single file paired by similarity', () => {
    const lone = ['src/main/java/shop/service/Package.java'];
    expect(
      moved(lone, [lone[0], 'src/main/java/shop/audit/Package.java']).has('shop.service'),
    ).toBe(false);
    const index = ['src/pkg/orders/index.ts'];
    expect(moved(index, [index[0], 'src/pkg/sales/index.ts']).has('orders')).toBe(false);
  });

  it('infers the move once at least two files moved and the old folder is gone', () => {
    expect(moved(service, ...renames).get('shop.service')).toBe('shop.audit');
  });

  it('does not infer a move while the old folder still holds a source file on the head', () => {
    const headFiles = [...audit, 'src/main/java/shop/service/Fresh.java'];

    expect(movedWith({ baseFiles: service, headFiles, renames }).has('shop.service')).toBe(false);
  });
});
