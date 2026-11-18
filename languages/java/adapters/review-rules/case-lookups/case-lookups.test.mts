import { describe, expect, it } from 'vitest';
import { parseSource as untypedParse } from '../max-value-sums/source-file.mjs';
import { findCaseLookups as untypedFind } from './case-lookups.mjs';

const parse: (text: string, options: { file: string; kotlin: boolean }) => unknown = untypedParse;
const find: (source: unknown) => { readonly kind: string }[] = untypedFind;

function java(members: string) {
  const text = `import java.util.*;\nclass Audit {\n${members}\n}\n`;
  return find(parse(text, { file: 'Audit.java', kotlin: false })).map(({ kind }) => kind);
}

function kotlin(members: string) {
  return find(parse(`class Audit {\n${members}\n}\n`, { file: 'Audit.kt', kotlin: true })).map(
    ({ kind }) => kind,
  );
}

describe('CaseMismatchedLookup in Java', () => {
  it('reports a lower-cased key looked up in a literal collection with capitals', () => {
    expect(
      java(
        'boolean has(String n) { Set<String> names = Set.of("GET", "POST"); return names.contains(n.toLowerCase()); }',
      ),
    ).toEqual(['original']);
    expect(
      java(
        'static final List<String> NAMES = List.of("Get", ' +
          '"post");\nboolean has(String n) { return ' +
          'NAMES.contains(n.toLowerCase()); }',
      ),
    ).toEqual(['original']);
    expect(
      java(
        'boolean has(String n) { List<String> names = ' +
          'Arrays.asList("a", "B"); return ' +
          'names.indexOf(n.toLowerCase(Locale.ROOT)) >= 0; }',
      ),
    ).toEqual(['original']);
  });

  it('reports a lookup in a copy of a parameter and a key filled normalized but read raw', () => {
    expect(
      java(
        'boolean has(Collection<String> values, String n) { ' +
          'Set<String> copy = new HashSet<>(values); return ' +
          'copy.contains(n.toLowerCase()); }',
      ),
    ).toEqual(['original']);
    expect(
      java(
        'void put(String name) { index.put(name.toLowerCase(), 1); ' +
          '}\nInteger find(String name) { return index.get(name); }',
      ),
    ).toEqual([]);
    expect(
      java(
        'Integer find(String name) { index.put(name.toLowerCase(), 1); return index.get(name); }',
      ),
    ).toEqual(['raw']);
    expect(
      java(
        'void put(String name) { this.index.put(name.toLowerCase(), ' +
          '1); }\nInteger find(String name) { return ' +
          'this.index.get(name); }',
      ),
    ).toEqual(['raw']);
  });

  it('leaves normalized collections and keys alone', () => {
    expect(
      java(
        'boolean has(String n) { Set<String> names = Set.of("get", "post"); return names.contains(n.toLowerCase()); }',
      ),
    ).toEqual([]);
    expect(
      java(
        'boolean has(String n) { Set<String> names = Set.of("GET"); return names.contains(n.toUpperCase()); }',
      ),
    ).toEqual([]);
    expect(
      java(
        'boolean has(Collection<String> values, String n) { return values.contains(n.toLowerCase()); }',
      ),
    ).toEqual([]);
    expect(
      java(
        'boolean has(Collection<String> values, String n) { ' +
          'Set<String> copy = new HashSet<>(values); return ' +
          'copy.contains(n); }',
      ),
    ).toEqual([]);
    expect(
      java(
        'Integer find(String name) { String key = name.toLowerCase(); index.put(key, 1); return index.get(key); }',
      ),
    ).toEqual([]);
    expect(
      java(
        'Integer find(String a, String b) { index.put(a.toLowerCase(), 1); return index.get(b); }',
      ),
    ).toEqual([]);
  });
});

describe('CaseMismatchedLookup in Kotlin', () => {
  it('reports the same forms', () => {
    expect(
      kotlin(
        'fun has(n: String): Boolean { val names = setOf("GET", "POST"); return names.contains(n.lowercase()) }',
      ),
    ).toEqual([]);
    expect(
      kotlin(
        'fun find(name: String): Int? { index.put(name.lowercase(), 1); return index.get(name) }',
      ),
    ).toEqual(['raw']);
  });
});
