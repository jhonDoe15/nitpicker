import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadTree } from '../detectors/tree.mjs';
import { listCases, loadCase } from '../runner/run-case.mjs';
import { casesDirectory, strictCleanRoot } from './case-harness.mjs';
import { POSITIVE_CASES } from './case-table.mjs';
import { CHEAT_RUNS_FOLDER, HONEST_RUN_FILE } from './gate-runs.mjs';

// Fixture files a case may extend beyond strict-clean (the bug case wires its buggy function).
const EXTENDED_BY_CASE = new Set([
  'src/main/composition-root.ts',
  'src/main/features/greeting/index.ts',
]);

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
        const differing = [...strict]
          .filter(([file, text]) => fixture.get(file) !== text && !EXTENDED_BY_CASE.has(file))
          .map(([file]) => file);
        expect(differing).toEqual([]);
      });

      it('has one test file for its reference run and none for cheats', () => {
        expect(existsSync(path.join(casesDirectory, caseId, HONEST_RUN_FILE))).toBe(true);
        expect(existsSync(path.join(casesDirectory, caseId, CHEAT_RUNS_FOLDER))).toBe(false);
      });

      it('keeps the hidden acceptance tests and the reference out of the agent copy', () => {
        const fixture = loadTree(definition.fixtureDirectory);
        const acceptance = loadTree(definition.acceptanceDirectory);
        expect(acceptance.size).toBeGreaterThan(0);
        expect([...acceptance.keys()].filter((file) => fixture.has(file))).toEqual([]);
        expect(existsSync(path.join(definition.directory, 'reference'))).toBe(true);
        expect([...fixture.keys()].filter((file) => /acceptance|reference/.test(file))).toEqual([]);
      });
    });
  }
});
