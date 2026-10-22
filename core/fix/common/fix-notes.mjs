export function rewrittenNote(tool, paths) {
  return paths.length === 0 ? [] : [`${tool} rewrote ${paths.join(', ')}`];
}

function keptAsIsNote(tool, paths) {
  return paths.length === 0
    ? []
    : [`${tool} left ${paths.join(', ')} as is: already unformatted before your change`];
}

function unformattableNote(tool, paths) {
  return paths.length === 0 ? [] : [`${tool} could not parse ${paths.join(', ')}`];
}

export function formatNotes(tool, { rewritten, keptAsIs, unformattable }) {
  return [
    ...rewrittenNote(tool, rewritten),
    ...keptAsIsNote(tool, keptAsIs),
    ...unformattableNote(tool, unformattable),
  ];
}
