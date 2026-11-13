import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pitRunTargets, scopedPitTargets } from './pit-scope.mjs';

const roots = [];

function utf8(text) {
  const bytes = Buffer.from(text, 'utf8');
  const header = Buffer.alloc(3);
  header[0] = 1;
  header.writeUInt16BE(bytes.length, 1);
  return Buffer.concat([header, bytes]);
}

function u16(...values) {
  const buffer = Buffer.alloc(2 * values.length);
  for (const [index, value] of values.entries()) {
    buffer.writeUInt16BE(value, 2 * index);
  }
  return buffer;
}

function classFile(internalName, sourceFile) {
  return Buffer.concat([
    Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
    u16(0, 65, 5),
    utf8(internalName),
    Buffer.concat([Buffer.from([7]), u16(1)]),
    utf8('SourceFile'),
    utf8(sourceFile),
    u16(0x21, 2, 0, 0, 0, 0),
    u16(1, 3),
    Buffer.from([0, 0, 0, 2]),
    u16(4),
  ]);
}

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pit-scope-'));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  }
  return root;
}

function compiled(name, sourceFile) {
  return { [`classes/${name}.class`]: classFile(name, sourceFile) };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('scopedPitTargets', () => {
  function targetsOf(root, mutationScope, sourceRoots = ['src/main/java', 'src/main/kotlin']) {
    return scopedPitTargets({
      classDirectory: path.join(root, 'classes'),
      sourceRoots: sourceRoots.map((sourceRoot) => path.join(root, sourceRoot)),
      projectRoot: root,
      mutationScope,
    });
  }

  it('keeps the classes compiled from the source files in scope, nested ones included', () => {
    const root = project({
      'src/main/java/shop/orders/Order.java':
        'package shop.orders;\nclass Order {}\nclass Line {}\n',
      'src/main/java/shop/billing/Bill.java': 'package shop.billing;\nclass Bill {}\n',
      ...compiled('shop/orders/Order', 'Order.java'),
      ...compiled('shop/orders/Order$Item', 'Order.java'),
      ...compiled('shop/orders/Line', 'Order.java'),
      ...compiled('shop/orders/package-info', 'package-info.java'),
      ...compiled('shop/billing/Bill', 'Bill.java'),
    });

    expect(targetsOf(root, ['src/main/java/shop/orders'])).toEqual([
      'shop.orders.Line',
      'shop.orders.Order',
      'shop.orders.Order$Item',
    ]);
    expect(targetsOf(root, ['src/main/java/shop/billing/Bill.java'])).toEqual([
      'shop.billing.Bill',
    ]);
  });

  it('matches a Kotlin file by its declared package, not its folder', () => {
    const root = project({
      'src/main/kotlin/orders/Orders.kt':
        '\uFEFF@file:JvmName("Orders") package shop.`orders`\nfun total() = 1\n',
      'src/main/kotlin/other/Other.kt': 'package shop.orders\nclass Other\n',
      ...compiled('shop/orders/OrdersKt', 'Orders.kt'),
      ...compiled('shop/orders/Shipment', 'Orders.kt'),
      ...compiled('shop/orders/Other', 'Other.kt'),
    });

    expect(targetsOf(root, ['src/main/kotlin/orders'])).toEqual([
      'shop.orders.OrdersKt',
      'shop.orders.Shipment',
    ]);
  });

  it('keeps classes of the default package and returns nothing for a scope without sources', () => {
    const root = project({
      'src/main/java/Main.java': 'class Main {}\n',
      'src/test/java/MainTest.java': 'class MainTest {}\n',
      ...compiled('Main', 'Main.java'),
    });

    expect(targetsOf(root, ['src/main'])).toEqual(['Main']);
    expect(targetsOf(root, ['src/test'])).toEqual([]);
  });
});

describe('pitRunTargets', () => {
  it('targets every package without a scope', () => {
    const root = project({
      'src/main/java/shop/Order.java': 'package shop;\nclass Order {}\n',
      ...compiled('shop/Order', 'Order.java'),
    });
    const module = {
      outputDirectory: path.join(root, 'classes'),
      sourceRoots: [path.join(root, 'src/main/java')],
    };

    expect(pitRunTargets(module, { projectRoot: root, mutationScope: undefined })).toEqual([
      'shop.*',
    ]);
    expect(pitRunTargets(module, { projectRoot: root, mutationScope: ['src/main/java'] })).toEqual([
      'shop.Order',
    ]);
  });
});
