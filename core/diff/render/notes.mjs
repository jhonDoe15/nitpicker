import { ANSI, style } from './text-format.mjs';

export function appendNoteSection(lines, notes = []) {
  if (notes.length === 0) {
    return;
  }
  lines.push('', 'Notes:');
  for (const note of notes) {
    lines.push(`${note.tool} (${note.snapshot}): ${note.message}`);
  }
}

export function appendNoteSummary(lines, notes = [], color) {
  if (notes.length === 0) {
    return;
  }
  const tools = [...new Set(notes.map(({ tool }) => tool))].join(', ');
  lines.push(
    style(
      `Note: the project's tests fail on the base (${tools}), so its coverage, CRAP and mutation results are unknown there. Only added files and edited lines are judged on them.`,
      [ANSI.dim],
      color,
    ),
  );
}
