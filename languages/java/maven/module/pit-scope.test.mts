import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { temporaryTrees } from '../../test-support/temporary-trees.mts';
import { u16, utf8 } from '../test-support/class-constants.mts';
import { pitRunTargets, scopedPitTargets } from './pit-scope.mts';

const trees = temporaryTrees('nitpicker-pit-scope-');

function classFile(internalName: string, sourceFile: string): Buffer {
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

function project(files: Readonly<Record<string, string | Buffer>>): string {
  return trees.tree(files);
}

function compiled(name: string, sourceFile: string): Record<string, Buffer> {
  return { [`classes/${name}.class`]: classFile(name, sourceFile) };
}

afterEach(trees.cleanup);

describe('scopedPitTargets', () => {
  function targetsOf(
    root: string,
    mutationScope: unknown,
    sourceRoots: string[] = ['src/main/java', 'src/main/kotlin'],
  ): string[] {
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
