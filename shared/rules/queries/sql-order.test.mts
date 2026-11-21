import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fieldOf, listOf, textOf, textsOf } from '../../values/readers.mts';
import { sqlOrderGaps } from './sql-order.mts';

function readCases(): { reports: [string, string[]][]; allows: [string][] } {
  try {
    const cases: unknown = JSON.parse(
      readFileSync(new URL('test-support/sql-order-cases.json', import.meta.url), 'utf8'),
    );
    return {
      reports: listOf(fieldOf(cases, 'reports')).map((row) => [
        textOf(listOf(row)[0]),
        textsOf(listOf(row)[1]),
      ]),
      allows: listOf(fieldOf(cases, 'allows')).map((row) => [textOf(listOf(row)[0])]),
    };
  } catch (error) {
    throw new Error('Cannot read the SQL order cases', { cause: error });
  }
}

const CASES = readCases();
const kinds = (text: string): string[] =>
  sqlOrderGaps(text).map(({ kind, form }) => `${kind}:${form}`);

describe('sqlOrderGaps', () => {
  it.each(CASES.reports)('reports %j', (text, expected) => {
    expect(kinds(text)).toEqual(expected);
  });

  it.each(CASES.allows)('allows %j', (text) => {
    expect(sqlOrderGaps(text)).toEqual([]);
  });
});
