import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { plainTextRegexes, unquotedRegexValues } from './regex-values.mjs';

function found(check, lines) {
  const source = `class Routes {\n${lines.map((line) => `    ${line}`).join('\n')}\n}\n`;
  const scanned = scanKotlinSource(source);
  return check(scanned).map((reported) => [lineOf(scanned, reported.offset), reported.subject]);
}

describe('unquotedRegexValues', () => {
  it.each([
    ['a parameter in a template', 'fun route(name: String) = Regex("^/$name/\\\\d+$")', 'name'],
    ['a braced template entry', 'fun route(user: User) = Regex("^/${user.name}/")', 'user.name'],
    ['a concatenation', 'fun route(name: String) = Regex("^/" + name + "/")', 'name'],
    ['toRegex on a template', 'fun route(name: String) = "^/$name/".toRegex()', 'name'],
    ['toRegex on a concatenation', 'fun route(name: String) = ("^/" + name).toRegex()', 'name'],
    ['Pattern.compile', 'fun route(name: String) = Pattern.compile("^/" + name)', 'name'],
    ['toPattern', 'fun route(name: String) = "^$name".toPattern()', 'name'],
    ['a lambda value', 'fun routes(names: List<String>) = names.map { Regex("^$it/") }', 'it'],
    ['a raw string', 'fun route(name: String) = Regex("""^/$name/\\d+""")', 'name'],
    [
      'an unescape helper',
      'fun route(name: String) = Regex("^/${unescapeRegex(name)}/")',
      'unescapeRegex(name)',
    ],
    [
      'a local built from a parameter',
      'fun route(name: String): Regex {\nval part = "." + name\nreturn Regex("^$part") }',
      'part',
    ],
    [
      'a class property',
      'private val prefix: String = load()\nfun route() = Regex("^$prefix/")',
      'prefix',
    ],
  ])('flags %s', (_name, line, subject) => {
    const lines = line.split('\n');
    expect(found(unquotedRegexValues, lines)).toEqual([[lines.length + 1, subject]]);
  });

  it.each([
    ['an escaped value', 'fun route(name: String) = Regex("^/${Regex.escape(name)}/")'],
    ['a quoted value', 'fun route(name: String) = Pattern.compile("^/" + Pattern.quote(name))'],
    ['a whole pattern', 'fun compile(pattern: String) = Regex(pattern)'],
    [
      'a whole pattern with options',
      'fun compile(pattern: String) = Regex(pattern, RegexOption.IGNORE_CASE)',
    ],
    ['a whole pattern converted', 'fun compile(pattern: String) = pattern.toRegex()'],
    ['a number', 'fun digits(count: Int) = Regex("^\\\\d{$count}$")'],
    ['a constant', 'fun route() = Regex("^/$PREFIX/")'],
    ['a qualified constant', 'fun route() = Regex("^/" + Paths.PREFIX)'],
    ['a regex source', 'fun anchored(inner: Regex) = Regex("^(?:${inner.pattern})$")'],
    ['an escaped dollar', 'fun total() = Regex("\\$name")'],
    ['a literal', 'val digits = Regex("\\\\d+")'],
    ['a call result', 'fun route() = loadPattern().toRegex()'],
    ['an escape helper', 'fun route(name: String) = Regex("^/${escapeRegex(name)}/")'],
    [
      'a qualified escape helper',
      'fun route(name: String) = Regex("^/" + Texts.quotePattern(name))',
    ],
    [
      'a literal local',
      'fun cells(line: String): List<String> {\nval sep = "."\nreturn line.split(Regex("x$sep"))\n}',
    ],
  ])('allows %s', (_name, line) => {
    expect(found(unquotedRegexValues, line.split('\n'))).toEqual([]);
  });

  it('allows a value declared in an object', () => {
    const lines = [
      'companion object {',
      '    private val names = listOf("a", "b").joinToString("|")',
      '}',
      'fun route() = Regex("^(?:$names)$")',
    ];
    expect(found(unquotedRegexValues, lines)).toEqual([]);
  });

  it('allows a top-level value', () => {
    const scanned = scanKotlinSource(
      'private val names = listOf("a").joinToString("|")\n\nfun route() = Regex("^(?:$names)$")\n',
    );
    expect(unquotedRegexValues(scanned)).toEqual([]);
  });
});

describe('plainTextRegexes', () => {
  it.each([
    ['replace with Regex', 'fun clean(text: String) = text.replace(Regex("\\r"), "")', '\r'],
    ['replace with toRegex', 'fun clean(text: String) = text.replace("abc".toRegex(), "")', 'abc'],
    ['split', 'fun cells(line: String) = line.split(Regex(","))', ','],
    ['contains', 'fun has(line: String) = line.contains(Regex("shop"))', 'shop'],
    ['replaceFirst', 'fun clean(text: String) = text.replaceFirst(Regex("x"), "")', 'x'],
  ])('flags %s', (_name, line, subject) => {
    expect(found(plainTextRegexes, [line])).toEqual([[2, subject]]);
  });

  it.each([
    ['a metacharacter', 'fun clean(text: String) = text.replace(Regex("\\\\s+"), " ")'],
    ['a dot', 'fun cells(line: String) = line.split(Regex("."))'],
    [
      'an option',
      'fun clean(text: String) = text.replace(Regex("abc", RegexOption.IGNORE_CASE), "")',
    ],
    ['a template', 'fun clean(text: String, word: String) = text.replace(Regex(word), "")'],
    ['a plain string', 'fun clean(text: String) = text.replace("abc", "")'],
    ['a regex held elsewhere', 'fun clean(text: String) = text.replace(WORDS, "")'],
  ])('allows %s', (_name, line) => {
    expect(found(plainTextRegexes, [line])).toEqual([]);
  });
});
