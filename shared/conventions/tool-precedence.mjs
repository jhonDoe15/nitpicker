import { TROUBLESHOOTING_ANCHORS, withTroubleshooting } from '../messages/troubleshooting.mjs';

export function precedenceLayers(precedence = ['nitpicker']) {
  const project = precedence.indexOf('project');
  const nitpicker = precedence.indexOf('nitpicker');
  return { usesProject: project !== -1, nitpickerFirst: nitpicker !== -1 && nitpicker < project };
}

function projectOptIn(tool) {
  return `"tools": { "${tool}": { "precedence": ["project", "nitpicker"] } }`;
}

export function missingProjectConfig(tool, looked) {
  return withTroubleshooting(
    `"tools.${tool}.precedence" lists "project" but ${looked} is missing: create it, or remove "project" from tools.${tool}.precedence`,
    TROUBLESHOOTING_ANCHORS.projectToolConfigMissing,
  );
}

export function ignoredConfigNotice(ignored, tool) {
  return `Ignoring ${ignored}; opt in with ${projectOptIn(tool)}`;
}
