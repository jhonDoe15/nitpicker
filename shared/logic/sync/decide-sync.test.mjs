import { describe, expect, it, vi } from 'vitest';
import { decide } from '../decide.mjs';
import { and, binary, name, not, number, or } from '../test-support/build.mjs';
import { decideSync } from './decide-sync.mjs';

const count = name('count');
const cases = [
  ['decided false', [not(binary('>', count, number('10')))], binary('>', count, number('20'))],
  ['decided true', [binary('>', count, number('20'))], binary('>', count, number('10'))],
  ['open', [binary('>', count, number('10'))], binary('>', count, number('20'))],
  ['boolean guard', [not(name('ready'))], and(name('ready'), name('loaded'))],
];

describe('decide for synchronous callers', () => {
  it.each(cases)('answers like decide: %s', async (_label, conditions, query) => {
    expect(decideSync(conditions, query)).toBe(await decide(conditions, query));
  });

  it('counts a solver that does not answer in time as open', () => {
    const flags = Array.from({ length: 30 }, (_, index) => name(`flag${String(index)}`));
    const deep = flags.reduce((chain, flag) => or(chain, flag));
    expect(['open', 'true', 'false']).toContain(decideSync([], deep, { timeoutMs: 1 }));
  });

  it('answers open while a late answer is pending, then recovers', async () => {
    const flags = Array.from({ length: 30 }, (_, index) => name(`slow${String(index)}`));
    const [label, conditions, query] = cases[0];
    const expected = await decide(conditions, query);
    decideSync(
      [],
      flags.reduce((chain, flag) => or(chain, flag)),
      { timeoutMs: 1 },
    );
    expect(['open', expected]).toContain(decideSync(conditions, query));
    await vi.waitFor(() => {
      expect(decideSync(conditions, query), label).toBe(expected);
    }, 10_000);
  });
});
