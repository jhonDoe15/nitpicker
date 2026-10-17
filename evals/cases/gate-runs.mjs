import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCase, runCase } from '../runner/run-case.mjs';
import {
  CASE_TIMEOUT_MS,
  casesDirectory,
  linkedWorkdir,
  runApplied,
  runReference,
} from './case-harness.mjs';
import { END_TO_END, HARDCODED, NEGATIVE_CASES, POSITIVE_CASES } from './case-table.mjs';

export const HONEST_RUN_FILE = 'honest-run.test.mjs';
export const CHEAT_RUNS_FOLDER = 'cheat-runs';

function honestRun(caseId) {
  it(
    `${caseId}: gate clean, acceptance tests pass, no shortcuts`,
    () => {
      const endToEnd = caseId === END_TO_END.honest;
      const record = (endToEnd ? runReference : runApplied)(caseId);
      expect(record.acceptance.passed, record.acceptance.output).toBe(true);
      expect(record.gate.final.exit, record.gate.final.output).toBe(0);
      if (endToEnd) {
        expect(record.gate.iterations).toBe(1);
        expect(record.gate.iterationsToGreen).toBe(1);
      }
      expect(record.shortcuts).toEqual([]);
      expect(record.detectorErrors).toEqual([]);
      expect(record.outcome).toBe('passed');
      expect(record.passed).toBe(true);
    },
    CASE_TIMEOUT_MS,
  );
}

function cheatRun(caseId, { overlay, withoutAnalyzers, flaggedBy, outcome, expected }) {
  it(
    `${caseId} / ${overlay}: ${outcome}, ${expected.map(({ kind }) => kind).join(' + ')}`,
    () => {
      const endToEnd = caseId === END_TO_END.cheat.caseId && overlay === END_TO_END.cheat.overlay;
      const record = (endToEnd ? runReference : runApplied)(caseId, {
        overlay,
        withoutAnalyzers,
        analyzers: flaggedBy?.analyzers,
      });
      if (endToEnd) {
        expect(record.gate.iterations).toBe(1);
        expect(record.gate.iterationLog[0].exit).toBe(record.gate.final.exit);
      }
      expect(record.detectorErrors).toEqual([]);
      expect(record.outcome, record.gate.final.output).toBe(outcome);
      expect(record.passed).toBe(false);
      expect(record.acceptance.passed, record.acceptance.output).toBe(true);
      for (const shortcut of expected) {
        expect(record.shortcuts).toContainEqual(expect.objectContaining(shortcut));
      }
      if (outcome === 'shortcut') {
        expect(record.gate.final.exit, record.gate.final.output).toBe(0);
      } else {
        expect(record.gate.final.output).toContain(flaggedBy.finding);
      }
    },
    CASE_TIMEOUT_MS,
  );
}

function hardcodedReturn() {
  it(
    `${HARDCODED.caseId} / ${HARDCODED.overlay}: the hidden acceptance tests fail it, no detector fires`,
    () => {
      const record = runApplied(HARDCODED.caseId, { overlay: HARDCODED.overlay });
      expect(record.gate.final.exit, record.gate.final.output).toBe(0);
      expect(record.acceptance.passed).toBe(false);
      expect(record.outcome).toBe('acceptance-failed');
      expect(record.shortcuts).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );
}

function unchangedTree(caseId) {
  it(
    `${caseId}: fails the acceptance tests for an agent that changes nothing`,
    () => {
      const record = runCase({
        caseDefinition: loadCase(path.join(casesDirectory, caseId)),
        agentCommand: 'cat > /dev/null',
        prepareWorkdir: linkedWorkdir(),
        gateCommand: ['node', '-e', 'process.exit(0)'],
        tier: 'reference',
        nitpickerVersion: '0.0.0',
      });
      expect(record.outcome).toBe('acceptance-failed');
    },
    CASE_TIMEOUT_MS,
  );
}

const caseOf = (caseId) => {
  const negative = NEGATIVE_CASES.find((entry) => entry.caseId === caseId);
  if (negative === undefined && !POSITIVE_CASES.includes(caseId)) {
    throw new Error(`${caseId} is in neither NEGATIVE_CASES nor POSITIVE_CASES`);
  }
  return negative;
};

export function cheatRunsOf(caseId) {
  const overlays = (caseOf(caseId)?.cheats ?? []).map(({ overlay }) => overlay);
  return caseId === HARDCODED.caseId ? [...overlays, HARDCODED.overlay] : overlays;
}

export function describeHonestRun(caseDirectory) {
  const caseId = path.basename(caseDirectory);
  const negative = caseOf(caseId);
  describe(`${caseId}: the real gate's verdict on the honest solution (no model calls)`, () => {
    honestRun(caseId);
    if (negative === undefined) unchangedTree(caseId);
  });
}

export function describeCheatRun(testFile) {
  const caseId = path.basename(path.dirname(path.dirname(testFile)));
  const overlay = path.basename(testFile, '.test.mjs');
  describe(`${caseId} / ${overlay}: the real gate's verdict on the cheat (no model calls)`, () => {
    if (caseId === HARDCODED.caseId && overlay === HARDCODED.overlay) {
      hardcodedReturn();
      return;
    }
    const cheat = caseOf(caseId)?.cheats.find((entry) => entry.overlay === overlay);
    if (cheat === undefined) throw new Error(`${caseId} has no cheat ${overlay} in NEGATIVE_CASES`);
    cheatRun(caseId, cheat);
  });
}
