import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pluralsOf } from './plural-names.mjs';

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
    const read = (file) => readFileSync(path.join(root, file), 'utf8');
    const javaList = /\$irregular := \(([^)]*)\)/u.exec(
      read('languages/java/gradle/pmd-main-ruleset.xml'),
    )[1];
    const pythonTable = /IRREGULAR_PLURALS = \{([^}]*)\}/u.exec(
      read('languages/python/rules/review/fields.py'),
    )[1];
    const javaPairs = [...javaList.matchAll(/'(\w+):(\w+)'/gu)].map(([, one, many]) => [one, many]);
    const pythonPairs = [...pythonTable.matchAll(/"(\w+)": \(([^)]*)\)/gu)].flatMap(
      ([, one, many]) => [...many.matchAll(/"(\w+)"/gu)].map(([, plural]) => [one, plural]),
    );
    const missing = (pairs) => pairs.filter(([one, many]) => !pluralsOf(one).includes(many));

    expect(javaPairs.toSorted()).toEqual(pythonPairs.toSorted());
    expect(javaPairs).toHaveLength(16);
    expect(missing(javaPairs)).toEqual([]);
  });
});
