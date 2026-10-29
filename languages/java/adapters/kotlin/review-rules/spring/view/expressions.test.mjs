import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  lambdaParts,
  lastSelector,
  normalized,
  parseSelector,
  splitArguments,
  unwrapped,
} from './expressions.mjs';
import { springViews } from './spring-view.mjs';

const FIXTURES = path.resolve(import.meta.dirname, '../../../../fixtures');
const { files } = JSON.parse(readFileSync(path.join(FIXTURES, 'kotlin-spring-facts.json'), 'utf8'));

function typeAt(line, text, source = 'good/Batches.kt') {
  const view = springViews({
    files,
    projectFiles: files,
    projectRoot: path.join(FIXTURES, 'kotlin-spring-project'),
    javaRoots: ['src/main/java'],
  }).find(({ file }) => file.file.endsWith(source));
  const scopes = view.file.invocations
    .filter((entry) => entry.line === line)
    .map(({ scope }) => scope);
  return view.typeOf(Math.max(...scopes), text);
}

describe('Kotlin expression text', () => {
  it('splits a lambda into its parameter names and its last expression', () => {
    expect(lambdaParts('{ it.tags }')).toEqual({ params: ['it'], body: 'it.tags' });
    expect(lambdaParts('{ a, _ -> a.tags }')).toEqual({ params: ['a', '_'], body: 'a.tags' });
    expect(lambdaParts('{ o: Order -> log(o); o.items.map { i -> i }\n o.tags }')).toEqual({
      params: ['o'],
      body: 'o.tags',
    });
    expect(lambdaParts('{}')).toBeUndefined();
    expect(lambdaParts('items')).toBeUndefined();
  });

  it('splits the last member selector outside brackets, strings and lambdas', () => {
    expect(lastSelector('a.b(c.d, "x.y").e { it.f }')).toEqual({
      head: 'a.b(c.d, "x.y")',
      selector: 'e { it.f }',
    });
    expect(lastSelector('1..9')).toBeUndefined();
    expect(lastSelector('a.b(')).toBeUndefined();
  });

  it('reads the name, type arguments and arguments of a call selector', () => {
    expect(parseSelector('listOf<Order>(o, ids = *xs) { it }')).toEqual({
      name: 'listOf',
      call: true,
      typeArguments: '<Order>',
      arguments: [
        { text: 'o', spread: false },
        { text: 'xs', spread: true },
        { text: '{ it }', lambda: true },
      ],
    });
    expect(parseSelector('content')).toEqual({
      name: 'content',
      call: false,
      typeArguments: undefined,
      arguments: [],
    });
    expect(parseSelector('listOf(g)[0]')).toBeUndefined();
  });

  it('drops not-null assertions and safe calls, and unwraps parentheses', () => {
    expect(normalized('repo!!.save(it)?.id')).toBe('repo.save(it).id');
    expect(unwrapped('(a + b)')).toBe('a + b');
    expect(unwrapped('(a) + (b)')).toBeUndefined();
    expect(splitArguments('a, f(b, c), "d,e"').map(({ text }) => text)).toEqual([
      'a',
      'f(b, c)',
      '"d,e"',
    ]);
  });
});

describe('Kotlin local types through calls, map entries and pages', () => {
  it.each([
    [57, 'group.map { it.id!! }', 'List<Any>'],
    [58, 'chunk.toSet()', 'Set<Long>'],
    [59, 'ids.chunked(size.coerceAtLeast(1))', 'List<List<Long>>'],
    [60, 'chunk', 'List<Long>'],
    [62, 'entry.value', 'List<Long>'],
    [65, 'bucket', 'MutableList<Long>'],
    [68, 'chunkIds', 'List<Any>'],
    [75, 'page.content', 'List<Long>'],
    [79, 'batch', 'List<Long>'],
  ])('types line %i %s as %s', (line, text, type) => {
    expect(typeAt(line, text)).toBe(type);
  });
});

describe('Kotlin local types through the value of a mapping lambda', () => {
  it.each([
    [104, 'items.map { it.labels }', 'List<Set<String>>'],
    [105, 'items.zip(others) { shelf, _ -> shelf.labels }', 'List<Set<String>>'],
    [106, 'items.associateBy({ it.id }, { it.labels })', 'Map<Any,Set<String>>'],
    [104, 'items.map { describe(it) }', 'List<Any>'],
  ])('types line %i %s as %s', (line, text, type) => {
    expect(typeAt(line, text, 'good/Rows.kt')).toBe(type);
  });
});
