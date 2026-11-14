import { beforeAll, describe, expect, it } from 'vitest';
import { findNearDuplicates } from '../../../../../shared/near-duplicates/engine.mjs';
import { kotlinParser } from '../test-support/parse-jvm.mjs';
import { KOTLIN_COPIES, KOTLIN_FORMS } from './test-support/kotlin-sources.mjs';

const parsers = [];

beforeAll(async () => {
  parsers.push(await kotlinParser());
});

function unitsOf(text, file) {
  return parsers[0](text, file);
}

function findingFor(name) {
  return findNearDuplicates(unitsOf(KOTLIN_COPIES, 'Prices.kt')).find(({ units }) =>
    units.some((unit) => unit.includes(`.${name}(`)),
  );
}

function holes(finding) {
  return finding.parameters.map(({ kind, a, b }) => [kind, a.text ?? a.value, b.text ?? b.value]);
}

function namesIn(tree) {
  const pending = [tree];
  for (const node of pending) {
    pending.push(...node.children);
  }
  return [
    ...new Set(pending.filter((node) => node.kind === 'name').map(({ value }) => value)),
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
    const unit = unitsOf(KOTLIN_COPIES, 'Prices.kt').find(({ name }) => name.includes('.save('));

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

  it('skips a declaration the grammar cannot parse', () => {
    const units = unitsOf('class A {\n  fun ok() { run() }\n  fun broken() { val = }\n}\n', 'A.kt');

    expect(units.map(({ name }) => name)).toEqual(['A.ok()']);
  });
});
