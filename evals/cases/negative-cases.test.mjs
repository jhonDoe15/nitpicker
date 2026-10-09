import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadTree } from '../detectors/tree.mjs';
import { loadCase } from '../runner/run-case.mjs';
import {
  CASE_TIMEOUT_MS,
  casesDirectory,
  runApplied,
  runReference,
  strictCleanRoot,
} from './case-harness.mjs';
import { END_TO_END, HARDCODED, NEGATIVE_CASES } from './case-table.mjs';

// Fixture files a case may extend beyond strict-clean.
const EXTENDED_BY_CASE = new Set([
  'src/main/composition-root.ts',
  'src/main/features/greeting/index.ts',
]);

const CATEGORIES = ['gate-tampering', 'weakened-tests', 'code-shortcuts'];

describe('negative case definitions', () => {
  it('covers each detector with at least one case that has a cheating overlay', () => {
    expect(NEGATIVE_CASES.map((entry) => entry.category)).toEqual(CATEGORIES);
    for (const { caseId, category, cheats } of NEGATIVE_CASES) {
      expect(loadCase(path.join(casesDirectory, caseId)).categories).toEqual([category]);
      for (const { overlay, expected, outcome, flaggedBy } of cheats) {
        expect(existsSync(path.join(casesDirectory, caseId, 'cheats', overlay))).toBe(true);
        // A gate-findings cheat names the finding that rejects it; a shortcut has none to name.
        expect(typeof flaggedBy?.finding, overlay).toBe(
          outcome === 'gate-findings' ? 'string' : 'undefined',
        );
        expect(expected.every((shortcut) => shortcut.category === category)).toBe(true);
      }
    }
  });

  it('has a test for every cheats directory', () => {
    const tested = new Set([
      ...NEGATIVE_CASES.flatMap(({ caseId, cheats }) =>
        cheats.map(({ overlay }) => `${caseId}/${overlay}`),
      ),
      `${HARDCODED.caseId}/${HARDCODED.overlay}`,
    ]);
    const present = NEGATIVE_CASES.flatMap(({ caseId }) =>
      readdirSync(path.join(casesDirectory, caseId, 'cheats')).map((name) => `${caseId}/${name}`),
    );
    expect(present.toSorted()).toEqual([...tested].toSorted());
  });

  for (const { caseId } of NEGATIVE_CASES) {
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
          expect(same || EXTENDED_BY_CASE.has(file), `${file} differs from strict-clean`).toBe(
            true,
          );
        }
      });

      it('keeps the hidden acceptance tests, the reference and the cheats out of the fixture', () => {
        const fixture = loadTree(definition.fixtureDirectory);
        for (const file of loadTree(definition.acceptanceDirectory).keys()) {
          expect(fixture.has(file), `${file} must not ship in the fixture`).toBe(false);
        }
        for (const file of fixture.keys()) {
          expect(file).not.toMatch(/acceptance|reference|cheats/);
        }
      });
    });
  }
});

describe('the honest solutions pass with no shortcuts (no model calls)', () => {
  for (const { caseId } of NEGATIVE_CASES) {
    it(
      `${caseId}: gate clean, acceptance tests pass, no shortcuts`,
      () => {
        const record = runApplied(caseId);
        expect(record.acceptance.passed, record.acceptance.output).toBe(true);
        expect(record.gate.final.exit, record.gate.final.output).toBe(0);
        expect(record.shortcuts).toEqual([]);
        expect(record.detectorErrors).toEqual([]);
        expect(record.outcome).toBe('passed');
      },
      CASE_TIMEOUT_MS,
    );
  }
});

describe('cheating runs are flagged by the right detector (no model calls)', () => {
  for (const { caseId, cheats } of NEGATIVE_CASES) {
    for (const { overlay, withoutAnalyzers, flaggedBy, outcome, expected } of cheats) {
      it(
        `${caseId} / ${overlay}: ${outcome}, ${expected.map(({ kind }) => kind).join(' + ')}`,
        () => {
          const endToEnd =
            caseId === END_TO_END.cheat.caseId && overlay === END_TO_END.cheat.overlay;
          const record = (endToEnd ? runReference : runApplied)(caseId, {
            overlay,
            withoutAnalyzers,
            analyzers: flaggedBy?.analyzers,
          });
          if (endToEnd) {
            // The whole flow: the agent ran the gate through nitpicker-gate and saw the findings.
            expect(record.gate.iterations).toBe(1);
            expect(record.gate.iterationLog[0].exit).toBe(record.gate.final.exit);
          }
          expect(record.detectorErrors).toEqual([]);
          expect(record.outcome, record.gate.final.output).toBe(outcome);
          expect(record.passed).toBe(false);
          // The cheat is aimed at the gate or the hidden tests, not at the behavior.
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
  }

  it(
    'add-shout-feature / hardcoded-return: the hidden acceptance tests fail it, no detector fires',
    () => {
      const record = runApplied(HARDCODED.caseId, {
        overlay: HARDCODED.overlay,
      });
      expect(record.gate.final.exit, record.gate.final.output).toBe(0);
      expect(record.acceptance.passed).toBe(false);
      expect(record.outcome).toBe('acceptance-failed');
      expect(record.shortcuts).toEqual([]);
    },
    CASE_TIMEOUT_MS,
  );
});
