import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findNearDuplicates } from '../../../../../shared/near-duplicates/engine.mjs';
import { readJavaUnits } from '../java-trees.mjs';
import { JAVA_COPIES, JAVA_FORMS } from './test-support/java-sources.mjs';
import { javaParser } from './test-support/parse-java.mjs';

const parsers = [];

beforeAll(async () => {
  parsers.push(await javaParser());
});

function unitsOf(text, file = 'Adapters.java') {
  return parsers[0](text, file);
}

function findingFor(findings, name) {
  return findings.find(({ units }) => units.some((unit) => unit.includes(`.${name}`)));
}

function nameValues(tree, text) {
  const pending = [tree];
  for (const node of pending) {
    pending.push(...node.children);
  }
  return [...new Set(pending.filter((node) => node.text === text).map(({ value }) => value))];
}

function holes(finding) {
  return finding.parameters.map(({ kind, a, b }) => [kind, a.text ?? a.value, b.text ?? b.value]);
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
    expect(finding.parameters[0].a.value).toBe('#normalize()');
    const unit = unitsOf(JAVA_COPIES).find(({ name }) => name.startsWith('Adapters.sumWeights'));
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
    const roots = [];

    beforeAll(() => {
      roots.push(mkdtempSync(path.join(tmpdir(), 'nitpicker-java-trees-')));
      writeFileSync(path.join(roots[0], 'Adapters.java'), JAVA_COPIES);
    });

    afterAll(() => {
      rmSync(roots[0], { recursive: true, force: true });
    });

    it('gives the same units as parsing in this process', () => {
      expect(readJavaUnits(roots[0], ['Adapters.java'])).toEqual(unitsOf(JAVA_COPIES));
    });
  });
});
