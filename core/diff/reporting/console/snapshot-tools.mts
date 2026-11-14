import { cleanLine, isActiveSnapshotTool, splitTools } from './tool-table.mts';
import { fieldOf, listOf, textOf } from '../../../../shared/values/readers.mts';

export function snapshotToolLines(tools: unknown): string[] {
  const listed = listOf(tools);
  if (listed.length === 0) {
    return [];
  }
  const { active, clean } = splitTools(listed, isActiveSnapshotTool);
  const rows = active.map((tool) => {
    const cause = fieldOf(tool, 'skippedBecause');
    const skipped = cause === undefined ? '' : ` skipped (${textOf(cause)} failed)`;
    const counts = `${textOf(fieldOf(tool, 'enforceable'))} enforceable, ${textOf(fieldOf(tool, 'descriptive'))} descriptive`;
    return `  ${textOf(fieldOf(tool, 'name'))}: ${counts}${skipped}`;
  });
  const cleanSummary = clean === 0 ? [] : [`  ${cleanLine(clean)}`];
  return ['By analyzer:', ...rows, ...cleanSummary];
}
