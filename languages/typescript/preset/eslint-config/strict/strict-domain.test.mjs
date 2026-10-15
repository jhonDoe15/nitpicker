import { describe, expect, it } from 'vitest';
import { lintFixture } from '../../failure-messages/harness.mjs';
import { strictDomainConfig } from './strict-domain.mjs';

function messagesFor(filename, code) {
  return lintFixture({ config: strictDomainConfig, filename, code })
    .filter((m) => m.ruleId !== null)
    .map((m) => m.message);
}

const domainFile = 'src/main/features/billing/domain/invoice.ts';

describe('strict domain rules', () => {
  it('accept the allowed transforms and readonly data', () => {
    const code = `
type Line = { readonly price: number };
export function total(lines: readonly Line[]) {
  const prices = lines.map((line) => line.price).filter((price) => price > 0);
  const byPrice = Object.groupBy(prices, (price) => String(price));
  return Object.fromEntries(Object.entries(byPrice).flatMap(([key]) => [[key, 1]]));
}
`;
    expect(messagesFor(domainFile, code)).toEqual([]);
  });

  it('reports a mutation once, with the domain message', () => {
    expect(
      [
        ...new Set(messagesFor(domainFile, 'export const run = (xs: number[]) => xs.push(1);')),
      ].sort(),
    ).toEqual([
      'domain/ code does not mutate arrays: build a new array with map, filter, flatMap or spread (toSorted, toReversed and toSpliced instead of sort, reverse and splice).',
      'domain/ types are readonly: write readonly T[] (or a readonly tuple) instead of a mutable array type.',
    ]);
    const assign = (target) =>
      `export const run = (o: { readonly a: number }) => Object.assign(${target}, o);`;
    expect(messagesFor(domainFile, assign('o'))).toEqual([
      'domain/ code does not mutate objects: return a new object with spread, e.g. { ...value, field } (Object.assign is fine only onto a fresh object literal).',
    ]);
    expect(messagesFor(domainFile, assign('{}'))).toEqual([]);
  });

  it('reports a type predicate over unknown once, as an unknown parameter', () => {
    const code =
      "export function isRecord(value: unknown): value is Record<string, string> { return typeof value === 'object'; }";
    const ruleIds = lintFixture({ config: strictDomainConfig, filename: domainFile, code }).map(
      (m) => m.ruleId,
    );
    expect(ruleIds).toEqual(['nitpicker/no-unknown-in-domain']);
  });

  it('does not apply outside domain/', () => {
    const code = 'let n = 1; for (const x of [1]) { n += x; } class A {}';
    expect(messagesFor('src/main/features/billing/adapters/db.ts', code)).toEqual([]);
    expect(messagesFor('src/main/shared/util.ts', code)).toEqual([]);
  });

  it('applies to nested domain files of every feature', () => {
    expect(messagesFor('src/main/features/other/domain/deep/x.ts', 'let n = 1;')).toHaveLength(1);
  });
});
