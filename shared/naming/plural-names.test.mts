import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pluralsOf } from './plural-names.mts';
import { group } from './test-support/match-group.mts';

function byText(left: string[], right: string[]): number {
  const [a, b] = [String(left), String(right)];
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

describe('plural names', () => {
  it.each([
    ['tag', ['tags', 'tages']],
    ['box', ['boxs', 'boxes']],
    ['category', ['categorys', 'categoryes', 'categories']],
    ['key', ['keys', 'keyes']],
    ['child', ['childs', 'childes', 'children']],
    ['selectedChild', ['selectedChilds', 'selectedChildes', 'selectedChildren']],
    ['sub_index', ['sub_indexs', 'sub_indexes', 'sub_indices']],
    ['Person', ['Persons', 'Persones', 'People']],
  ])('names the plurals of %s', (name, plurals) => {
    expect(pluralsOf(name)).toEqual(plurals);
  });

  it('reads an irregular word only as the last word of the name', () => {
    expect(pluralsOf('human')).toEqual(['humans', 'humanes']);
    expect(pluralsOf('chairman')).toEqual(['chairmans', 'chairmanes']);
    expect(pluralsOf('chairMan')).toEqual(['chairMans', 'chairManes', 'chairMen']);
  });

  it('knows the irregular plurals the Java and Python rules know', () => {
    const root = path.resolve(import.meta.dirname, '../..');
    const read = (file: string): string => readFileSync(path.join(root, file), 'utf8');
    const javaList = group(
      /\$irregular := \(([^)]*)\)/u,
      read('languages/java/gradle/pmd-main-ruleset.xml'),
    );
    const pythonTable = group(
      /IRREGULAR_PLURALS = \{([^}]*)\}/u,
      read('languages/python/rules/review/fields.py'),
    );
    const javaPairs = [...javaList.matchAll(/'(\w+):(\w+)'/gu)].map(([, one = '', many = '']) => [
      one,
      many,
    ]);
    const pythonPairs = [...pythonTable.matchAll(/"(\w+)": \(([^)]*)\)/gu)].flatMap(
      ([, one = '', many = '']) =>
        [...many.matchAll(/"(\w+)"/gu)].map(([, plural = '']) => [one, plural]),
    );
    const missing = (pairs: string[][]): string[][] =>
      pairs.filter(([one = '', many = '']) => !pluralsOf(one).includes(many));

    expect(javaPairs.toSorted(byText)).toEqual(pythonPairs.toSorted(byText));
    expect(javaPairs).toHaveLength(16);
    expect(missing(javaPairs)).toEqual([]);
  });
});
