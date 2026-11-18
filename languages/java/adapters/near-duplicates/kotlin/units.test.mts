import { beforeAll, describe, expect, it } from 'vitest';
import type { ShapeNode, Unit } from '../jvm-types.mts';
import { findNearDuplicates } from '../test-support/engine-views.mts';
import type { NearFinding } from '../test-support/engine-views.mts';
import { kotlinParser, type JvmParser } from '../test-support/parse-jvm.mts';
import { holes, shapeNodesOf } from '../test-support/shape-views.mts';
import { present } from '../tree/nodes.mts';
import { KOTLIN_COPIES, KOTLIN_FORMS } from './test-support/kotlin-sources.mts';

const parsers: JvmParser[] = [];

beforeAll(async () => {
  parsers.push(await kotlinParser());
});

function unitsOf(text: string, file: string): Unit[] {
  return present(parsers[0])(text, file);
}

function findingFor(name: string): NearFinding {
  return present(
    findNearDuplicates(unitsOf(KOTLIN_COPIES, 'Prices.kt')).find(({ units }) =>
      units.some((unit) => unit.includes(`.${name}(`)),
    ),
  );
}

function namesIn(tree: ShapeNode): string[] {
  return [
    ...new Set(
      shapeNodesOf(tree)
        .filter((node) => node.kind === 'name')
        .map(({ value }) => present(value)),
    ),
  ].toSorted((left, right) => left.localeCompare(right));
}

describe('Kotlin trees for near-duplicate detection', () => {
  it('reports a copied function calling a different helper as parameterizable', () => {
    const finding = findingFor('sumWeights');

    expect(finding.verdict).toBe('parameterizable');
    expect(finding.units).toEqual([
      'Prices.kt#Prices.sumWeights(List<Item>)',
      'Prices.kt#Prices.addWeights(List<Item>)',
    ]);
    expect(holes(finding)).toEqual([['value', 'normalize', 'round']]);
  });

  it('reads string templates, lambdas and imported aliases', () => {
    const finding = findingFor('save');
    const unit = present(
      unitsOf(KOTLIN_COPIES, 'Prices.kt').find(({ name }) => name.includes('.save(')),
    );

    expect(holes(finding)).toEqual([['value', 'saved ', 'stored ']]);
    expect(namesIn(unit.tree)).toEqual([
      'a.b.Store',
      'it',
      'row',
      'rows',
      'shop.Prices#log',
      'unique',
      'valid',
    ]);
  });

  it('reports a type-only difference as type parameters', () => {
    expect(holes(findingFor('maxFloat'))).toEqual([
      ['type', 'Double', 'Float'],
      ['type', 'Array<Double>', 'Array<Float>'],
    ]);
  });

  it('names constructors, accessors, lambda properties, companions and extensions', () => {
    const units = unitsOf(KOTLIN_FORMS, 'Box.kt');

    expect(units.map(({ id, start, end }) => [id, start, end])).toEqual([
      ['Box.kt#Box.<init>(String)', 5, 7],
      ['Box.kt#Box.get doubled', 10, 10],
      ['Box.kt#Box.set label', 13, 15],
      ['Box.kt#Box.onClose', 17, 17],
      ['Box.kt#Box.Companion.of(Int)', 20, 20],
      ['Box.kt#Box.load(String,Int)', 23, 23],
      ['Box.kt#Box.load(java.nio.file.Path)', 24, 24],
      ['Box.kt#String.shout()', 28, 28],
    ]);
  });

  it('reads identifiers named like Object members as plain names', () => {
    const source =
      'class A {\n  fun f(constructor: Int, toString: Int) = constructor + toString\n}\n';
    const unit = present(unitsOf(source, 'A.kt').at(0));

    expect(namesIn(unit.tree)).toEqual(['constructor', 'toString']);
  });

  it('skips a declaration the grammar cannot parse', () => {
    const units = unitsOf('class A {\n  fun ok() { run() }\n  fun broken() { val = }\n}\n', 'A.kt');

    expect(units.map(({ name }) => name)).toEqual(['A.ok()']);
  });
});
