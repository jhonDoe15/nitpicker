import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadTree } from '../detectors/tree.mjs';
import { listCases, loadCase, runCase } from '../runner/run-case.mjs';
import {
  CASE_TIMEOUT_MS,
  casesDirectory,
  linkedWorkdir,
  runReference,
  strictCleanRoot,
} from './case-harness.mjs';

// Fixture files a case may extend beyond strict-clean (the bug case wires its buggy function).
const EXTENDED_BY_CASE = new Set([
  'src/main/composition-root.ts',
  'src/main/features/greeting/index.ts',
]);

const POSITIVE_CASES = ['add-farewell-feature', 'fix-count-bug', 'add-greet-endpoint'];

describe('positive case definitions', () => {
  it('lists at least three positive cases besides the trivial runner case', () => {
    const ids = listCases(casesDirectory).map((entry) => entry.id);
    expect(ids).toEqual(expect.arrayContaining(POSITIVE_CASES));
  });

  for (const caseId of POSITIVE_CASES) {
    describe(caseId, () => {
      const definition = loadCase(path.join(casesDirectory, caseId));

      it('pins a preset version and has a prompt that names the gate and the test file', () => {
        expect(definition.pin.presetVersion).toBe('0.0.0');
        expect(definition.prompt).toContain('nitpicker-gate');
        expect(definition.prompt).toMatch(/test\/[\w-]+\.test\.ts/);
      });

      it('starts from the strict-clean fixture and changes only what the case needs', () => {
        const strict = loadTree(strictCleanRoot);
        strict.delete('package.json');
        const fixture = loadTree(definition.fixtureDirectory);
        for (const [file, text] of strict) {
          const same = fixture.get(file) === text;
          const extended = EXTENDED_BY_CASE.has(file);
          expect(same || extended, `${file} differs from strict-clean`).toBe(true);
        }
      });

      it('keeps the hidden acceptance tests and the reference out of the agent copy', () => {
        const fixture = loadTree(definition.fixtureDirectory);
        const acceptance = loadTree(definition.acceptanceDirectory);
        expect(acceptance.size).toBeGreaterThan(0);
        for (const file of acceptance.keys()) {
          expect(fixture.has(file), `${file} must not ship in the fixture`).toBe(false);
        }
        expect(existsSync(path.join(definition.directory, 'reference'))).toBe(true);
        for (const file of fixture.keys()) {
          expect(file).not.toMatch(/acceptance|reference/);
        }
      });
    });
  }
});

describe('the reference solutions pass the runner checks (no model calls)', () => {
  for (const caseId of POSITIVE_CASES) {
    it(
      `${caseId}: gate clean, acceptance tests pass, no shortcuts`,
      () => {
        const record = runReference(caseId);
        expect(record.acceptance.passed, record.acceptance.output).toBe(true);
        expect(record.gate.final.exit, record.gate.final.output).toBe(0);
        expect(record.gate.iterations).toBe(1);
        expect(record.gate.iterationsToGreen).toBe(1);
        expect(record.shortcuts).toEqual([]);
        expect(record.detectorErrors).toEqual([]);
        expect(record.outcome).toBe('passed');
        expect(record.passed).toBe(true);
      },
      CASE_TIMEOUT_MS,
    );
  }

  it(
    'fails the acceptance tests of every case for an agent that changes nothing',
    () => {
      for (const caseId of POSITIVE_CASES) {
        const record = runCase({
          caseDefinition: loadCase(path.join(casesDirectory, caseId)),
          agentCommand: 'cat > /dev/null',
          prepareWorkdir: linkedWorkdir(),
          gateCommand: ['node', '-e', 'process.exit(0)'],
          tier: 'reference',
          nitpickerVersion: '0.0.0',
        });
        expect(record.outcome, caseId).toBe('acceptance-failed');
      }
    },
    CASE_TIMEOUT_MS,
  );
});
