import { existsSync } from 'node:fs';
import path from 'node:path';

export const JSCPD_PROJECT_FILE = '.jscpd.json';

export function precedenceLayers(precedence = ['nitpicker']) {
  const project = precedence.indexOf('project');
  const nitpicker = precedence.indexOf('nitpicker');
  return { usesProject: project !== -1, nitpickerFirst: nitpicker !== -1 && nitpicker < project };
}

function projectOptIn(tool) {
  return `"tools": { "${tool}": { "precedence": ["project", "nitpicker"] } }`;
}

export function missingProjectConfig(tool, looked) {
  return `"tools.${tool}.precedence" lists "project" but ${looked} is missing: create it, or remove "project" from tools.${tool}.precedence`;
}

export function ignoredConfigNotice(ignored, tool) {
  return `Ignoring ${ignored}; opt in with ${projectOptIn(tool)}`;
}

export function jscpdIgnoredNotices(config, projectRoot) {
  return existsSync(path.join(projectRoot, JSCPD_PROJECT_FILE)) &&
    !precedenceLayers(config.tools?.jscpd?.precedence).usesProject
    ? [ignoredConfigNotice(JSCPD_PROJECT_FILE, 'jscpd')]
    : [];
}
