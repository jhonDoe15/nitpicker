import { describe, expect, it } from 'vitest';
import { lineTable, removalRange } from './lines.mjs';
import { propertyAt } from './properties-locate.mjs';
import { yamlAt } from './yaml-locate.mjs';

function span(text, found) {
  return text.slice(found.value.start, found.value.end);
}

describe('lineTable', () => {
  it('keeps offsets across mixed line endings and a byte order mark', () => {
    const text = '\uFEFFa=1\r\nb=2\rc=3\n';
    const table = lineTable(text);

    expect(table.map((line) => line.text)).toEqual(['a=1', 'b=2', 'c=3', '']);
    expect(text.slice(table[1].start, table[1].end)).toBe('b=2');
    expect(table[0].start).toBe(1);
  });
  it('removes the line break before a last line that has none', () => {
    const text = 'a=1\nb=2';
    const table = lineTable(text);
    const range = removalRange(table, 1);

    expect(text.slice(0, range.start) + text.slice(range.end)).toBe('a=1');
  });
});

describe('propertyAt', () => {
  it('finds the value after any separator and spacing', () => {
    const text = 'a.b :  value  \n';
    const found = propertyAt(lineTable(text), 1, { key: 'a.b', value: 'value' });

    expect(span(text, found)).toBe('value');
  });
  it('covers a continued value up to its last line', () => {
    const text = 'a=x\\\n  y\nb=1\n';
    const found = propertyAt(lineTable(text), 1, { key: 'a', value: 'xy' });

    expect([found.first, found.last, span(text, found)]).toEqual([0, 1, 'x\\\n  y']);
  });
  it('refuses a line whose key differs from the entry', () => {
    expect(propertyAt(lineTable('a=1\n'), 1, { key: 'b', value: '1' })).toBeUndefined();
  });
});

describe('yamlAt', () => {
  it('finds plain, quoted and commented values', () => {
    const text = 'a: plain # note\nb: \'two # words\'\nc: "x"\n';
    const table = lineTable(text);

    expect(span(text, yamlAt(table, 1, { key: 'a', value: 'plain' }))).toBe('plain');
    expect(span(text, yamlAt(table, 2, { key: 'b', value: 'two # words' }))).toBe("'two # words'");
    expect(yamlAt(table, 3, { key: 'c', value: 'x' }).value.quote).toBe('"');
  });
  it('finds a list item and a flow list on a pair line', () => {
    const text = 'a:\n  - one\nb: [x, y]\n';
    const table = lineTable(text);

    expect(span(text, yamlAt(table, 2, { key: 'a', value: 'one', list: true }))).toBe('one');
    expect(yamlAt(table, 3, { key: 'b', value: 'x', list: true }).value.flow).toBe(true);
  });
  it('refuses flow maps, block scalars, anchors and a mismatched key', () => {
    const table = lineTable('a: {b: c}\nd: |\n  text\ne: &x v\nf: 1\n');

    expect(yamlAt(table, 1, { key: 'a.b', value: 'c' })).toBeUndefined();
    expect(yamlAt(table, 2, { key: 'd', value: 'text' })).toBeUndefined();
    expect(yamlAt(table, 3, { key: 'e', value: 'v' })).toBeUndefined();
    expect(yamlAt(table, 4, { key: 'g', value: '1' })).toBeUndefined();
  });
  it('accepts a dotted key as the last part of the entry key', () => {
    const table = lineTable('spring:\n  jpa.open-in-view: true\n');

    expect(yamlAt(table, 2, { key: 'spring.jpa.open-in-view', value: 'true' })?.first).toBe(1);
  });
});
