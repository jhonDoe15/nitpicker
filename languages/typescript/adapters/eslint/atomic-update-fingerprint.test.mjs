import { afterAll, describe, expect, it } from 'vitest';
import { compare, findingFor, removeTemporaryRoots } from './test-support/fingerprint-findings.mjs';

afterAll(removeTemporaryRoots);

describe('atomic-update differential identity', () => {
  it('keeps a stale update baselined across inserted lines', () => {
    const code = 'export async function update(state, load) { state.total += await load(); }';
    const reported = 'state.total += await load()';
    const find = (source) =>
      findingFor({
        code: source,
        reported,
        ruleId: 'nitpicker/require-atomic-updates',
        messageId: 'nonAtomicObjectUpdate',
      });
    const result = compare(find(code), find(`export const unrelated = 1;\n${code}`));
    expect(result.newFindings).toEqual([]);
    expect(result.resolvedFindings).toEqual([]);
    expect(result.unchangedFindings).toHaveLength(1);
  });
});
