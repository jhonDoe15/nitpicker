import { describe, expect, it } from 'vitest';
import { referenceLinks } from '../../../shared/reference/store.mjs';
import { broadRuleIds } from './entry-labels.mts';

type Entry = { readonly id: string; readonly labels?: readonly string[]; readonly tier?: string };

const index: () => { readonly entries: readonly Entry[] } = () => referenceLinks().index();

describe('the broad rule table', () => {
  const entries = new Map(index().entries.map((entry) => [entry.id, entry]));

  it('names only rules the reference has, and marks each one broad', () => {
    const ids = [...broadRuleIds()];
    expect(ids.filter((id) => !entries.has(id))).toEqual([]);
    expect(ids.filter((id) => entries.get(id)?.tier !== 'broad')).toEqual([]);
  });

  it('leaves style rules out, since style is listed last anyway', () => {
    expect([...broadRuleIds()].filter((id) => entries.get(id)?.labels?.[0] === 'style')).toEqual(
      [],
    );
  });

  it('marks no other entry broad', () => {
    const broad = broadRuleIds();
    expect(
      [...entries.values()].filter((entry) => entry.tier === 'broad' && !broad.has(entry.id)),
    ).toEqual([]);
  });
});
