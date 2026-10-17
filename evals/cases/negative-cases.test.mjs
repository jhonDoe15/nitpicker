import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadTree } from '../detectors/tree.mjs';
import { loadCase } from '../runner/run-case.mjs';
import { casesDirectory, strictCleanRoot } from './case-harness.mjs';
import { HARDCODED, NEGATIVE_CASES } from './case-table.mjs';
import { CHEAT_RUNS_FOLDER, HONEST_RUN_FILE, cheatRunsOf } from './gate-runs.mjs';

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

      it('has one test file for its honest run and one for each cheat', () => {
        expect(existsSync(path.join(casesDirectory, caseId, HONEST_RUN_FILE))).toBe(true);
        const files = readdirSync(path.join(casesDirectory, caseId, CHEAT_RUNS_FOLDER));
        expect(files.toSorted()).toEqual(
          cheatRunsOf(caseId)
            .map((overlay) => `${overlay}.test.mjs`)
            .toSorted(),
        );
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
