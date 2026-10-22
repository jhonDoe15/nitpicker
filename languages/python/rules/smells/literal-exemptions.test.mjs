import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DISCRIMINANT_KEYS,
  IDIOMATIC_TEXTS,
  MAXIMUM_USES,
  MINIMUM_LENGTH,
  MIME_TYPE_PATTERN,
  TIME_FORMAT_PATTERN,
  TRANSLATION_CALLS,
} from '../../../../shared/literals/repeated-literal-exemptions.mjs';

const source = readFileSync(path.join(import.meta.dirname, 'literals.py'), 'utf8');

function pythonSet(name) {
  const body = new RegExp(String.raw`^${name} = \{([^}]*)\}`, 'mu').exec(source)?.[1] ?? '';
  return [...body.matchAll(/"([^"]*)"/gu)].map(([, item]) => item).toSorted();
}

function pythonPattern(name) {
  return new RegExp(String.raw`^${name} = re\.compile\(r"([^"]*)"\)`, 'mu').exec(source)?.[1];
}

describe('repeated string exemptions shared with the other presets', () => {
  it.each([
    ['TRANSLATION_CALLS', TRANSLATION_CALLS],
    ['IDIOMATIC_TEXT', IDIOMATIC_TEXTS],
    ['DISCRIMINANT_KEYS', DISCRIMINANT_KEYS],
  ])('keeps %s equal to the shared list', (name, shared) => {
    expect(pythonSet(name)).toEqual(shared.toSorted());
  });

  it('keeps the MIME type and time format patterns equal to the shared ones', () => {
    expect([pythonPattern('MIME_TYPE'), pythonPattern('TIME_FORMAT')]).toEqual([
      MIME_TYPE_PATTERN,
      TIME_FORMAT_PATTERN,
    ]);
  });

  it('uses the shared minimum length and number of allowed uses', () => {
    const constants = /^MINIMUM_LENGTH = (\d+)\nMAXIMUM_USES = (\d+)$/mu.exec(source);

    expect(constants?.slice(1).map(Number)).toEqual([MINIMUM_LENGTH, MAXIMUM_USES]);
  });
});
