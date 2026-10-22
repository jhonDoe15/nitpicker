import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { repeatedStringLiterals } from './repeated-strings.mjs';

function lines(source) {
  const scanned = scanKotlinSource(source);
  return repeatedStringLiterals(scanned).map(({ offset }) => lineOf(scanned, offset));
}

const repeat = (expression) => [expression, expression, expression].join('\n');

describe('repeatedStringLiterals', () => {
  it('reports each use from the third on, named in the message', () => {
    const source = Array.from({ length: 4 }, () => 'val a = "pending"').join('\n');
    const reported = repeatedStringLiterals(scanKotlinSource(source));

    expect(lines(source)).toEqual([3, 4]);
    expect(reported[0].subject).toBe('pending');
    expect(reported[0].message).toBe(
      'The string "pending" is repeated three times or more in the file. Name it once as a constant (`private const val NAME = "..."`) and use the constant.',
    );
  });

  it('counts raw strings and plain strings of the same text together', () => {
    expect(lines('val a = "pending"\nval b = """pending"""\nval c = "pending"\n')).toEqual([3]);
  });

  it.each([
    ['two uses', 'val a = "pending"\nval b = "pending"\n'],
    ['short text', repeat('val a = "tiny"')],
    ['text without a letter or digit', repeat('val a = "-----"')],
    ['templates', repeat('val a = "pending $name"')],
    ['templates with braces', repeat('val a = "pending ${name}"')],
    ['strings in comments', repeat('// "pending"')],
    ['different texts', 'val a = "pending"\nval b = "pending."\nval c = "pending!"\n'],
  ])('passes %s', (_name, source) => {
    expect(lines(source)).toEqual([]);
  });

  it.each([
    ['annotation arguments', repeat('@Table(name = "orders_table")\nclass A')],
    ['annotation arrays', repeat('@Roles(["order-admin"])\nclass A')],
    ['file annotations', repeat('@file:Suppress("order-admin")')],
    ['constant declarations', repeat('const val A: String = "order-admin"')],
    ['private constant declarations', repeat('private const val A = "order-admin"')],
    ['named arguments', repeat('val a = field(label = "order-admin")')],
    ['named arguments on a new line', repeat('val a = field(\n  code = "order-admin")')],
    ['map keys', repeat('val a = mapOf("order-admin" to 1)')],
    ['pair keys', repeat('val a = "order-admin" to 1')],
    ['subscript keys', repeat('val a = values["order-admin"]')],
    ['discriminant values', repeat('val a = mapOf("type" to "order-placed")')],
    ['translation keys', repeat('val a = messages.getMessage("order.title", args)')],
    ['bundle keys', repeat('val a = getString("order.title")')],
    ['named translation keys', repeat('val a = t(key = "order.title")')],
    ['gettext keys', repeat('val a = gettext("order.title")')],
  ])('passes %s', (_name, source) => {
    expect(lines(source)).toEqual([]);
  });

  it('passes when branch labels with a subject, also several per entry and over lines', () => {
    const source = [
      'fun f(s: String) = when (s) {',
      '  "order-admin" -> 1',
      '  "order-admin", "order-user" -> 2',
      '  "order-user",',
      '  "order-admin" -> 3',
      '  else -> 0',
      '}',
    ].join('\n');

    expect(lines(source)).toEqual([]);
  });

  it('counts a branch result, a subjectless when condition and a comparison', () => {
    const source = [
      'fun f(s: String) = when (s) {',
      '  "a" -> "order-admin"',
      '  "b" -> "order-admin"',
      '  else -> "order-admin"',
      '}',
      'fun g(s: String) = when {',
      '  s == "order-user" -> 1',
      '  s == "order-user" -> 2',
      '  s == "order-user" -> 3',
      '  else -> 0',
      '}',
      'fun h(s: String) = s == "order-open" || s == "order-open" || s == "order-open"',
    ].join('\n');

    expect(lines(source)).toEqual([4, 9, 12]);
  });

  it('counts lambda arrows inside a when body as code', () => {
    const source = [
      'fun f(s: String, xs: List<String>) = when (s) {',
      '  "a" -> xs.map { x -> "order-admin" + x }',
      '  "b" -> xs.map { x -> "order-admin" + x }',
      '  else -> xs.map { x -> "order-admin" + x }',
      '}',
    ].join('\n');

    expect(lines(source)).toEqual([4]);
  });

  it('counts defaults, returns, arguments and comparisons', () => {
    const source = [
      'fun a(x: String = "order-admin") = x',
      'fun b() = "order-admin"',
      'fun c() = listOf("order-admin")',
      'fun d(x: String) = x == "order-admin"',
    ].join('\n');

    expect(lines(source)).toEqual([3, 4]);
  });

  it('counts annotation-looking text that is not an annotation call', () => {
    const source =
      repeat('val a = listOf("order-admin")') + '\n@Table(name = "order-admin")\nclass A\n';

    expect(lines(source)).toEqual([3]);
  });
});
