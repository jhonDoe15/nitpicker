import { cleanLine, isActiveSnapshotTool, splitTools } from './tool-table.mjs';

export function snapshotToolLines(tools = []) {
  if (tools.length === 0) {
    return [];
  }
  const { active, clean } = splitTools(tools, isActiveSnapshotTool);
  const rows = active.map((tool) => {
    const skipped =
      tool.skippedBecause === undefined ? '' : ` skipped (${tool.skippedBecause} failed)`;
    const counts = `${String(tool.enforceable)} enforceable, ${String(tool.descriptive)} descriptive`;
    return `  ${String(tool.name)}: ${counts}${skipped}`;
  });
  const cleanSummary = clean === 0 ? [] : [`  ${cleanLine(clean)}`];
  return ['By analyzer:', ...rows, ...cleanSummary];
}
