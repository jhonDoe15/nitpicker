import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sqlOrderGaps } from './sql-order.mjs';

const CASES = JSON.parse(
  readFileSync(new URL('test-support/sql-order-cases.json', import.meta.url), 'utf8'),
);
const kinds = (text) => sqlOrderGaps(text).map(({ kind, form }) => `${kind}:${form}`);

describe('sqlOrderGaps', () => {
  it.each(CASES.reports)('reports %j', (text, expected) => {
    expect(kinds(text)).toEqual(expected);
  });

  it.each(CASES.allows)('allows %j', (text) => {
    expect(sqlOrderGaps(text)).toEqual([]);
  });
});
