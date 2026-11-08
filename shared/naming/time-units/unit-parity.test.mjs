import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONVERTER_PREFIXES, UNIT_WORDS, unitOfName } from './unit-names.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const PMD_RULE = 'languages/java/gradle/rulesets/pmd-main-ruleset/MixedTimeUnits.xml';
const PYTHON_UNITS = 'languages/python/rules/time_units/units.py';
const XPATH_UNIT = /matches\(\$name, '([^']+)'\)\) then '(\w+)'/gu;
const XPATH_RATIO = /or matches\(\$name, '([^']+)'\)\) then \(\)/u;
const XPATH_CONVERTER = /matches\(string\(\$names\[1\]\), '\^_\*\(([^)]+)\)/u;
const PYTHON_WORD = /\("(\w+)", "(\w+)"\)/gu;

const NAMES = [
  'timeoutMs',
  'timeoutMillis',
  'TIMEOUT_MS',
  'retry_delay_ms',
  'maxAgeSeconds',
  'ttl_secs',
  'startNanos',
  'waitMinutes',
  'ms',
  'seconds',
  '_lockMillis',
  'toEpochMilli',
  'getEpochSecond',
  'epochSecond',
  'expires_at_epoch_second',
  'elapsedMicros',
  'items',
  'atoms',
  'numVMs',
  'ROOMS',
  'second',
  'SECONDS_PER_MINUTE',
  'millisPerSecond',
  'timestamp',
];

function read(file) {
  return readFileSync(path.join(ROOT, file), 'utf8');
}

function xpathUnitOfName(text) {
  const ratio = new RegExp(XPATH_RATIO.exec(text)[1], 'u');
  const units = [...text.matchAll(XPATH_UNIT)].map(([, pattern, unit]) => [
    new RegExp(pattern, 'u'),
    unit,
  ]);
  return (name) =>
    ratio.test(name) ? undefined : units.find(([pattern]) => pattern.test(name))?.[1];
}

describe('time unit tables of the other presets', () => {
  it('give the Java PMD rule the same units for names as the shared table', () => {
    const javaUnitOfName = xpathUnitOfName(read(PMD_RULE));
    expect(NAMES.map(javaUnitOfName)).toEqual(NAMES.map(unitOfName));
  });

  it('give the Java PMD rule the same converter prefixes', () => {
    expect(XPATH_CONVERTER.exec(read(PMD_RULE))[1].split('|')).toEqual(CONVERTER_PREFIXES);
  });

  it('give the Python rule the same unit words and converter prefixes', () => {
    const text = read(PYTHON_UNITS);
    const words = [...text.matchAll(PYTHON_WORD)].map(([, word, unit]) => [word, unit]);
    expect(words).toEqual(UNIT_WORDS);
    for (const prefix of CONVERTER_PREFIXES) {
      expect(text).toContain(`"${prefix}",`);
    }
  });
});
