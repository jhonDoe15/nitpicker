import { describe, expect, it } from 'vitest';
import {
  argumentUnitOfCallName,
  conversionExample,
  convertedUnit,
  unitFactor,
  unitOfCallName,
  unitOfName,
} from './unit-names.mjs';

describe('unitOfName', () => {
  it('reads the unit from camel, snake and constant suffixes and from bare unit words', () => {
    expect(
      [
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
        'expires_at_epoch_second',
        'elapsedMicros',
      ].map(unitOfName),
    ).toEqual([
      'ms',
      'ms',
      'ms',
      'ms',
      's',
      's',
      'ns',
      'min',
      'ms',
      's',
      'ms',
      'ms',
      's',
      's',
      'us',
    ]);
  });

  it('leaves words that only end in the same letters alone', () => {
    expect(
      [
        'items',
        'atoms',
        'numVMs',
        'LLMs',
        'ROOMS',
        'specs',
        'second',
        'timestamp',
        'timeout',
        '',
        'SECONDS_PER_MINUTES',
        'millisPerSecond',
        'ms_per_tick',
      ].map(unitOfName),
    ).toEqual(Array.from({ length: 13 }, () => undefined));
  });
});

describe('call names', () => {
  it('treats getters and converters to a number as values, and factories as taking that unit', () => {
    expect(
      ['toMillis', 'getSeconds', 'currentTimeMillis', 'inWholeSeconds'].map(unitOfCallName),
    ).toEqual(['ms', 's', 'ms', 's']);
    expect(['ofSeconds', 'plusMillis', 'setTimeoutMs', 'ofEpochMilli'].map(unitOfCallName)).toEqual(
      [undefined, undefined, undefined, undefined],
    );
    expect(
      ['ofSeconds', 'plusMillis', 'setTimeoutMs', 'ofEpochMilli', 'offsetMs'].map(
        argumentUnitOfCallName,
      ),
    ).toEqual(['s', 'ms', 'ms', 'ms', undefined]);
  });
});

describe('conversions', () => {
  it('moves between units only by their exact factors', () => {
    expect(convertedUnit('s', 1000, '*')).toBe('ms');
    expect(convertedUnit('ms', 1000, '/')).toBe('s');
    expect(convertedUnit('ns', 1e6, '/')).toBe('ms');
    expect(convertedUnit('min', 60, '*')).toBe('s');
    expect(convertedUnit('s', 2, '*')).toBeUndefined();
    expect(unitFactor('s', 'ms')).toBe(1000);
    expect(unitFactor('ms', 's')).toBe(1000);
    expect(conversionExample('ttlSeconds', 's', 'ms')).toBe('ttlSeconds * 1000');
    expect(conversionExample('a + b', 'ms', 's')).toBe('(a + b) / 1000');
  });
});
