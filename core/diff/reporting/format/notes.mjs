export function noteSectionLines(notes = []) {
  if (notes.length === 0) {
    return [];
  }
  return ['', 'Notes:', ...notes.map((note) => `${note.tool} (${note.snapshot}): ${note.message}`)];
}

export function noteSummaryText(notes = []) {
  if (notes.length === 0) {
    return undefined;
  }
  const tools = [...new Set(notes.map(({ tool }) => tool))].join(', ');
  return `Note: the project's tests fail on the base (${tools}), so its coverage, CRAP and mutation results are unknown there. Only added files and edited lines are judged on them.`;
}
