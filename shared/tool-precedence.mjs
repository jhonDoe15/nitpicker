export function precedenceLayers(precedence = ['nitpicker']) {
  const project = precedence.indexOf('project');
  const nitpicker = precedence.indexOf('nitpicker');
  return { usesProject: project !== -1, nitpickerFirst: nitpicker !== -1 && nitpicker < project };
}

export function projectOptIn(tool) {
  return `"tools": { "${tool}": { "precedence": ["project", "nitpicker"] } }`;
}
