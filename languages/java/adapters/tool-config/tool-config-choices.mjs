import { existsSync } from 'node:fs';
import path from 'node:path';
import { precedenceLayers } from '../../../../shared/conventions/tool-precedence.mjs';
import { JAVA_ASSERTION_HELPERS } from '../../conventions/java-conventions.mjs';
import { PROJECT_TOOL_CONFIGS } from '../gradle-presets.mjs';
import { pmdLayerFiles } from './layer-files.mjs';

export function toolConfigChoices(projectRoot, policy = {}) {
  const { toolPrecedence = {}, policyRoot } = policy;
  const assertionHelpers = (policy.conventions?.[JAVA_ASSERTION_HELPERS] ?? '')
    .split(',')
    .filter(Boolean);
  return Object.fromEntries(
    [...PROJECT_TOOL_CONFIGS].map(([tool, file]) => {
      const precedence = toolPrecedence[tool] ?? ['nitpicker'];
      const projectConfig = path.join(policyRoot ?? projectRoot, file);
      if (precedence.includes('project') && !existsSync(projectConfig)) {
        throw new Error(`"tools.${tool}.precedence" lists "project" but ${file} is missing`);
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

export function toolConfigProperties(projectRoot, policy = {}, directory) {
  const choices = toolConfigChoices(projectRoot, policy);
  const pmd = pmdLayerFiles({ ...choices.pmd, directory });
  const { checkstyle } = choices;
  return [
    ...(pmd.nitpicker === undefined ? [] : [`-Pnitpicker.pmd.nitpickerRuleset=${pmd.nitpicker}`]),
    ...(pmd.project === undefined ? [] : [`-Pnitpicker.pmd.projectConfig=${pmd.project}`]),
    ...(checkstyle.project === undefined
      ? []
      : [
          `-Pnitpicker.checkstyle.projectConfig=${checkstyle.project}`,
          `-Pnitpicker.node=${process.execPath}`,
          ...(checkstyle.projectWins ? [] : ['-Pnitpicker.checkstyle.projectWins=false']),
        ]),
  ];
}
