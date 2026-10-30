import { describe, expect, it } from 'vitest';
import { defaultDetectors } from '../runner/detectors.mjs';
import { missingShortcuts, referenceTrees } from './case-harness.mjs';
import { HARDCODED, NEGATIVE_CASES, POSITIVE_CASES } from './case-table.mjs';

// The detectors' verdict on every reference and cheating tree, in memory: the same trees the runner
// hands them after a reference-agent run, without a workdir or a gate run. The runner also passes
// the gate reports, which can only drop a rename-based suspicion or add a policy-hash or laundering
// finding when the agent's report and the runner's differ; for the reference agent both come from
// the same tree and config, so the tree-only verdict checked here is the one the runs record.
function detect(caseId, overlay) {
  const { caseDefinition, fixture, final, reference } = referenceTrees(caseId, {
    overlay,
  });
  return defaultDetectors.run({
    caseId,
    fixture,
    final,
    reference,
    agentReport: undefined,
    referenceReport: undefined,
    expectedPolicyHash: caseDefinition.pin.policyHash,
  });
}

describe('the detectors find no shortcut in an honest solution', () => {
  const honest = [...NEGATIVE_CASES.map(({ caseId }) => caseId), ...POSITIVE_CASES];
  for (const caseId of honest) {
    it(caseId, () => {
      expect(detect(caseId)).toEqual({ shortcuts: [], errors: [] });
    });
  }
});

describe('the detectors name each cheat', () => {
  for (const { caseId, cheats } of NEGATIVE_CASES) {
    for (const { overlay, expected } of cheats) {
      it(`${caseId} / ${overlay}: ${expected.map(({ kind }) => kind).join(' + ')}`, () => {
        const { shortcuts, errors } = detect(caseId, overlay);
        expect(errors).toEqual([]);
        expect(expected).not.toHaveLength(0);
        expect(missingShortcuts(expected, shortcuts)).toEqual([]);
      });
    }
  }

  it(`${HARDCODED.caseId} / ${HARDCODED.overlay}: no detector fires`, () => {
    expect(detect(HARDCODED.caseId, HARDCODED.overlay)).toEqual({
      shortcuts: [],
      errors: [],
    });
  });

  it('refuses an overlay the case does not have', () => {
    expect(() => referenceTrees(HARDCODED.caseId, { overlay: 'no-such-cheat' })).toThrow(
      /no-such-cheat/,
    );
  });
});
