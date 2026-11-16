import { describe, expect, it } from 'vitest';
import { declaredMoves } from './declared-moves.mjs';
import { declaredPackage } from './declared-package.mjs';

function movesOf(files) {
  const renames = new Map(files.map(({ from, to }) => [from, to]));
  return declaredMoves({
    renames,
    baseTexts: new Map(files.map(({ from, before }) => [from, before])),
    headTexts: new Map(files.map(({ to, after }) => [to, after])),
  });
}

describe('the package a source file declares', () => {
  it.each([
    ['package shop.service;\nclass A {}', 'shop.service'],
    ['/* package fake.one; */\n// package fake.two\npackage shop.audit\nclass A', 'shop.audit'],
    ['package `shop`.`in`\nclass A', 'shop.in'],
    ['class Root {}', ''],
  ])('reads %j as %j', (text, expected) => {
    expect(declaredPackage(text)).toBe(expected);
  });

  it('reports nothing for a file it could not read', () => {
    expect(declaredPackage(undefined)).toBeUndefined();
    expect(declaredPackage('\u0000\u0001binary')).toBeUndefined();
    expect(declaredPackage('class A { String s = "�"; }')).toBeUndefined();
  });

  it.each([
    ['@Deprecated package foo.bar;\nclass A {}', 'foo.bar'],
    ['@Anno("/*") @Other(a = "x")\npackage real.one;\n', 'real.one'],
    ['@file:JvmName("A")\npackage k.l\n', 'k.l'],
    ['package a\npackage b\nclass A', 'a.b'],
    ['package a\npackage object b\n', 'a'],
    ['package object x\n', ''],
    ['class A { String s = """\npackage fake.one;\n"""; }', ''],
    ['import a.B;\npackage not.a.clause;', ''],
    ['package a {\n class A }', undefined],
  ])('reads only the package clause before the first declaration of %j', (text, expected) => {
    expect(declaredPackage(text)).toBe(expected);
  });
});

describe('names of moved JVM sources, from the packages they declare', () => {
  it('maps a default-package class into a package and back', () => {
    const moves = movesOf([
      {
        from: 'src/main/java/Root.java',
        to: 'src/main/java/shop/Root.java',
        before: 'class Root {}',
        after: 'package shop;\nclass Root {}',
      },
      {
        from: 'src/main/java/shop/Leaf.java',
        to: 'src/main/java/Leaf.java',
        before: 'package shop;\nclass Leaf {}',
        after: 'class Leaf {}',
      },
    ]);

    expect(moves.bare.get('src/main/java/Root.java')).toEqual(['Root', 'shop.Root']);
    expect(moves.names.get('shop.Leaf')).toBe('Leaf');
  });

  it('follows the declared package when the folders omit the common root', () => {
    const moves = movesOf([
      {
        from: 'src/main/kotlin/com/acme/shop/service/Audit.kt',
        to: 'src/main/kotlin/com/acme/shop/audit/Audit.kt',
        before: 'package shop.service\nclass Audit',
        after: 'package shop.audit\nclass Audit',
      },
    ]);

    expect([...moves.names]).toEqual([
      ['shop.service.Audit', 'shop.audit.Audit'],
      ['shop.service.AuditKt', 'shop.audit.AuditKt'],
    ]);
    expect([...moves.filePackages.get('src/main/kotlin/com/acme/shop/service/Audit.kt')]).toEqual([
      ['shop.service', 'shop.audit'],
    ]);
  });

  it('maps nothing when a file moved folders and kept its package line', () => {
    const moves = movesOf([
      {
        from: 'src/main/java/shop/service/Audit.java',
        to: 'src/main/java/shop/audit/Audit.java',
        before: 'package shop.service;\nclass Audit {}',
        after: 'package shop.service;\nclass Audit {}',
      },
    ]);

    expect(moves.names.size + moves.bare.size).toBe(0);
    expect(moves.covered.has('src/main/java/shop/service/Audit.java')).toBe(true);
  });

  it('leaves a file alone when a blob could not be read', () => {
    const moves = declaredMoves({
      renames: new Map([['src/A.java', 'src/b/A.java']]),
      baseTexts: new Map(),
      headTexts: new Map(),
    });

    expect(moves.covered.size).toBe(0);
  });
});
