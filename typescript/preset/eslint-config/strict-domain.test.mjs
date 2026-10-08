import { describe, expect, it } from 'vitest';
import { lintFixture } from '../failure-messages/harness.mjs';
import strictDomainConfig from './strict-domain.mjs';

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

  it('does not apply outside domain/', () => {
    const code = 'let n = 1; for (const x of [1]) { n += x; } class A {}';
    expect(messagesFor('src/main/features/billing/adapters/db.ts', code)).toEqual([]);
    expect(messagesFor('src/main/shared/util.ts', code)).toEqual([]);
  });

  it('applies to nested domain files of every feature', () => {
    expect(messagesFor('src/main/features/other/domain/deep/x.ts', 'let n = 1;')).toHaveLength(1);
  });
});
