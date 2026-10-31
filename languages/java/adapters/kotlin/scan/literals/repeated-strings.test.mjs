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
    ['encodings', repeat('val a = "utf-8"') + '\nval b = "latin-1"\nval c = "utf-16"'],
    ['HTTP methods', repeat('val a = "DELETE"')],
    ['MIME types', repeat('val a = "application/json"')],
    ['argparse actions', repeat('val a = "store_true"')],
    ['expression keys in a template', repeat('val a = "id: ${row["order_id"]} "')],
    ['named arguments in a template', repeat('val a = "${fmt(style = "compact-style")}"')],
    ['nested template keys', repeat('val a = "x ${y("t ${row["order_id"]}")}"')],
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

  it('counts a constant declaration, so repeating the literal beside it fails', () => {
    const source = 'const val A = "order-admin"\nval b = "order-admin"\nval c = "order-admin"\n';

    expect(lines(source)).toEqual([3]);
  });

  it('counts labels and results written on one line', () => {
    const source = [
      'fun f(s: String) = when (s) { "a" -> "pending"; "b" -> "pending"; else -> "pending" }',
      'val x = listOf("order-admin", "order-admin", when (s) { "order-admin" -> 1 }, "order-admin")',
    ].join('\n');

    expect(lines(source)).toEqual([1, 2]);
  });

  it('does not take code before a one-line when for its label', () => {
    const source = [
      'val a = "pending"; val b = "pending"; val c = when (s) { "x" -> 1; else -> "pending" }',
    ].join('\n');

    expect(lines(source)).toEqual([1]);
  });

  it('keeps a trailing-comma walk inside the when body', () => {
    const source = [
      'val p = Pair(',
      '  "order-admin",',
      '  when (s) {',
      '    "a" -> 1',
      '    else -> 2',
      '  }',
      ')',
      'val q = listOf("order-admin", "order-admin")',
    ].join('\n');

    expect(lines(source)).toEqual([8]);
  });

  it.each([
    ['this@Outer', 'val a = this@Outer.find("order-admin")'],
    ['super@Base', 'val a = super@Base.find("order-admin")'],
    ['a labeled return', 'val a = xs.forEach { return@forEach }.also { find("order-admin") }'],
  ])('does not take %s for an annotation', (_name, line) => {
    expect(lines([line, line, line].join('\n'))).toEqual([3]);
  });

  it('stays quick on a file of thousands of lines', () => {
    const source = Array.from(
      { length: 5000 },
      (_, index) =>
        `val value${String(index)} = lookup("key-${String(index % 40)}", when (x) { "a" -> 1; else -> 2 })`,
    ).join('\n');
    const started = performance.now();
    const reported = repeatedStringLiterals(scanKotlinSource(source));

    expect(reported.length).toBeGreaterThan(0);
    expect(performance.now() - started).toBeLessThan(1500);
  });

  it('counts annotation-looking text that is not an annotation call', () => {
    const source =
      repeat('val a = listOf("order-admin")') + '\n@Table(name = "order-admin")\nclass A\n';

    expect(lines(source)).toEqual([3]);
  });
});
