import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ShapeNode, Unit } from '../jvm-types.mts';
import { findNearDuplicates, readJvmUnits } from '../test-support/engine-views.mts';
import type { NearFinding } from '../test-support/engine-views.mts';
import { JAVA_COPIES, JAVA_FORMS } from './test-support/java-sources.mts';
import { javaParser, type JvmParser } from '../test-support/parse-jvm.mts';
import { holes, shapeNodesOf } from '../test-support/shape-views.mts';
import { present } from './nodes.mts';

const parsers: JvmParser[] = [];

beforeAll(async () => {
  parsers.push(await javaParser());
});

function unitsOf(text: string, file = 'Adapters.java'): Unit[] {
  return present(parsers[0])(text, file);
}

function findingFor(findings: readonly NearFinding[], name: string): NearFinding {
  return present(findings.find(({ units }) => units.some((unit) => unit.includes(`.${name}`))));
}

function nameValues(tree: ShapeNode, text: string): (string | undefined)[] {
  return [
    ...new Set(
      shapeNodesOf(tree)
        .filter((node) => node.text === text)
        .map(({ value }) => value),
    ),
  ];
}

describe('Java trees for near-duplicate detection', () => {
  it('reports a copied method with one literal changed as parameterizable', () => {
    const finding = findingFor(findNearDuplicates(unitsOf(JAVA_COPIES)), 'URL_ADAPTER');

    expect(finding.verdict).toBe('parameterizable');
    expect(finding.units).toEqual([
      'Adapters.java#Adapters.SAFE_URL_ADAPTER.read(JsonReader)',
      'Adapters.java#Adapters.URL_ADAPTER.read(JsonReader)',
    ]);
    expect(holes(finding)).toEqual([['value', '"read safe url"', '"read url"']]);
  });

  it('reports a copied method calling a different helper, and shares fields of the class', () => {
    const finding = findingFor(findNearDuplicates(unitsOf(JAVA_COPIES)), 'sumWeights');

    expect(finding.verdict).toBe('parameterizable');
    expect(holes(finding)).toEqual([['value', 'normalize', 'round']]);
    expect(present(finding.parameters[0]).a.value).toBe('#normalize()');
    const unit = present(
      unitsOf(JAVA_COPIES).find(({ name }) => name.startsWith('Adapters.sumWeights')),
    );
    expect(nameValues(unit.tree, 'reads')).toEqual(['com.example.adapters.Adapters#reads']);
  });

  it('reports a type-only difference as one type parameter', () => {
    const finding = findingFor(findNearDuplicates(unitsOf(JAVA_COPIES)), 'maxFloat');

    expect(finding.verdict).toBe('parameterizable');
    expect(new Set(finding.parameters.map(({ kind }) => kind))).toEqual(new Set(['type']));
  });

  it('reports a statement run shared by two methods', () => {
    const finding = findingFor(findNearDuplicates(unitsOf(JAVA_COPIES)), 'importUsers');

    expect(finding.verdict).toBe('partial-run');
    expect(finding.run).toHaveLength(2);
  });

  it('names methods by their parameter types and finds every body form', () => {
    expect(unitsOf(JAVA_FORMS, 'Forms.java').map(({ name }) => name)).toEqual([
      'Forms.onClose',
      'Forms.<init>()',
      'Forms.<init>(int)',
      'Forms.load(String)',
      'Forms.load(java.nio.file.Path)',
      'Forms.Mode.ON.run()',
      'Forms.Point.<init>()',
      'Forms.Shape.area()',
    ]);
  });

  describe('through the parser process', () => {
    const roots: string[] = [];

    beforeAll(() => {
      roots.push(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-trees-')));
      writeFileSync(path.join(present(roots[0]), 'Adapters.java'), JAVA_COPIES);
    });

    afterAll(() => {
      rmSync(present(roots[0]), { recursive: true, force: true });
    });

    it('gives the same units as parsing in this process', () => {
      expect(readJvmUnits(present(roots[0]), ['Adapters.java'])).toEqual(unitsOf(JAVA_COPIES));
    });
  });
});
