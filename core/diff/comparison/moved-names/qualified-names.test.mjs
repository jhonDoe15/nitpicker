import { describe, expect, it } from 'vitest';
import { packageMoves, qualifiedNameMoves, remapQualifiedNames } from './qualified-names.mjs';

const MOVED = new Map([
  ['src/main/java/shop/service/Audit.java', 'src/main/java/shop/audit/Audit.java'],
  ['src/main/java/shop/service/Request.java', 'src/main/java/shop/audit/web/Request.java'],
]);

function remapped(text, renames = MOVED) {
  return remapQualifiedNames(text, qualifiedNameMoves(renames));
}

describe('qualified names of moved sources', () => {
  it('maps a moved class by its package, keeping members, nested classes and descriptors', () => {
    expect(remapped('class:shop.service.Audit')).toBe('class:shop.audit.Audit');
    expect(remapped('shop.service.Audit$Entry#agent(Lshop/service/Request;I)V')).toBe(
      'shop.audit.Audit$Entry#agent(Lshop/audit/web/Request;I)V',
    );
    expect(remapped('test:shop.service.Audit.Nested#runs')).toBe(
      'test:shop.audit.Audit.Nested#runs',
    );
  });

  it('leaves classes that did not move, and longer names that only start the same', () => {
    expect(remapped('shop.service.AuditTest shop.service.Stays java.util.List')).toBe(
      'shop.service.AuditTest shop.service.Stays java.util.List',
    );
    expect(remapped('other.shop.service.Audit')).toBe('other.shop.service.Audit');
  });

  it('follows a class rename and a move to another module', () => {
    const renames = new Map([
      ['app/src/main/java/shop/Old.java', 'core/src/main/java/shop/billing/New.java'],
    ]);

    expect(remapped('class:shop.Old', renames)).toBe('class:shop.billing.New');
  });

  it('maps Kotlin file facades and Python modules and packages', () => {
    const renames = new Map([
      ['src/main/kotlin/shop/service/Prices.kt', 'src/main/kotlin/shop/pricing/Prices.kt'],
      ['src/shop/service/tax.py', 'src/shop/billing/tax.py'],
      ['src/shop/legacy/__init__.py', 'src/shop/old/__init__.py'],
    ]);

    expect(remapped('shop.service.PricesKt#total', renames)).toBe('shop.pricing.PricesKt#total');
    expect(remapped('module-cycle:shop.service.tax', renames)).toBe(
      'module-cycle:shop.billing.tax',
    );
    expect(remapped('cycle:shop.legacy', renames)).toBe('cycle:shop.old');
  });

  it('drops a name two moves give different destinations', () => {
    const renames = new Map([
      ['a/src/main/java/shop/Util.java', 'a/src/main/java/shop/one/Util.java'],
      ['b/src/main/java/shop/Util.java', 'b/src/main/java/shop/two/Util.java'],
    ]);

    expect(remapped('class:shop.Util', renames)).toBe('class:shop.Util');
  });

  it('ignores renames of other files and names without a package', () => {
    const renames = new Map([
      ['src/main/java/Root.java', 'src/main/java/shop/Root.java'],
      ['docs/shop/guide.md', 'docs/shop/manual/guide.md'],
    ]);

    expect(remapped('class:Root shop.guide', renames)).toBe('class:Root shop.guide');
  });

  it('maps object types after primitive parameters in descriptors', () => {
    expect(
      remapped('shop.service.Audit#agent(IZLshop/service/Request;JLshop/service/Audit;)V'),
    ).toBe('shop.audit.Audit#agent(IZLshop/audit/web/Request;JLshop/audit/Audit;)V');
  });

  it('follows a move from a flat layout into a src layout, and from Java to Kotlin roots', () => {
    const renames = new Map([
      ['shop/service/tax.py', 'src/shop/billing/tax.py'],
      ['src/main/java/shop/a/Audit.kt', 'src/main/kotlin/shop/b/Audit.kt'],
    ]);

    expect(remapped('module-cycle:shop.service.tax', renames)).toBe(
      'module-cycle:shop.billing.tax',
    );
    expect(remapped('class:shop.a.Audit', renames)).toBe('class:shop.b.Audit');
  });

  it('moves the subject class of a moved file by its package, and only the subject', () => {
    const packages = packageMoves(
      'src/main/kotlin/shop/service/Models.kt',
      'src/main/kotlin/shop/audit/Models.kt',
    );

    expect(
      remapQualifiedNames('shop.service.Order#total(Lshop/service/Stays;)I', new Map(), packages),
    ).toBe('shop.audit.Order#total(Lshop/service/Stays;)I');
    expect(packageMoves('src/main/kotlin/shop/service/Models.kt', undefined).size).toBe(0);
  });
});
