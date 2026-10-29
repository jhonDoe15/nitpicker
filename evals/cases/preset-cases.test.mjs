import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CASE_TIMEOUT_MS, runApplied } from './case-harness.mjs';

// One small case per preset, each with a reference solution. The real gate runs on every one, so
// this needs uv (Python), Gradle and Maven on the PATH, network for their first downloads, and
// minutes per case. It is opt-in, like the scenario references.
const sampleCases = path.join(import.meta.dirname, '..', 'lib', 'test-support', 'cases');
const enabled = process.env.NITPICKER_EVAL_SCENARIOS === '1';

describe.runIf(enabled)('reference solutions of the sample case of each preset', () => {
  it.each(['python-sample', 'java-sample', 'kotlin-sample', 'maven-sample'])(
    '%s passes the gate, its acceptance tests and the shortcut detectors',
    (id) => {
      const record = runApplied(id, { casesRoot: sampleCases });
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
});
