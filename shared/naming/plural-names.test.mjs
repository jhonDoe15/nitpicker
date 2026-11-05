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
    expect(pluralsOf('chairMan')).toContain('chairMen');
  });
});
