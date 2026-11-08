import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REUSABLE_OBJECT_RULE } from '../../../../../messages/reuse/reusable-objects.mjs';
import { routed, run } from '../../test-support/facts.mjs';
import { KOTLIN_REUSABLE_OBJECT_MESSAGE, reusableObjectFindings } from './reusable-objects.mjs';

const PROJECT = path.resolve(
  import.meta.dirname,
  '../../../../fixtures/kotlin-reusable-objects-project',
);
const FILE = 'src/main/kotlin/demo/formats/Formats.kt';
const { files } = JSON.parse(readFileSync(path.join(PROJECT, 'facts.json'), 'utf8'));
const lines = readFileSync(path.join(PROJECT, FILE), 'utf8').split('\n');

function lineOf(fragment) {
  return lines.findIndex((text) => text.includes(fragment)) + 1;
}

function located(findings) {
  return findings.map(({ symbol, location }) => `${symbol} ${String(location.line)}`);
}

describe('ReusableObjectPerCall on Kotlin sources', () => {
  const findings = run(reusableObjectFindings, files);

  it('reports a shareable object built in a function that runs on every call', () => {
    expect(located(findings)).toEqual([
      `Formats.toJson.ObjectMapper ${String(lineOf('fun toJson'))}`,
      `Formats.local.jacksonObjectMapper ${String(lineOf('val mapper = jacksonObjectMapper()'))}`,
      `Formats.day.ofPattern ${String(lineOf('ofPattern("yyyy-MM-dd")'))}`,
      `Formats.constantDay.ofPattern ${String(lineOf('fun constantDay'))}`,
      `Formats.gson.Gson ${String(lineOf('fun gson'))}`,
      `Formats.decode.Json ${String(lineOf('fun decode'))}`,
      `Formats.words.Regex ${String(lineOf('fun words'))}`,
      `Formats.digits.toRegex ${String(lineOf('fun digits'))}`,
      `Formats.quoted.compile ${String(lineOf('fun quoted'))}`,
      `Formats.unmarshal.newInstance ${String(lineOf('JAXBContext.newInstance(Formats::class.java)'))}`,
      `Formats.Companion.shared.ObjectMapper ${String(lineOf('fun shared'))}`,
    ]);
    expect(findings[0].message).toBe(
      routed(KOTLIN_REUSABLE_OBJECT_MESSAGE, REUSABLE_OBJECT_RULE, FILE),
    );
  });

  it.each([
    ['a top-level property', 'private val SHARED'],
    ['a constructor default and a property initialiser', 'class Formats(private val gson'],
    ['a lazy delegate', 'by lazy'],
    ['an init block', 'started = ObjectMapper()'],
    ['a pattern from a parameter', 'fun dynamicDay'],
    ['a regex from a parameter', 'fun dynamicRegex'],
    ['a getOrPut cache', 'contexts.getOrPut'],
    ['a function that returns the object', 'lazyMapper ?: ObjectMapper()'],
    ['an assignment to a property', 'lazyMapper = ObjectMapper()\n'],
    ['a @PostConstruct function', 'started = jacksonObjectMapper()'],
    ['a companion property', 'val COMPANION'],
    ['main', 'println(ObjectMapper()'],
    ['a type from a parameter', 'JAXBContext.newInstance(type)'],
    ['a factory with an inferred type', 'fun inferred()'],
    ['a function that returns a supplier', 'fun supplier()'],
  ])('leaves %s alone', (_, fragment) => {
    const first = fragment.split('\n')[0];
    const line = lines.findIndex((text) => text.includes(first)) + 1;

    expect(line).toBeGreaterThan(0);
    expect(findings.map(({ location }) => location.line)).not.toContain(line);
  });

  it('leaves test sources alone', () => {
    const tests = files.map((entry) => ({ ...entry, test: true }));

    expect(run(reusableObjectFindings, tests)).toEqual([]);
  });
});
