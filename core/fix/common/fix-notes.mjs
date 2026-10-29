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

function undecodableNote(paths) {
  return paths.length === 0 ? [] : [`--fix left ${paths.join(', ')} as is: not UTF-8 text`];
}

export function formatNotes(tool, { rewritten, keptAsIs, unformattable, undecodable = [] }) {
  return [
    ...rewrittenNote(tool, rewritten),
    ...keptAsIsNote(tool, keptAsIs),
    ...unformattableNote(tool, unformattable),
    ...undecodableNote(undecodable),
  ];
}
