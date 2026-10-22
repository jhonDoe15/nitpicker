import { describe, expect, it } from 'vitest';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { packageCycleFindings } from './package-cycles.mjs';

function entry(name, file) {
  const index = name.lastIndexOf('.');
  return { name, file, packageName: index < 0 ? '' : name.slice(0, index), qualifier: '' };
}

const ORDER = entry('com.acme.orders.Order', 'src/main/java/com/acme/orders/Order.java');
const LINE = entry('com.acme.orders.Line', 'src/main/kotlin/com/acme/orders/Line.kt');
const INVOICE = entry('com.acme.billing.Invoice', 'src/main/java/com/acme/billing/Invoice.java');
const MAIN = entry('Main', 'src/main/java/Main.java');
const CLASSES = [ORDER, LINE, INVOICE, MAIN];

describe('packageCycleFindings', () => {
  it('reports each package of a cycle once, on its first file, with a cycle identity', () => {
    const found = packageCycleFindings({
      classes: CLASSES,
      edges: [
        { source: LINE, target: INVOICE },
        { source: INVOICE, target: ORDER },
        { source: ORDER, target: LINE },
      ],
    });

    expect(found.map(({ rule, path, identity }) => [rule, path, identity])).toEqual([
      ['package-cycle', INVOICE.file, 'cycle:com.acme.billing'],
      ['package-cycle', ORDER.file, 'cycle:com.acme.orders'],
    ]);
    expect(found[0]).toMatchObject({ tool: 'coupling', classification: 'enforceable' });
    expect(found[0].message).toBe(
      `Keep dependencies between packages one-way: package com.acme.billing is in a dependency cycle with com.acme.orders. Move the shared types down into one of them, or invert one dependency behind an interface. ${exceptionHint('coupling/package-cycle', 'src/main/java/com/acme/billing/*')}`,
    );
  });

  it('names the default package (root) and leaves out the edges another rule already reports', () => {
    const edges = [
      { source: MAIN, target: INVOICE },
      { source: INVOICE, target: MAIN },
    ];

    expect(
      packageCycleFindings({ classes: CLASSES, edges }).map(({ identity }) => identity),
    ).toEqual(['cycle:(root)', 'cycle:com.acme.billing']);
    expect(
      packageCycleFindings({ classes: CLASSES, edges }, new Set([`${INVOICE.file}\0${MAIN.file}`])),
    ).toEqual([]);
  });

  it('reports nothing for classes of one package that use each other', () => {
    expect(
      packageCycleFindings({
        classes: CLASSES,
        edges: [
          { source: ORDER, target: LINE },
          { source: LINE, target: ORDER },
        ],
      }),
    ).toEqual([]);
  });
});
