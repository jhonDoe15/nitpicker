import { existsSync } from 'node:fs';
import path from 'node:path';

export const JSCPD_PROJECT_FILE = '.jscpd.json';

export function precedenceLayers(precedence = ['nitpicker']) {
  const project = precedence.indexOf('project');
  const nitpicker = precedence.indexOf('nitpicker');
  return { usesProject: project !== -1, nitpickerFirst: nitpicker !== -1 && nitpicker < project };
}

function shownSetting(value) {
  return Array.isArray(value)
    ? `[${value.map((item) => JSON.stringify(item)).join(', ')}]`
    : JSON.stringify(value);
}

function projectOptIn(tool, settings) {
  const merged = { ...settings, precedence: ['project', 'nitpicker'] };
  const shown = Object.entries(merged).map(([key, value]) => `"${key}": ${shownSetting(value)}`);
  return `"tools": { "${tool}": { ${shown.join(', ')} } }`;
}

export function missingProjectConfig(tool, looked) {
  return `"tools.${tool}.precedence" lists "project" but ${looked} is missing: create it, or remove "project" from tools.${tool}.precedence`;
}

export function ignoredConfigNotice(ignored, tool, settings = {}) {
  return `Ignoring ${ignored}; opt in with ${projectOptIn(tool, settings)}`;
}

export function jscpdIgnoredNotices(config, projectRoot) {
  return existsSync(path.join(projectRoot, JSCPD_PROJECT_FILE)) &&
    !precedenceLayers(config.tools?.jscpd?.precedence).usesProject
    ? [ignoredConfigNotice(JSCPD_PROJECT_FILE, 'jscpd')]
    : [];
}
