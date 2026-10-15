export function formatSeconds(elapsedMs) {
  return `${(elapsedMs / 1000).toFixed(3)}s`;
}

export function sumToolCount(tools, property) {
  return tools.reduce((total, tool) => total + tool[property], 0);
}

export function singleLine(value) {
  return String(value).replaceAll(/\s+/g, ' ').trim();
}
