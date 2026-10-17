import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { classNamesIn, splitJdepsEdges } from './jdeps-reports.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const JDEPS = [
  'classes -> java.base',
  'test-classes -> classes',
  '   shop.Cart                 -> java.lang.Object        java.base',
  '   shop.Cart$Line            -> shop.Cart               classes',
  '   shop.CartTest             -> shop.Cart               classes',
  '   shop.CartTest             -> org.junit.jupiter.api.Test not found',
  '',
].join('\n');

describe('splitJdepsEdges', () => {
  it('splits the output of one jdeps run by the side that declares the source class', () => {
    expect(
      splitJdepsEdges(JDEPS, {
        mainClasses: ['shop.Cart', 'shop.Cart$Line'],
        testClasses: ['shop.CartTest'],
      }),
    ).toEqual({
      main: [JDEPS.split('\n')[2], JDEPS.split('\n')[3], ''].join('\n'),
      test: [JDEPS.split('\n')[4], JDEPS.split('\n')[5], ''].join('\n'),
    });
  });

  it('keeps a class both sides declare on the main side', () => {
    const { main, test } = splitJdepsEdges(JDEPS, {
      mainClasses: ['shop.CartTest'],
      testClasses: ['shop.CartTest'],
    });

    expect(main.split('\n').filter(Boolean)).toHaveLength(2);
    expect(test).toBe('');
  });
});

describe('classNamesIn', () => {
  it('lists binary names without module-info and package-info, and nothing for a missing directory', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-jdeps-'));
    roots.push(root);
    for (const name of ['shop/Cart.class', 'shop/Cart$Line.class', 'shop/package-info.class']) {
      mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      writeFileSync(path.join(root, name), '');
    }
    writeFileSync(path.join(root, 'module-info.class'), '');

    expect(classNamesIn(root)).toEqual(['shop.Cart', 'shop.Cart$Line']);
    expect(classNamesIn(path.join(root, 'missing'))).toEqual([]);
  });
});
