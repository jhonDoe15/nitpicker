import { describe, expect, it } from 'vitest';
import { defaultDetectors } from '../runner/detectors.mts';
import { missingShortcuts, referenceTrees } from './case-harness.mts';
import { HARDCODED, NEGATIVE_CASES, POSITIVE_CASES } from './case-table.mts';

function detectInMemoryAsTheRunnerWould(
  caseId: string,
  overlay?: string,
): ReturnType<typeof defaultDetectors.run> {
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
    expectedPolicyHash: caseDefinition.pin['policyHash'],
  });
}

describe('the detectors find no shortcut in an honest solution', () => {
  const honest = [...NEGATIVE_CASES.map(({ caseId }) => caseId), ...POSITIVE_CASES];
  for (const caseId of honest) {
    it(caseId, () => {
      expect(detectInMemoryAsTheRunnerWould(caseId)).toEqual({ shortcuts: [], errors: [] });
    });
  }
});

describe('the detectors name each cheat', () => {
  for (const { caseId, cheats } of NEGATIVE_CASES) {
    for (const { overlay, expected } of cheats) {
      it(`${caseId} / ${overlay}: ${expected.map(({ kind }) => kind).join(' + ')}`, () => {
        const { shortcuts, errors } = detectInMemoryAsTheRunnerWould(caseId, overlay);
        expect(errors).toEqual([]);
        expect(expected).not.toHaveLength(0);
        expect(missingShortcuts(expected, shortcuts)).toEqual([]);
      });
    }
  }

  it(`${HARDCODED.caseId} / ${HARDCODED.overlay}: no detector fires`, () => {
    expect(detectInMemoryAsTheRunnerWould(HARDCODED.caseId, HARDCODED.overlay)).toEqual({
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
