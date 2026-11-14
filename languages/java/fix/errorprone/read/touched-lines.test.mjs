import { describe, expect, it } from 'vitest';
import { touchedByFile, touchedLinesOf } from './touched-lines.mjs';

describe('touchedLinesOf', () => {
  it('numbers the lines of the live text that differ from the base, from one', () => {
    expect(touchedLinesOf('a\nb\nc\nd\n', 'a\nB\nc\nd\ne\n')).toEqual(new Set([2, 5]));
  });

  it('is empty when nothing changed', () => {
    expect(touchedLinesOf('a\n', 'a\n')).toEqual(new Set());
  });
});

describe('touchedByFile', () => {
  const files = [{ path: 'Old.java' }, { path: 'New.java' }];
  const baseSources = new Map([
    ['Old.java', 'a\nb\n'],
    ['New.java', undefined],
  ]);
  const live = new Map([
    ['Old.java', 'a\nc\n'],
    ['New.java', 'x\n'],
  ]);

  it('takes every line of a file that has no base', () => {
    const touched = touchedByFile({ files, baseSources, live, allFiles: false });

    expect(touched.get('Old.java')).toEqual(new Set([2]));
    expect(touched.get('New.java')).toBe('all');
  });

  it('takes every line of every file in an all-files run', () => {
    const touched = touchedByFile({ files, baseSources, live, allFiles: true });

    expect([...touched.values()]).toEqual(['all', 'all']);
  });
});
