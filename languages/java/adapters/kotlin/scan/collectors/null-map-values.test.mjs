import { describe, expect, it } from 'vitest';
import { lineOf, scanKotlinSource } from '../kotlin-source.mjs';
import { kotlinSourceRules } from './null-map-values.mjs';

function found(lines) {
  const source = `class Tags(private val rows: List<Row>) {\n${lines.join('\n')}\n}\n`;
  const scanned = scanKotlinSource(source);
  return kotlinSourceRules.main
    .flatMap((rule) => rule(scanned))
    .map(({ rule, offset }) => [rule, lineOf(scanned, offset)]);
}

function collectLine(lines) {
  return lines.findIndex((line) => /Collectors\.\w+\s*[({<]|[^.]toMap\(/.test(line)) + 2;
}

const INFO = 'fun from(info: Map<String, Any?>) =';
const STAR = 'fun from(info: Map<String, *>) =';
const ENTRIES = '  info.entries.stream()';
const ROWS = 'fun from() = rows.stream()';

describe('NullMapValue', () => {
  it.each([
    [
      'an entry value of a map of nullable values',
      [INFO, `${ENTRIES}.collect(Collectors.toMap(Map.Entry::key, Map.Entry::value))`],
    ],
    [
      'an entry value lambda over a star-projected map',
      [STAR, `${ENTRIES}.collect(Collectors.toMap({ it.key }, { it.value }))`],
    ],
    [
      'explicit type arguments',
      [
        INFO,
        `${ENTRIES}.collect(`,
        '    Collectors.toMap<Map.Entry<String, Any?>, String, Any?>({ it.key }, { it.value }))',
      ],
    ],
    [
      'a statically imported toMap',
      [
        'import java.util.stream.Collectors.toMap',
        '',
        STAR,
        `${ENTRIES}.collect(toMap({ it.key }, { it.value }))`,
      ],
    ],
    [
      'a safe call result',
      [`${ROWS}.collect(Collectors.toUnmodifiableMap({ it.id }, { it.note?.trim() }))`],
    ],
    [
      'an orNull result',
      [`${ROWS}.collect(Collectors.toConcurrentMap({ it.id }, { it.tags.firstOrNull() }))`],
    ],
    [
      'a null branch',
      [`${ROWS}.collect(Collectors.toMap({ it.id }, { if (it.live) it.note else null }))`],
    ],
    [
      'a groupingBy classifier that can be null',
      [`${ROWS}.collect(Collectors.groupingBy { it.owner?.name })`],
    ],
  ])('flags %s', (_name, lines) => {
    expect(found(lines)).toEqual([['NullMapValue', collectLine(lines)]]);
  });

  it.each([
    [
      'an elvis default after a safe call',
      [`${ROWS}.collect(Collectors.toMap({ it.id }, { it.note?.trim() ?: "" }))`],
    ],
    [
      'a map of non-null values when another map in the file is nullable',
      [
        'fun other(raw: Map<String, Any?>) = raw.size',
        'fun from(info: Map<String, String>) =',
        `${ENTRIES}.collect(Collectors.toMap({ it.key }, { it.value }))`,
      ],
    ],
    [
      'a Kotlin toMap call that is not the collector',
      [
        'import java.util.stream.Collectors.toMap',
        '',
        'fun from(pairs: List<Pair<String, String?>>) = pairs.toMap()',
      ],
    ],
    [
      'nulls filtered first',
      [
        INFO,
        `${ENTRIES}.filter { it.value != null }`,
        '    .collect(Collectors.toMap({ it.key }, { it.value }))',
      ],
    ],
    [
      'a value mapped to text',
      [INFO, `${ENTRIES}.collect(Collectors.toMap({ it.key }, { Objects.toString(it.value) }))`],
    ],
    [
      'a map of non-null values',
      [
        'fun from(info: Map<String, String>) =',
        `${ENTRIES}.collect(Collectors.toMap({ it.key }, { it.value }))`,
      ],
    ],
    ['a plain getter', [`${ROWS}.collect(Collectors.toMap({ it.id }, { it.name }))`]],
    ['a groupingBy on a plain getter', [`${ROWS}.collect(Collectors.groupingBy { it.group })`]],
    ['Kotlin associate', ['fun from() = rows.associate { it.id to it.note?.trim() }']],
    ['Kotlin groupBy', ['fun from() = rows.groupBy { it.owner?.name }']],
    ['the Kotlin toMap', ['fun from() = rows.map { it.id to it.note }.toMap()']],
  ])('allows %s', (_name, lines) => {
    expect(found(lines)).toEqual([]);
  });
});
