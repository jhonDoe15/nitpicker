import { pluralize } from './style.mjs';

const DIFF_COUNTS = ['base', 'head', 'new', 'resolved', 'unchanged', 'changedMetrics'];
const SNAPSHOT_COUNTS = ['total', 'enforceable', 'descriptive'];

function hasCount(tool, properties) {
  return properties.some((property) => Number(tool[property] ?? 0) > 0);
}

export function isActiveDiffTool(tool) {
  return tool.skippedBecause !== undefined || hasCount(tool, DIFF_COUNTS);
}

export function isActiveSnapshotTool(tool) {
  return tool.skippedBecause !== undefined || hasCount(tool, SNAPSHOT_COUNTS);
}

export function splitTools(tools, isActive) {
  const active = tools.filter(isActive);
  return { active, clean: tools.length - active.length };
}

export function cleanLine(clean) {
  return `${String(clean)} ${pluralize('analyzer', clean)} ran clean`;
}
