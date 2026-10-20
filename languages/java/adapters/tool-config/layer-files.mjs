import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { layerPmdRulesets } from './pmd-layers.mjs';

export const NITPICKER_RULESET = path.join(GRADLE_DIRECTORY, 'pmd-ruleset.xml');
export const TEST_RULESET = path.join(GRADLE_DIRECTORY, 'pmd-test-ruleset.xml');

export function pmdLayerFiles({ project, projectWins = true, assertionHelpers = [], directory }) {
  if (project === undefined && assertionHelpers.length === 0) {
    return { nitpicker: undefined, project: undefined, tests: undefined };
  }
  const layers = layerPmdRulesets({
    nitpickerPath: NITPICKER_RULESET,
    nitpickerText: readFileSync(NITPICKER_RULESET, 'utf8'),
    testText: readFileSync(TEST_RULESET, 'utf8'),
    projectText: project === undefined ? undefined : readFileSync(project, 'utf8'),
    projectWins,
    assertionHelpers,
  });
  mkdirSync(directory, { recursive: true });
  const nitpickerFile = path.join(directory, 'pmd-nitpicker.xml');
  writeFileSync(nitpickerFile, layers.nitpicker);
  if (layers.project === undefined) {
    return { nitpicker: nitpickerFile, project: undefined, tests: undefined };
  }
  const projectFile = path.join(directory, 'pmd-project.xml');
  writeFileSync(projectFile, layers.project);
  const testsFile = path.join(directory, 'pmd-test-rules.xml');
  writeFileSync(testsFile, layers.tests);
  return { nitpicker: nitpickerFile, project: projectFile, tests: testsFile };
}
