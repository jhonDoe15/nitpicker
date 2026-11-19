import { describe, expect, it } from 'vitest';
import { applyRecipe, plannedLines } from '../../test-support/apply-recipe.mts';
import { plainTextRegexRecipe } from './plain-text-regex.mts';

const PRELUDE = 'fun f(s: String, t: String) {}\n';
const fix = (text: string): string =>
  applyRecipe(plainTextRegexRecipe, PRELUDE + text).slice(PRELUDE.length);

describe('plainTextRegexRecipe', () => {
  it.each([
    ['s.replace(Regex("a,b"), "x")', 's.replace("a,b", "x")'],
    ['s.replaceFirst(Regex("a,b"), "x")', 's.replaceFirst("a,b", "x")'],
    ['s.replace(Regex("\\r"), "")', 's.replace("\\r", "")'],
    ['s.replace(Regex("a"), "line\\n")', 's.replace("a", "line\\n")'],
    ['s.replace(Regex("a"), """b""")', 's.replace("a", """b""")'],
    ['s.split(Regex(","))', 's.split(",")'],
    ['s.contains(Regex("x"))', 's.contains("x")'],
    ['s.contains(kotlin.text.Regex("x"))', 's.contains("x")'],
    ['s.split(",".toRegex())', 's.split(",")'],
    ['s.replace("-".toRegex(), "_")', 's.replace("-", "_")'],
    ['s.contains("x".toRegex())', 's.contains("x")'],
    ['s.trim().split(Regex(", ")).map { it.trim() }', 's.trim().split(", ").map { it.trim() }'],
    ['s?.split(Regex(","))', 's?.split(",")'],
    ['s.split( Regex( "," ) )', 's.split( "," )'],
    ['s.split(Regex("""x"""))', 's.split("""x""")'],
  ])('rewrites %s', (before, after) => {
    expect(fix(`val a = ${before}\n`)).toBe(`val a = ${after}\n`);
  });

  it('rewrites a multi-line call and reports the line of the regex', () => {
    const before = 'val a = s.replace(\n    Regex("a,b"),\n    "x",\n)\n';
    expect(fix(before)).toBe('val a = s.replace(\n    "a,b",\n    "x",\n)\n');
    expect(plannedLines(plainTextRegexRecipe, PRELUDE + before)).toEqual([3]);
  });

  it('rewrites several calls', () => {
    expect(fix('val a = s.split(Regex(","))\nval b = t.contains(Regex("x"))\n')).toBe(
      'val a = s.split(",")\nval b = t.contains("x")\n',
    );
  });

  it('is a review fix', () => {
    expect(plainTextRegexRecipe.safety).toBe('review');
  });

  it.each([
    's.replace(Regex("a"), "$1")',
    's.replace(Regex("a"), "\\\\")',
    's.replace(Regex("a"), "\\$")',
    's.replace(Regex("a"), """\\""")',
    's.replace(Regex("a"), "x$name")',
    's.replace(Regex("a"), x)',
    's.replace(Regex("a"), "x" + y)',
    's.replace(Regex("a")) { it.value }',
    's.replace(Regex("a"), transform = f)',
    's.replace(Regex("a.b"), "x")',
    's.replace(Regex("a\\\\r"), "x")',
    's.replace(Regex("a", RegexOption.IGNORE_CASE), "x")',
    's.replace("a".toRegex(RegexOption.IGNORE_CASE), "x")',
    's.replace(Regex(""), "x")',
    's.split(Regex(","), 2)',
    's.split(Regex(",")) { it }',
    's.split(regex = Regex(","))',
    's.split(Regex("$sep"))',
    's.split(Regex(SEPARATOR))',
    's.split(Regex(sep))',
    's.split(Regex(","), limit = 2)',
    's.split(Regex(",|;"))',
    's.contains(Regex("x+"))',
    's.contains(Regex("x"), true)',
    's.matches(Regex("x"))',
    's.find(Regex("x"))',
    's.indexOf(Regex("x"))',
    's.split((",").toRegex())',
    's.split(Regex(",").toPattern())',
    's.split(Regex("a" + "b"))',
    's.split(Regex("a$"))',
  ])('declines %s', (text) => {
    expect(fix(`val a = ${text}\n`)).toBe(`val a = ${text}\n`);
  });

  it.each([
    'val a = s.split(Regex(/* comma */ ","))',
    'val a = ",".toRegex(/* x */).let { s.split(it) }',
  ])('declines a comment inside the regex: %s', (text) => {
    expect(fix(`${text}\n`)).toBe(`${text}\n`);
  });

  it('keeps comments outside the regex and a trailing comma', () => {
    expect(fix('val a = s.split(/* c */ Regex(","))\n')).toBe('val a = s.split(/* c */ ",")\n');
    expect(fix('val a = s.replace(Regex("a"), // first\n    "b")\n')).toBe(
      'val a = s.replace("a", // first\n    "b")\n',
    );
    expect(fix('val a = s.replace(Regex("a"), "b", )\n')).toBe('val a = s.replace("a", "b", )\n');
  });

  it('declines replace when the file works with a CharSequence receiver', () => {
    const text = 'fun f(c: CharSequence, s: String) = s.replace(Regex("a"), "b")\n';
    expect(fix(text)).toBe(text);
    const split = 'fun f(c: CharSequence) = c.split(Regex(","))\n';
    expect(fix(split)).toBe('fun f(c: CharSequence) = c.split(",")\n');
  });

  it.each([
    'fun f(c: CharSequence) = c.replace(Regex("a"), "b")',
    'fun f(c: CharSequence) = c.subSequence(0, 2).replace(Regex("a"), "b")',
    'fun f(c: CharSequence) = c.trim().replace(Regex("a"), "b")',
    'fun f(c: CharSequence) = c.take(2).replace(Regex("a"), "b")',
    'fun f(p: List<Regex>) = p.contains(Regex("a"))',
    'fun f(p: List<Regex>) = p.contains("a".toRegex())',
    'fun f(p: Any) = p.split(Regex(","))',
    'fun f() = g().replace(Regex("a"), "b")',
    'fun f() = a.b.replace(Regex("a"), "b")',
    'fun f(n: String?) = n!!.trim().replace(Regex("a"), "b")',
  ])('declines a receiver that is not provably a String: %s', (text) => {
    expect(fix(`${text}\n`)).toBe(`${text}\n`);
  });

  it('rewrites on a string literal, a trimmed String and a CharSequence contains', () => {
    expect(fix('val a = "ab".replace(Regex("a"), "b")\n')).toBe('val a = "ab".replace("a", "b")\n');
    expect(fix('val a = s.trim().replace(Regex("a"), "b")\n')).toBe(
      'val a = s.trim().replace("a", "b")\n',
    );
    expect(fix('fun g(c: CharSequence) = c.contains(Regex("x"))\n')).toBe(
      'fun g(c: CharSequence) = c.contains("x")\n',
    );
  });

  it('ignores calls in comments and strings', () => {
    const text = '// s.split(Regex(","))\nval t = "s.split(Regex(\\",\\"))"\n';
    expect(fix(text)).toBe(text);
  });
});
