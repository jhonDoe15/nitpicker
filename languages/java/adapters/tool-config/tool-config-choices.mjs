import path from 'node:path';
import { existsSync } from 'node:fs';
import { resolveInside } from '../../../../shared/conventions/read-inside.mjs';
import {
  missingProjectConfig,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mjs';
import { JAVA_ASSERTION_HELPERS } from '../../conventions/java-conventions.mjs';
import { PROJECT_TOOL_CONFIGS } from '../gradle-presets.mjs';
import { mergeCheckstyleFiles } from './checkstyle/checkstyle-merge.mjs';
import { pmdLayerFiles } from './layer-files.mjs';

export function toolConfigChoices(projectRoot, policy = {}) {
  const { toolPrecedence = {}, policyRoot } = policy;
  const assertionHelpers = policy.conventions?.[JAVA_ASSERTION_HELPERS] ?? [];
  return Object.fromEntries(
    [...PROJECT_TOOL_CONFIGS].map(([tool, file]) => {
      const precedence = toolPrecedence[tool] ?? ['nitpicker'];
      const projectConfig = resolveInside(policyRoot ?? projectRoot, file);
      if (
        precedence.includes('project') &&
        (projectConfig === undefined || !existsSync(projectConfig))
      ) {
        throw new Error(missingProjectConfig(tool, file));
      }
      const layers = precedenceLayers(precedence);
      return [
        tool,
        {
          project: layers.usesProject ? projectConfig : undefined,
          projectWins: !layers.nitpickerFirst,
          ...(tool === 'pmd' ? { assertionHelpers } : {}),
        },
      ];
    }),
  );
}

function checkstyleProperties({ checkstyle, directory, checkstyleBase }) {
  if (checkstyle.project === undefined) {
    return [];
  }
  const merged = path.join(directory, 'checkstyle-merged.xml');
  mergeCheckstyleFiles({
    nitpicker: checkstyleBase,
    project: checkstyle.project,
    output: merged,
    projectWins: checkstyle.projectWins,
  });
  return [
    `-Pnitpicker.checkstyle.projectConfig=${checkstyle.project}`,
    `-Pnitpicker.checkstyle.mergedConfig=${merged}`,
  ];
}

export function toolConfigProperties(projectRoot, policy = {}, { directory, checkstyleBase }) {
  const choices = toolConfigChoices(projectRoot, policy);
  const pmd = pmdLayerFiles({ ...choices.pmd, directory });
  return [
    ...(pmd.nitpicker === undefined ? [] : [`-Pnitpicker.pmd.nitpickerRuleset=${pmd.nitpicker}`]),
    ...(pmd.project === undefined ? [] : [`-Pnitpicker.pmd.projectConfig=${pmd.project}`]),
    ...(pmd.tests === undefined ? [] : [`-Pnitpicker.pmd.testRules=${pmd.tests}`]),
    ...(pmd.main === undefined ? [] : [`-Pnitpicker.pmd.mainRules=${pmd.main}`]),
    ...checkstyleProperties({ checkstyle: choices.checkstyle, directory, checkstyleBase }),
  ];
}
