import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultDetectors } from '../runner/detectors.mjs';
import { loadTree } from '../detectors/tree.mjs';
import { loadCase } from '../runner/run-case.mjs';
import { CASE_TIMEOUT_MS, missingShortcuts, runApplied } from '../cases/case-harness.mjs';
import { SCENARIO_CHEATS } from './cheat-table.mjs';

const scenariosDirectory = import.meta.dirname;
const enabled = process.env.NITPICKER_EVAL_SCENARIOS === '1';

// The trees the runner hands the detectors for a reference-agent run: the fixture, then the
// reference solution and then the cheat laid over it.
function detect(caseId, overlay) {
  const definition = loadCase(path.join(scenariosDirectory, caseId));
  const fixture = loadTree(definition.fixtureDirectory);
  const final = new Map(fixture);
  for (const folder of ['reference', path.join('cheats', overlay)]) {
    for (const [file, text] of loadTree(path.join(definition.directory, folder))) {
      final.set(file, text);
    }
  }
  return defaultDetectors.run({ caseId, fixture, final, preset: definition.preset });
}

describe('scenario cheat definitions', () => {
  it('lists every cheats directory and nothing else', () => {
    const listed = SCENARIO_CHEATS.flatMap(({ caseId, cheats }) =>
      cheats.map(({ overlay }) => `${caseId}/${overlay}`),
    );
    const present = readdirSync(scenariosDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap(({ name }) => {
        const cheats = path.join(scenariosDirectory, name, 'cheats');
        return existsSync(cheats) ? readdirSync(cheats).map((overlay) => `${name}/${overlay}`) : [];
      });
    expect(present.toSorted()).toEqual(listed.toSorted());
  });

  it('covers Python, Java and Kotlin', () => {
    const presets = SCENARIO_CHEATS.map(
      ({ caseId }) => loadCase(path.join(scenariosDirectory, caseId)).preset,
    );
    expect(presets.toSorted()).toEqual(['java', 'kotlin', 'python']);
  });

  it('names the finding of every gate-findings cheat and only of those', () => {
    const named = SCENARIO_CHEATS.flatMap(({ cheats }) =>
      cheats.map(({ overlay, outcome, finding }) => [overlay, outcome, typeof finding]),
    );
    expect(named).not.toHaveLength(0);
    expect(named).toEqual(
      named.map(([overlay, outcome]) => [
        overlay,
        outcome,
        outcome === 'gate-findings' ? 'string' : 'undefined',
      ]),
    );
  });
});

describe('the detectors name each scenario cheat (no gate run)', () => {
  for (const { caseId, cheats } of SCENARIO_CHEATS) {
    for (const { overlay, expected } of cheats) {
      it(`${caseId} / ${overlay}: ${expected.map(({ kind }) => kind).join(' + ')}`, () => {
        const { shortcuts, errors } = detect(caseId, overlay);
        expect(errors).toEqual([]);
        expect(expected).not.toHaveLength(0);
        expect(missingShortcuts(expected, shortcuts)).toEqual([]);
      });
    }
  }
});

describe.runIf(enabled)("the real gate's verdict on each scenario cheat", () => {
  for (const { caseId, cheats } of SCENARIO_CHEATS) {
    for (const { overlay, outcome, finding, expected } of cheats) {
      it(
        `${caseId} / ${overlay}: ${outcome}`,
        () => {
          const record = runApplied(caseId, { casesRoot: scenariosDirectory, overlay });
          const output = record.gate.final.output;
          expect(record.detectorErrors).toEqual([]);
          expect(record.outcome, output).toBe(outcome);
          expect(record.passed).toBe(false);
          expect(record.acceptance.passed, record.acceptance.output).toBe(true);
          expect(missingShortcuts(expected, record.shortcuts)).toEqual([]);
          if (outcome === 'shortcut') expect(record.gate.final.exit, output).toBe(0);
          else expect(output).toContain(finding);
        },
        CASE_TIMEOUT_MS,
      );
    }
  }
});
