import { describe, expect, it } from 'vitest';
import { javaExtractNearDuplicateRecipe as recipe } from '../near-duplicate-extract.mjs';
import { filesOf } from '../test-support/cross-sources.mjs';

function reasons(files) {
  const { fixes, notes } = recipe.plan({ files, projectRoot: '/nonexistent' });
  return [fixes.length, notes.map((note) => note.split('near-duplicate: ').at(-1))];
}

function both(overrides) {
  return filesOf(overrides, overrides);
}

const FINAL = 'a field the copies read is not final';
const LOCK = 'a copy uses this or super other than as the lock of a synchronized block';

describe('javaExtractNearDuplicateRecipe declines copies in two files', () => {
  it.each([
    ['a non-final field', both({ field: 'private DateFormat format' }), FINAL],
    ['this used outside a lock', both({ call: 'this.format.setTimeZone(zone);' }), LOCK],
    [
      'fields of different types',
      filesOf({}, { field: 'private final SimpleDateFormat format' }),
      'the fields the copies read have different types',
    ],
    [
      'class names that share no word',
      filesOf({ name: 'Alpha' }, { name: 'Beta' }),
      'the class names of the copies share no word to name a shared class after',
    ],
    ['two packages', filesOf({ package: 'other' }, {}), 'the copies are in different packages'],
  ])('leaves the source alone for %s', (_name, files, reason) => {
    expect(reasons(files)).toEqual([0, [reason]]);
  });

  it.each([
    [
      'a static method of the class',
      { call: 'reset(zone);', extra: '    private static void reset(TimeZone zone) {}\n' },
    ],
    [
      'a static field of the class',
      {
        call: 'format.setTimeZone(ZONE);',
        extra: '    private static final TimeZone ZONE = TimeZone.getDefault();\n',
      },
    ],
    [
      'a nested type',
      {
        call: 'format.setTimeZone(zone); Holder held = null;',
        extra: '    private static final class Holder {}\n',
      },
    ],
  ])('leaves the source alone for %s', (_name, overrides) => {
    const [count, notes] = reasons(both(overrides));
    expect([count, notes.length]).toEqual([0, 1]);
  });

  it('leaves copies in two folders alone', () => {
    const [first, second] = filesOf();
    const moved = [first, { ...second, path: 'src/main/java/demo/sub/SqlTimeAdapter.java' }];
    expect(reasons(moved)).toEqual([0, ['the copies are in different folders']]);
  });
});
