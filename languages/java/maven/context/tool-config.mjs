import { existsSync } from 'node:fs';
import path from 'node:path';
import { PROJECT_TOOL_CONFIGS } from '../../adapters/gradle-presets.mjs';

export function toolConfigChoices(projectRoot, { toolPrecedence = {}, policyRoot } = {}) {
  return Object.fromEntries(
    [...PROJECT_TOOL_CONFIGS].map(([tool, file]) => {
      const precedence = toolPrecedence[tool] ?? ['nitpicker'];
      const projectConfig = path.join(policyRoot ?? projectRoot, file);
      if (precedence.includes('project') && !existsSync(projectConfig)) {
        throw new Error(`"tools.${tool}.precedence" lists "project" but ${file} is missing`);
      }
      return [
        tool,
        {
          nitpicker: precedence.includes('nitpicker'),
          project: precedence.includes('project') ? projectConfig : undefined,
        },
      ];
    }),
  );
}
