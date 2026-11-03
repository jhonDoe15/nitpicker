import { describe, expect, it } from 'vitest';
import { listCases } from '../runner/run-case.mjs';
import { CASE_TIMEOUT_MS, runApplied } from '../cases/case-harness.mjs';

const scenariosDirectory = import.meta.dirname;
const enabled = process.env.NITPICKER_EVAL_SCENARIOS === '1';

describe.runIf(enabled)('scenario reference solutions', () => {
  for (const { id } of listCases(scenariosDirectory)) {
    it(
      `${id} passes the gate, its acceptance tests and the shortcut detectors`,
      () => {
        const record = runApplied(id, { casesRoot: scenariosDirectory });
        expect(
          {
            outcome: record.outcome,
            acceptance: record.acceptance.passed,
            shortcuts: record.shortcuts,
            detectorErrors: record.detectorErrors,
          },
          record.gate.final.output,
        ).toEqual({
          outcome: 'passed',
          acceptance: true,
          shortcuts: [],
          detectorErrors: [],
        });
      },
      CASE_TIMEOUT_MS,
    );
  }
});
