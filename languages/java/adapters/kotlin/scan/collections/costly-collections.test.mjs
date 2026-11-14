import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { kotlinSourceRules } from './costly-collections.mjs';

function found(body) {
  const source = `class Routes(private val routes: List<Route>) {\n${body}\n}\n`;
  const scanned = scanKotlinSource(source);
  return kotlinSourceRules.main
    .flatMap((rule) => rule(scanned))
    .map(({ rule, offset }) => [rule, lineOf(scanned, offset)]);
}

describe('ListUsedAsSet', () => {
  it.each([
    [
      'contains in a for loop',
      'fun f(xs: List<String>) {\n  val seen = mutableListOf<String>()\n  for (x in xs) {\n    if (!seen.contains(x)) seen.add(x)\n  }\n}',
      5,
    ],
    [
      'in inside forEach',
      'fun f(xs: List<String>) {\n  val seen = ArrayList<String>()\n  xs.forEach { x ->\n    if (x !in seen) seen += x\n  }\n}',
      5,
    ],
  ])('flags %s', (_name, body, line) => {
    expect(found(body)).toEqual([['ListUsedAsSet', line]]);
  });

  it.each([
    [
      'a set',
      'fun f(xs: List<String>) {\n  val seen = mutableSetOf<String>()\n  for (x in xs) {\n    if (seen.add(x)) use(x)\n  }\n}',
    ],
    [
      'a test outside loops',
      'fun f(x: String): Boolean {\n  val one = mutableListOf<String>()\n  one.add(x)\n  return one.contains(x)\n}',
    ],
    [
      'positional use',
      'fun f(xs: List<String>) {\n  val seen = mutableListOf<String>()\n  for (x in xs) {\n    if (x !in seen) seen.add(0, x)\n  }\n}',
    ],
    [
      'indexing',
      'fun f(xs: List<String>) {\n  val seen = mutableListOf<String>()\n  for (x in xs) {\n    if (x !in seen) seen.add(x)\n  }\n  use(seen[0])\n}',
    ],
    [
      'iterating it',
      'fun f(xs: List<String>) {\n  val seen = mutableListOf<String>()\n  xs.forEach { seen.add(it) }\n  for (x in seen) use(x)\n}',
    ],
    [
      'a list made inside the loop',
      'fun f(xs: List<String>) {\n  for (x in xs) {\n    val one = mutableListOf<String>()\n    if (!one.contains(x)) one.add(x)\n  }\n}',
    ],
  ])('allows %s', (_name, body) => {
    expect(found(body)).toEqual([]);
  });
});

describe('LinearLookupInLoop', () => {
  it.each([
    [
      'a property find in map',
      'fun f(paths: List<String>) = paths.map { p -> routes.find { it.path == p } }',
      2,
    ],
    [
      'a parameter any in a loop',
      'fun f(rows: List<Row>, ids: List<Long>) {\n  for (id in ids) {\n    if (rows.any { r -> id == r.meta.id }) use(id)\n  }\n}',
      4,
    ],
    [
      'a local val firstOrNull',
      'fun f(ids: List<Long>) {\n  val rows = load()\n  ids.forEach { id -> rows.firstOrNull { it.id == id }?.let(::use) }\n}',
      4,
    ],
    [
      'a parameter whose name another function changes',
      'fun g(rows: MutableList<Row>) = rows.clear()\nfun f(rows: List<Row>, ids: List<Long>) = ids.map { id -> rows.find { it.id == id } }',
      3,
    ],
  ])('flags %s', (_name, body, line) => {
    expect(found(body)).toEqual([['LinearLookupInLoop', line]]);
  });

  it.each([
    [
      'a map',
      'fun f(paths: List<String>) {\n  val byPath = routes.associateBy { it.path }\n  paths.map { byPath[it] }\n}',
    ],
    ['a constant key', 'fun f(paths: List<String>) = paths.map { routes.find { it.path == "/" } }'],
    ['no loop', 'fun f(path: String) = routes.find { it.path == path }'],
    [
      'a changed list',
      'fun f(ids: List<Long>) {\n  val rows = mutableListOf<Row>()\n  for (id in ids) {\n    rows.find { it.id == id }\n    rows.add(Row(id))\n  }\n}',
    ],
    [
      'a val inside the loop',
      'fun f(ids: List<Long>) {\n  for (id in ids) {\n    val rows = load(id)\n    rows.find { it.id == id }\n  }\n}',
    ],
    [
      'the loop variable',
      'fun f(groups: List<List<Row>>, id: Long) = groups.filter { group -> group.any { it.id == id } }',
    ],
    [
      'a compound test',
      'fun f(ids: List<Long>) = ids.map { id -> routes.find { it.id == id && it.live } }',
    ],
    [
      'a comparison of the item itself',
      'fun f(ids: List<Long>) = ids.map { id -> routes.find { it == id } }',
    ],
    [
      'a parameter the same function changes',
      'fun f(rows: MutableList<Row>, ids: List<Long>) {\n  ids.map { id -> rows.find { it.id == id } }\n  rows.clear()\n}',
    ],
  ])('allows %s', (_name, body) => {
    expect(found(body)).toEqual([]);
  });
});

describe('SortForExtreme', () => {
  it.each([
    ['sortedBy then first', 'fun f() = routes.sortedBy { it.weight }.first()'],
    [
      'sortedWith then lastOrNull',
      'fun f() = routes.sortedWith(compareBy({ it.weight })).lastOrNull()',
    ],
    ['sorted then index 0', 'fun f(xs: List<Int>) = xs.sorted()[0]'],
    [
      'sortedByDescending then firstOrNull',
      'fun f() = routes.sortedByDescending { it.weight }\n    .firstOrNull()',
    ],
  ])('flags %s', (_name, body) => {
    expect(found(body)).toEqual([['SortForExtreme', 2]]);
  });

  it.each([
    ['maxBy', 'fun f() = routes.maxBy { it.weight }'],
    ['take', 'fun f() = routes.sortedBy { it.weight }.take(3)'],
    ['the whole sorted list', 'fun f() = routes.sortedBy { it.weight }'],
    ['a first with a predicate', 'fun f() = routes.sortedBy { it.weight }.first { it.live }'],
  ])('allows %s', (_name, body) => {
    expect(found(body)).toEqual([]);
  });
});

describe('RedundantStreamStep', () => {
  it.each([
    ['map then flatten', 'fun f() = routes.map { it.parts }.flatten()'],
    ['map with a reference then flatten', 'fun f() = routes.map(Route::parts)\n    .flatten()'],
    ['a copy only to count', 'fun f() = routes.toList().size'],
    [
      'a copy only to test emptiness',
      'fun f() = routes.asSequence().filter { it.live }.toMutableList().isEmpty()',
    ],
  ])('flags %s', (_name, body) => {
    expect(found(body)).toEqual([['RedundantStreamStep', 2]]);
  });

  it.each([
    ['flatMap', 'fun f() = routes.flatMap { it.parts }'],
    ['map alone', 'fun f() = routes.map { it.parts }'],
    ['a copy that is kept', 'fun f() = routes.toList()'],
    ['a copy that is changed', 'fun f() = routes.toMutableList().apply { add(extra) }'],
    ['a set copy, which drops repeats', 'fun f() = routes.toSet().size'],
    [
      'a copy then searched, which may be a map or a string',
      'fun f(r: Route) = routes.toList().contains(r)',
    ],
    ['a size function of its own', 'fun f() = routes.toList().sizeInBytes()'],
  ])('allows %s', (_name, body) => {
    expect(found(body)).toEqual([]);
  });
});
