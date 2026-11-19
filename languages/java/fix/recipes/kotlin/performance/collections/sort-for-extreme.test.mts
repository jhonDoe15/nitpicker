import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../../test-support/apply-recipe.mts';
import { sortForExtremeRecipe } from './sort-for-extreme.mts';

const fix = (text: string): string => applyRecipe(sortForExtremeRecipe, text);

describe('sortForExtremeRecipe', () => {
  it.each([
    ['xs.sortedBy { it.age }.first()', 'xs.minWith(compareBy { it.age })'],
    ['xs.sortedByDescending { it.age }.first()', 'xs.maxWith(compareBy { it.age })'],
    ['xs.sortedBy { it.age }.firstOrNull()', 'xs.minWithOrNull(compareBy { it.age })'],
    ['xs.sortedByDescending { it.age }.firstOrNull()', 'xs.maxWithOrNull(compareBy { it.age })'],
    ['xs.sortedBy(Person::age).first()', 'xs.minWith(compareBy(Person::age))'],
    ['xs.sorted().first()', 'xs.minWith(naturalOrder())'],
    ['xs.sorted().firstOrNull()', 'xs.minWithOrNull(naturalOrder())'],
    ['xs.sortedDescending().first()', 'xs.maxWith(naturalOrder())'],
    ['xs.sortedDescending().firstOrNull()', 'xs.maxWithOrNull(naturalOrder())'],
    ['xs.sortedWith(order).first()', 'xs.minWith(order)'],
    ['xs.sortedWith(compareBy { it.a }).firstOrNull()', 'xs.minWithOrNull(compareBy { it.a })'],
    ['xs.sortedBy { it.name ?: "" }.first()', 'xs.minWith(compareBy { it.name ?: "" })'],
    ['xs.sortedBy { it.age }.first().name', 'xs.minWith(compareBy { it.age }).name'],
    [
      'xs.filter { it.ok }.sortedBy { it.age }.first()',
      'xs.filter { it.ok }.minWith(compareBy { it.age })',
    ],
    ['xs.asSequence().sorted().first()', 'xs.asSequence().minWith(naturalOrder())'],
    ['xs . sorted ( ) . first ( )', 'xs .minWith(naturalOrder())'],
  ])('rewrites %s', (before, after) => {
    expect(fix(`val a = ${before}\n`)).toBe(`val a = ${after}\n`);
  });

  it('rewrites a multi-line chain and keeps the lines around it', () => {
    const before =
      'val a = xs\n    .filter { it.ok }\n    .sortedBy { it.age }\n    .first()\nval b = 1\n';
    expect(fix(before)).toBe(
      'val a = xs\n    .filter { it.ok }\n    .minWith(compareBy { it.age })\nval b = 1\n',
    );
    expect(plannedLines(sortForExtremeRecipe, before)).toEqual([3]);
  });

  it('keeps a multi-line selector lambda as written', () => {
    const before = 'val a = xs.sortedBy {\n    val n = it.age\n    n * 2\n}.first()\n';
    expect(fix(before)).toBe('val a = xs.minWith(compareBy {\n    val n = it.age\n    n * 2\n})\n');
  });

  it('rewrites two sites and a site inside a lambda argument of another', () => {
    expect(fix('val a = x.sorted().first()\nval b = y.sorted().first()\n')).toBe(
      'val a = x.minWith(naturalOrder())\nval b = y.minWith(naturalOrder())\n',
    );
    expect(fix('val a = xs.sortedBy { ys.sorted().first() }.first()\n')).toBe(
      'val a = xs.sortedBy { ys.minWith(naturalOrder()) }.first()\n',
    );
  });

  it.each([
    ['xs.sortedBy { m[it] }.first()', 'xs.minWith(compareBy { m[it] })'],
    ['xs.sortedByDescending { m[it] }.first()', 'xs.maxWith(compareBy { m[it] })'],
    ['xs.sortedBy(k).firstOrNull()', 'xs.minWithOrNull(compareBy(k))'],
    ['xs.sortedBy { it.next?.age }.first()', 'xs.minWith(compareBy { it.next?.age })'],
    ['xs.sortedBy(Person::nickname).first()', 'xs.minWith(compareBy(Person::nickname))'],
  ])('keeps nullable selectors working through compareBy: %s', (before, after) => {
    expect(fix(`val a = ${before}\n`)).toBe(`val a = ${after}\n`);
  });

  it('is a review fix', () => {
    expect(sortForExtremeRecipe.safety).toBe('review');
  });

  it.each([
    'xs.sortedBy { it.age }.last()',
    'xs.sortedBy { it.age }.lastOrNull()',
    'xs.sortedBy { it.age }[0]',
    'xs.sorted()[0]',
    'xs.sorted().first { it > 1 }',
    'xs.sorted().first(3)',
    'xs.sorted().take(1)',
    'xs.sorted().firstOrNull { it > 1 }',
    'xs.sorted().first() { it > 1 }',
    'xs.sortedBy { it.age }.first() { it }',
    'xs.sortedBy { if (it > 1) return@sortedBy 1; 2 }.first()',
    'xs.sortedByDescending { return@sortedByDescending 1 }.first()',
    'xs.sortedWith(compareBy { return@sortedWith 1 }).first()',
    'xs?.sorted()?.first()',
    'xs?.sorted().first()',
    'xs.sorted()?.first()',
    'xs.sortedBy(selector) { it }.first()',
    'xs.sorted { a, b -> a - b }.first()',
    'xs.sortedWith { a, b -> a - b }.first()',
    'xs.sortedWith().first()',
    'xs.sortedBy().first()',
    'xs.sortedBy { it.age }',
    'xs.sorted().firstly()',
    'xs.sorted().first',
    'xs.sorted()\n    .map { it }\n    .first()',
    `"\${xs.sorted().first()}"`,
  ])('declines %s', (text) => {
    expect(fix(`class P(val nickname: String?)\nval a = ${text}\n`)).toBe(
      `class P(val nickname: String?)\nval a = ${text}\n`,
    );
  });

  it.each([
    'val a = xs.sortedBy { it.age /* oldest */ }.first()',
    'val a = xs.sortedBy { it.age } // keep\n    .first()',
    'val a = xs.sorted() /* min */ .first()',
    'val a = xs.sorted()\n    // first one\n    .first()',
    'val a = xs.sorted(/* none */).first()',
  ])('declines a comment inside the chain: %s', (text) => {
    expect(fix(`${text}\n`)).toBe(`${text}\n`);
  });

  it('ignores calls in comments and strings', () => {
    const text =
      '// xs.sorted().first()\nval s = "xs.sorted().first()"\nval r = """\nxs.sorted().first()\n"""\n';
    expect(fix(text)).toBe(text);
  });
});
